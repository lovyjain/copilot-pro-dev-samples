import { AzureOpenAI } from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export interface ToolDefinition {
  name: string
  description?: string
  /** JSON Schema, as returned by MCP listTools. */
  parameters: Record<string, unknown>
}

export interface LlmResponse {
  content?: string
  toolCalls?: ToolCall[]
}

export interface LlmClient {
  complete(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LlmResponse>
}

export interface AzureOpenAiOptions {
  endpoint: string
  apiKey: string
  deployment: string
  apiVersion: string
}

export class AzureOpenAiLlm implements LlmClient {
  private readonly client: AzureOpenAI
  private readonly deployment: string

  constructor(options: AzureOpenAiOptions) {
    this.client = new AzureOpenAI({
      endpoint: options.endpoint,
      apiKey: options.apiKey,
      apiVersion: options.apiVersion
    })
    this.deployment = options.deployment
  }

  async complete(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LlmResponse> {
    const apiMessages: ChatCompletionMessageParam[] = messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' }
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: 'function' as const,
            function: { name: c.name, arguments: JSON.stringify(c.arguments) }
          }))
        }
      }
      return { role: m.role, content: m.content }
    })

    const apiTools: ChatCompletionTool[] = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }))

    const response = await this.client.chat.completions.create({
      model: this.deployment,
      temperature: 0.2,
      messages: apiMessages,
      tools: apiTools.length ? apiTools : undefined
    })

    const choice = response.choices[0]?.message
    const toolCalls = (choice?.tool_calls ?? [])
      .filter((c) => c.type === 'function')
      .map((c) => ({
        id: c.id,
        name: c.function.name,
        arguments: safeParseArgs(c.function.arguments)
      }))

    return {
      content: choice?.content ?? undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined
    }
  }
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Deterministic rule-based LLM stand-in so the whole agent runs offline with
 * zero credentials. It produces genuine multi-step tool traces: proposals
 * trigger conflict detection followed by a record lookup; questions trigger
 * search followed by a record lookup.
 */
export class FakeLlm implements LlmClient {
  private callCounter = 0

