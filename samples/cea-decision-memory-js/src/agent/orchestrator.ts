import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  AdaptiveCard,
  conflictCard,
  ConflictSummary,
  decisionCard,
  DecisionListItem,
  decisionListCard
} from './cards.js'
import { conflictMarkdown, decisionListMarkdown, decisionMarkdown } from './markdown.js'
import { ChatMessage, LlmClient, parseToolJson, ToolCall, ToolDefinition } from './llm.js'
import { SYSTEM_PROMPT } from './prompts.js'
import { DecisionRecordSchema } from '../store/types.js'

const MAX_ITERATIONS = 6
const HISTORY_LIMIT_MESSAGES = 12 // keep the latest 6 user-assistant turns
const CONFIRM_PATTERN = /^\s*(yes|confirm|confirmed|go ahead|do it|record it|save it)\b/i
const CANCEL_PATTERN = /^\s*(no|cancel|stop|don'?t|nevermind|never mind)\b/i
// "Yes, but change the area first" must never execute the unmodified write.
const QUALIFIED_PATTERN = /\b(but|except|however|instead|actually|wait|first|unless|although|change|update|modify|edit|rename|different)\b/i

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolTraceEntry {
  tool: string
  arguments: Record<string, unknown>
  ok: boolean
}

export interface OrchestratorResult {
  text: string
  cards: AdaptiveCard[]
  /**
   * Plain-Markdown rendering of the same detail the cards carry, for surfaces
   * that flatten Adaptive Card attachments (M365 Copilot). Undefined when the
   * turn produced no card-worthy content.
   */
  markdown?: string
  toolTrace: ToolTraceEntry[]
}

/** Tools that modify the decision store; they always require confirmation. */
export type WriteTool = 'create_decision' | 'update_decision_status'
const WRITE_TOOLS: ReadonlySet<string> = new Set<WriteTool>(['create_decision', 'update_decision_status'])

/**
 * Best-effort human-readable reason from a failed tool result. Our tool
 * handlers return JSON `{ error }`, but the MCP SDK's own input-schema
 * validation rejects bad arguments BEFORE the handler runs, returning a
 * non-JSON string like
 *   `MCP error -32602: Input validation error: ... [<zod issues>]`.
 * Without unpacking that, such failures surfaced to the user as the opaque
 * "the decision store rejected it" fallback.
 */
function toolErrorReason(resultText: string, fallback: string): string {
  const parsed = parseToolJson(resultText)
  if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
    return String((parsed as { error: unknown }).error)
  }
  const text = (resultText ?? '').trim()
  if (!text || text === '{}') return fallback
  // MCP input-validation errors embed a JSON array of Zod issues.
  const arrayStart = text.indexOf('[')
  if (arrayStart >= 0) {
    const issues = parseToolJson(text.slice(arrayStart))
    if (Array.isArray(issues) && issues.length > 0) {
      const summary = issues
        .map((issue) => {
          const i = issue as { path?: unknown[]; message?: unknown }
          const path = Array.isArray(i.path) ? i.path.join('.') : ''
          const message = typeof i.message === 'string' ? i.message : 'invalid value'
          return path ? `${path}: ${message}` : message
        })
        .join('; ')
      if (summary) return `the request had invalid fields — ${summary}`
    }
  }
  return fallback
}

/** Per-conversation state the host persists between turns. */
export interface ConversationMemory {
  pendingWrite?: { tool: WriteTool; arguments: Record<string, unknown> }
  history?: ConversationTurn[]
}

export class Orchestrator {
  private tools?: ToolDefinition[]

  constructor(
    private readonly llm: LlmClient,
    private readonly mcp: Client
  ) {}