  async complete(messages: ChatMessage[]): Promise<LlmResponse> {
    const userText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const toolResults = messages.filter((m) => m.role === 'tool')
    const calledTools = messages
      .filter((m) => m.role === 'assistant' && m.toolCalls?.length)
      .flatMap((m) => m.toolCalls!)

    const looksLikeProposal = /\b(propos(e|ing|al)|we want|we plan|plan(ning)? to|let'?s (use|add|adopt)|thinking of|should we)\b/i.test(userText)
    const mentionedId = userText.match(/DR-\d{3}/i)?.[0]?.toUpperCase()
    const recordRequest = this.extractRecordRequest(userText)
    const createDraftRequest = /\b(create|start|make)\b.*\b(new\s+)?(decision|draft)\b|\b(anyway|still)\s+create\b/i.test(
      userText
    )
    const hasStructuredDraftFields = this.parseDraftFields(userText).presentCount > 0

    const statusVerb = userText.match(/\b(accept|approve|deprecate|reject)\b/i)?.[1]?.toLowerCase()

    // First step of a turn: pick the entry tool.
    if (toolResults.length === 0) {
      if (recordRequest || createDraftRequest || hasStructuredDraftFields) {
        return this.call('create_decision', this.draftFromConversation(messages, userText, recordRequest?.title))
      }
      if (statusVerb && mentionedId) {
        return this.call('update_decision_status', {
          id: mentionedId,
          status: statusVerb === 'accept' || statusVerb === 'approve' ? 'accepted' : 'deprecated'
        })
      }
      if (looksLikeProposal) {
        return this.call('find_conflicting_decisions', { proposal: userText })
      }
      if (mentionedId) {
        return this.call('get_decision', { id: mentionedId })
      }
      return this.call('search_decisions', { query: userText })
    }

    // Follow-up step: drill into the top result once, then answer.
    const lastCall = calledTools[calledTools.length - 1]
    const lastResult = parseToolJson(toolResults[toolResults.length - 1].content)

    if (lastCall?.name === 'find_conflicting_decisions' && Array.isArray(lastResult) && lastResult.length > 0) {
      const top = lastResult[0] as { id: string; title: string }
      return this.call('get_decision', { id: top.id })
    }
    if (lastCall?.name === 'search_decisions' && Array.isArray(lastResult) && lastResult.length > 0) {
      const top = lastResult[0] as { id: string }
      return this.call('get_decision', { id: top.id })
    }
    if (lastCall?.name === 'get_decision' && lastResult && !Array.isArray(lastResult)) {
      const record = lastResult as {
        id: string
        title: string
        rationale?: string
        status?: string
        supersededBy?: string
      }
      const conflictContext = calledTools.some((c) => c.name === 'find_conflicting_decisions')
      if (conflictContext) {
        return {
          content:
            `Heads up: this proposal appears to conflict with ${record.id} ("${record.title}", status: ${record.status}). ` +
            `Recorded rationale: ${record.rationale ?? 'see the decision record.'} ` +
            `If you still want to proceed, the standing decision requires an approved exception via a new decision record.`
        }
      }
      // Superseded record: follow the chain to the decision currently in force.
      if (record.status === 'superseded' && record.supersededBy) {
        return this.call('get_decision', { id: record.supersededBy })
      }
      const supersededHop = this.findSupersededHop(toolResults, record.id)
      if (supersededHop) {
        return {
          content:
            `${supersededHop.id} ("${supersededHop.title}") is no longer in force — it was superseded by ${record.id}. ` +
            `The current standard is ${record.id} ("${record.title}"): ${record.rationale ?? 'see the decision record.'} [source: ${record.id}]`
        }
      }
      return {
        content: `According to ${record.id} ("${record.title}"): ${record.rationale ?? 'see the decision record for details.'} [source: ${record.id}]`
      }
    }

    return {
      content:
        "I couldn't find a recorded decision about that. It may simply never have been written down — I can help you draft a new decision record if you'd like."
    }
  }

  private call(name: string, args: Record<string, unknown>): LlmResponse {
    this.callCounter += 1
    return { toolCalls: [{ id: `fake-${this.callCounter}`, name, arguments: args }] }
  }

  private extractRecordRequest(text: string): { title?: string } | undefined {
    const match = text.match(/\brecord(?:\s+a)?\s+decision\b[:\s-]*(.*)$/i)
    if (!match) return undefined
    const title = match[1]?.trim()
    return title ? { title } : {}
  }

  /** The earlier tool result in this turn that was a superseded record, if any. */
  private findSupersededHop(
    toolResults: ChatMessage[],
    currentId: string
  ): { id: string; title: string } | undefined {
    for (const message of toolResults) {
      const parsed = parseToolJson(message.content) as
        | { id?: string; title?: string; status?: string }
        | undefined
      if (parsed?.status === 'superseded' && parsed.id && parsed.id !== currentId) {
        return { id: parsed.id, title: parsed.title ?? parsed.id }
      }
    }
    return undefined
  }

  /** Build a valid create_decision draft from recent user messages in the conversation. */
  private draftFromConversation(
    messages: ChatMessage[],
    currentUserText: string,
    requestedTitle?: string
  ): Record<string, unknown> {
    const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content)
    const parsed = this.collectDraftFields(userMessages)
    const title =
      this.normalizeTitle(requestedTitle) ??
      this.normalizeTitle(parsed.title) ??
      this.normalizeTitle(this.findLatestRequestedTitle(userMessages)) ??
      'Untitled decision draft'
    const area = parsed.area ?? this.inferArea([currentUserText, ...userMessages]) ?? 'general'
    const deciders = parsed.deciders?.length ? parsed.deciders : ['Proposed via Decision Memory agent']
    const context =
      parsed.context ?? `Drafted from a conversational request: "${currentUserText.trim()}"`
    const decision = parsed.decision ?? `It was decided to: ${title}.`
    const rationale =
      parsed.rationale ?? 'Drafted in conversation; rationale to be refined by the deciders before acceptance.'
    const alternatives = parsed.alternativesConsidered ?? []
    const tags = parsed.tags?.length ? parsed.tags : [area, 'draft']

    return {
      title,
      area,
      deciders,
      context,
      decision,
      rationale,
      alternativesConsidered: alternatives,
      tags
    }
  }

  private findLatestRequestedTitle(userMessages: string[]): string | undefined {
    for (let i = userMessages.length - 1; i >= 0; i--) {
      const title = this.extractRecordRequest(userMessages[i])?.title
      if (title?.trim()) return title
    }
    return undefined
  }

  private normalizeTitle(raw?: string): string | undefined {
    if (!raw) return undefined
    const cleaned = raw.trim().replace(/[.\s]+$/, '')
    if (cleaned.length < 5) return undefined
    return cleaned[0].toUpperCase() + cleaned.slice(1)
  }

  private inferArea(texts: string[]): string | undefined {
    const joined = texts.join(' ').toLowerCase()
    if (/\b(ai|llm|model|gpt|grok|claude)\b/.test(joined)) return 'ai'
    if (/\b(api|graphql|rest)\b/.test(joined)) return 'api'
    if (/\b(data|database|postgres|mongo)\b/.test(joined)) return 'data'
    if (/\b(security|gdpr|pii|privacy)\b/.test(joined)) return 'security'
    if (/\b(platform|infra|kubernetes|aks|service bus|messaging)\b/.test(joined)) return 'infrastructure'
    return undefined
  }

  private collectDraftFields(userMessages: string[]): {
    title?: string
    area?: string
    deciders?: string[]
    context?: string
    decision?: string
    rationale?: string
    alternativesConsidered?: string[]
    tags?: string[]
  } {
    const collected: {
      title?: string
      area?: string
      deciders?: string[]
      context?: string
      decision?: string
      rationale?: string
      alternativesConsidered?: string[]
      tags?: string[]
    } = {}

    for (const text of userMessages) {
      const fields = this.parseDraftFields(text)
      if (fields.title) collected.title = fields.title
      if (fields.area) collected.area = fields.area
      if (fields.deciders?.length) collected.deciders = fields.deciders
      if (fields.context) collected.context = fields.context
      if (fields.decision) collected.decision = fields.decision
      if (fields.rationale) collected.rationale = fields.rationale
      if (fields.alternativesConsidered) collected.alternativesConsidered = fields.alternativesConsidered
      if (fields.tags?.length) collected.tags = fields.tags
    }

    return collected
  }

  private parseDraftFields(text: string): {
    title?: string
    area?: string
    deciders?: string[]
    context?: string
    decision?: string
    rationale?: string
    alternativesConsidered?: string[]
    tags?: string[]
    presentCount: number
  } {
    const fieldMarkers =
      '(?:title|area|deciders?|context|decision|rationale|alternatives?\\s+considered|tags?)'
    const extract = (aliases: string[]): string | undefined => {
      const aliasPattern = aliases.map((a) => a.replace(/\s+/g, '\\s+')).join('|')
      const rx = new RegExp(
        `(?:^|\\b)(?:${aliasPattern})\\s*:\\s*([\\s\\S]*?)(?=\\b${fieldMarkers}\\s*:|$)`,
        'i'
      )
      const match = text.match(rx)
      const value = match?.[1]?.trim()
      return value ? value.replace(/\s{2,}/g, ' ') : undefined
    }
    const splitList = (value?: string): string[] | undefined => {
      if (!value) return undefined
      const items = value
        .split(/[;,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      return items.length ? items : undefined
    }

    const title = extract(['title'])
    const area = extract(['area'])?.toLowerCase()
    const deciders = splitList(extract(['decider', 'deciders']))
    const context = extract(['context'])
    const decision = extract(['decision'])
    const rationale = extract(['rationale'])
    const alternativesConsidered = splitList(extract(['alternatives considered', 'alternatives']))
    const tags = splitList(extract(['tags', 'tag']))?.map((t) => t.toLowerCase())

    const presentCount = [title, area, deciders, context, decision, rationale, alternativesConsidered, tags].filter(
      (value) => value !== undefined
    ).length

    return {
      title,
      area,
      deciders,
      context,
      decision,
      rationale,
      alternativesConsidered,
      tags,
      presentCount
    }
  }
}

export function parseToolJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