  private async listTools(): Promise<ToolDefinition[]> {
    if (!this.tools) {
      const { tools } = await this.mcp.listTools()
      this.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object' }
      }))
    }
    return this.tools
  }

  async run(userText: string, memory: ConversationMemory = {}): Promise<OrchestratorResult> {
    // A pending write confirmation is resolved deterministically, without
    // the LLM, so a write can never happen on model whim alone.
    if (memory.pendingWrite) {
      if (CONFIRM_PATTERN.test(userText)) {
        if (QUALIFIED_PATTERN.test(userText)) {
          memory.pendingWrite = undefined
          const result = {
            text:
              "I haven't saved anything — it sounds like you want changes first. " +
              'Tell me the corrected version and I’ll draft it again, or repeat the request once you’ve decided.',
            cards: [],
            toolTrace: []
          }
          this.rememberTurn(memory, userText, result.text)
          return result
        }
        const result = await this.executePendingWrite(memory)
        this.rememberTurn(memory, userText, result.text)
        return result
      }
      if (CANCEL_PATTERN.test(userText)) {
        const wasCreate = memory.pendingWrite.tool === 'create_decision'
        memory.pendingWrite = undefined
        const result = {
          text: wasCreate ? "Okay, I won't record that decision." : "Okay, I'll leave the status as it is.",
          cards: [],
          toolTrace: []
        }
        this.rememberTurn(memory, userText, result.text)
        return result
      }
      memory.pendingWrite = undefined // a different question cancels the pending write
    }

    const tools = await this.listTools()
    const history = memory.history ?? []
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userText }
    ]
    const toolTrace: ToolTraceEntry[] = []
    const cards: AdaptiveCard[] = []
    const markdownParts: string[] = []
    let listCard: AdaptiveCard | undefined
    let listMarkdown: string | undefined
    let finalText: string | undefined

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.llm.complete(messages, tools)

      if (!response.toolCalls?.length) {
        const content = response.content?.trim()
        finalText = content && content.length > 0 ? content : undefined
        break
      }

      messages.push({ role: 'assistant', content: response.content ?? '', toolCalls: response.toolCalls })

      for (const call of response.toolCalls) {
        if (WRITE_TOOLS.has(call.name)) {
          // Dry-run the write first so the user is never asked to confirm
          // something the store will reject (seed record, duplicate title,
          // unknown id, broken supersession chain, ...).
          const dry = await this.dispatch({
            id: 'dry-run',
            name: call.name,
            arguments: { ...call.arguments, dryRun: true }
          })
          if (!dry.ok) {
            const reason = toolErrorReason(dry.resultText, 'the decision store rejected it')
            const result = { text: `I can't do that: ${reason}`, cards, toolTrace }
            this.rememberTurn(memory, userText, result.text)
            return result
          }
          memory.pendingWrite = { tool: call.name as WriteTool, arguments: call.arguments }
          const result = {
            text: this.describePendingWrite(memory.pendingWrite),
            cards,
            toolTrace
          }
          this.rememberTurn(memory, userText, result.text)
          return result
        }

        const { resultText, ok } = await this.dispatch(call)
        toolTrace.push({ tool: call.name, arguments: call.arguments, ok })
        messages.push({ role: 'tool', content: resultText, toolCallId: call.id })

        const built = this.buildCards(call, resultText, userText)
        if (built.listCard) listCard = built.listCard
        if (built.listMarkdown) listMarkdown = built.listMarkdown
        cards.push(...built.cards)
        if (built.markdown) markdownParts.push(built.markdown)
      }
    }

    // A search-results view is only a fallback; drop it when a richer decision
    // or conflict view was produced in the same turn.
    const allCards = cards.length > 0 ? cards : listCard ? [listCard] : []
    const allMarkdown = markdownParts.length > 0 ? markdownParts.join('\n\n') : listMarkdown

    const result = {
      text:
        (finalText && finalText.trim().length > 0 ? finalText : undefined) ??
        'I gathered the relevant decision records, but ran out of reasoning steps to summarize them — the details are below.',
      cards: allCards,
      markdown: allMarkdown,
      toolTrace
    }
    this.rememberTurn(memory, userText, result.text)
    return result
  }

  private rememberTurn(memory: ConversationMemory, userText: string, assistantText: string): void {
    const user = userText.trim()
    const assistant = assistantText.trim()
    if (!user || !assistant) return

    const history = memory.history ?? []
    history.push({ role: 'user', content: user }, { role: 'assistant', content: assistant })
    if (history.length > HISTORY_LIMIT_MESSAGES) {
      history.splice(0, history.length - HISTORY_LIMIT_MESSAGES)
    }
    memory.history = history
  }

  private async dispatch(call: ToolCall): Promise<{ resultText: string; ok: boolean }> {
    try {
      const result = await this.mcp.callTool({ name: call.name, arguments: call.arguments })
      const content = Array.isArray(result.content) ? result.content : []
      const text = content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
      return { resultText: text || '{}', ok: !result.isError }
    } catch (err) {
      // Errors flow back to the model as tool output so it can recover or
      // explain, instead of crashing the turn.
      const message = err instanceof Error ? err.message : String(err)
      return { resultText: JSON.stringify({ error: message }), ok: false }
    }
  }

  private buildCards(
    call: ToolCall,
    resultText: string,
    userText: string
  ): { cards: AdaptiveCard[]; markdown?: string; listCard?: AdaptiveCard; listMarkdown?: string } {
    const parsed = parseToolJson(resultText)
    if (parsed === undefined || (typeof parsed === 'object' && parsed !== null && 'error' in parsed)) {
      return { cards: [] }
    }

    if (call.name === 'get_decision') {
      const record = DecisionRecordSchema.safeParse(parsed)
      return record.success
        ? { cards: [decisionCard(record.data)], markdown: decisionMarkdown(record.data) }
        : { cards: [] }
    }

    if (call.name === 'find_conflicting_decisions' && Array.isArray(parsed) && parsed.length > 0) {
      const top = parsed[0] as ConflictSummary
      const proposal = typeof call.arguments.proposal === 'string' ? call.arguments.proposal : userText
      return { cards: [conflictCard(top, proposal)], markdown: conflictMarkdown(top, proposal) }
    }

    if ((call.name === 'search_decisions' || call.name === 'list_decisions') && Array.isArray(parsed) && parsed.length > 0) {
      const items = parsed as DecisionListItem[]
      const heading =
        call.name === 'search_decisions'
          ? `Decisions matching "${String(call.arguments.query ?? userText)}"`
          : 'Decision records'
      return { cards: [], listCard: decisionListCard(items, heading), listMarkdown: decisionListMarkdown(items, heading) }
    }

    return { cards: [] }
  }

  private describePendingWrite(pending: NonNullable<ConversationMemory['pendingWrite']>): string {
    const args = pending.arguments
    if (pending.tool === 'update_decision_status') {
      const id = typeof args.id === 'string' ? args.id.toUpperCase() : 'the decision'
      const status = typeof args.status === 'string' ? args.status : 'accepted'
      return (
        `I'm ready to mark ${id} as **${status}**` +
        (status === 'accepted' ? ' — it will be in force and weigh into conflict checks.' : ' — the draft will be rejected.') +
        `\n\nReply **yes** to apply, or **no** to leave it as it is.`
      )
    }
    const title = typeof args.title === 'string' ? args.title : 'untitled decision'
    const area = typeof args.area === 'string' ? args.area : 'unspecified area'
    return (
      `I'm ready to record this decision as a draft (status "proposed"):\n\n` +
      `**${title}** (area: ${area})\n\n` +
      `Reply **yes** to save it to the decision store, or **no** to discard it.`
    )
  }

  private async executePendingWrite(memory: ConversationMemory): Promise<OrchestratorResult> {
    const pending = memory.pendingWrite!
    memory.pendingWrite = undefined
    const { resultText, ok } = await this.dispatch({ id: 'confirmed-write', name: pending.tool, arguments: pending.arguments })
    const toolTrace = [{ tool: pending.tool, arguments: pending.arguments, ok }]

    const parsed = parseToolJson(resultText)
    const record = DecisionRecordSchema.safeParse(parsed)
    if (ok && record.success) {
      const text =
        pending.tool === 'create_decision'
          ? `Recorded ${record.data.id} ("${record.data.title}") as a proposed decision.`
          : `${record.data.id} ("${record.data.title}") is now ${record.data.status}.`
      return { text, cards: [decisionCard(record.data)], markdown: decisionMarkdown(record.data), toolTrace }
    }
    const error =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : toolErrorReason(resultText, 'the decision store rejected the change')
    const failure = pending.tool === 'create_decision' ? "I couldn't record the decision" : "I couldn't change the status"
    return { text: `${failure}: ${error}`, cards: [], toolTrace }
  }
}
