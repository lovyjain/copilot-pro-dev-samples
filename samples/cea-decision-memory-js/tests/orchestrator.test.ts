import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { FakeLlm, LlmClient, LlmResponse } from '../src/agent/llm.js'
import { ConversationMemory, Orchestrator } from '../src/agent/orchestrator.js'
import { createInProcessMcp } from '../src/mcp/client.js'
import { DecisionStore } from '../src/store/decisionStore.js'

async function newOrchestrator(llm: LlmClient) {
  const store = DecisionStore.fromFile(path.resolve('data/decisions.seed.json'))
  const mcp = await createInProcessMcp(store)
  return new Orchestrator(llm, mcp)
}

/** Replays a fixed script of responses, then keeps emitting the last one. */
class ScriptedLlm implements LlmClient {
  private step = 0
  constructor(private readonly script: LlmResponse[]) {}
  async complete(): Promise<LlmResponse> {
    const response = this.script[Math.min(this.step, this.script.length - 1)]
    this.step += 1
    return response
  }
}

class MemoryAssertingLlm implements LlmClient {
  private step = 0

  async complete(messages: Array<{ role: string; content: string }>): Promise<LlmResponse> {
    if (this.step === 0) {
      this.step += 1
      return { content: 'First reply' }
    }

    const sawPreviousTurn = messages.some((m) => m.role === 'user' && /first question/i.test(m.content))
    this.step += 1
    return { content: sawPreviousTurn ? 'History available' : 'History missing' }
  }
}

const CREATE_ARGS = {
  title: 'Adopt Playwright for end-to-end tests',
  area: 'engineering',
  deciders: ['QA Guild'],
  context: 'E2E suites are flaky and slow on the current framework.',
  decision: 'New end-to-end tests are written in Playwright.',
  rationale: 'Faster, less flaky, better tracing.',
  alternativesConsidered: ['Cypress'],
  tags: ['engineering', 'testing']
}

describe('Orchestrator', () => {
  it('runs a multi-step tool chain for a proposal and returns a conflict card', async () => {
    const orchestrator = await newOrchestrator(new FakeLlm())
    const result = await orchestrator.run("We're proposing to use MongoDB for the orders service")

    expect(result.toolTrace.map((t) => t.tool)).toEqual(['find_conflicting_decisions', 'get_decision'])
    expect(result.toolTrace.every((t) => t.ok)).toBe(true)
    expect(result.text).toContain('DR-003')
    expect(JSON.stringify(result.cards)).toContain('Possible conflict with DR-003')
  })

  it('recovers when a tool errors instead of crashing the turn', async () => {
    const orchestrator = await newOrchestrator(
      new ScriptedLlm([
        { toolCalls: [{ id: '1', name: 'get_decision', arguments: { id: 'DR-999' } }] },
        { content: 'No such decision exists.' }
      ])
    )
    const result = await orchestrator.run('Show DR-999')
    expect(result.toolTrace).toEqual([{ tool: 'get_decision', arguments: { id: 'DR-999' }, ok: false }])
    expect(result.text).toBe('No such decision exists.')
    expect(result.cards).toHaveLength(0)
  })

  it('stops at the max-iteration guard when the model loops on tools', async () => {
    const orchestrator = await newOrchestrator(
      new ScriptedLlm([{ toolCalls: [{ id: 'loop', name: 'list_decisions', arguments: {} }] }])
    )
    const result = await orchestrator.run('list everything forever')
    expect(result.toolTrace).toHaveLength(6)
    expect(result.text).toMatch(/ran out of reasoning steps/)
  })

  it('blocks create_decision until the user explicitly confirms', async () => {
    const orchestrator = await newOrchestrator(
      new ScriptedLlm([{ toolCalls: [{ id: '1', name: 'create_decision', arguments: CREATE_ARGS }] }])
    )
    const memory: ConversationMemory = {}

    const draft = await orchestrator.run('Record a decision: adopt Playwright for e2e tests', memory)
    expect(draft.toolTrace).toHaveLength(0) // nothing written yet
    expect(draft.text).toContain('Reply **yes**')
    expect(memory.pendingWrite).toBeDefined()

    const saved = await orchestrator.run('yes', memory)
    expect(saved.toolTrace).toEqual([{ tool: 'create_decision', arguments: CREATE_ARGS, ok: true }])
    expect(saved.text).toMatch(/Recorded DR-015/)
    expect(memory.pendingWrite).toBeUndefined()
  })

  it('passes recent conversation history back to the model across turns', async () => {
    const orchestrator = await newOrchestrator(new MemoryAssertingLlm())
    const memory: ConversationMemory = {}

    const first = await orchestrator.run('First question', memory)
    expect(first.text).toBe('First reply')

    const second = await orchestrator.run('Second question', memory)
    expect(second.text).toBe('History available')
    expect(memory.history?.length).toBeGreaterThan(0)
  })

  it('follows a supersession chain to the decision currently in force (FakeLlm)', async () => {
    const orchestrator = await newOrchestrator(new FakeLlm())
    const result = await orchestrator.run('What is our current standard for partner APIs?')

    const gets = result.toolTrace.filter((t) => t.tool === 'get_decision')
    expect(gets.map((t) => t.arguments.id)).toEqual(['DR-009', 'DR-012'])
    expect(result.text).toContain('DR-012')
    expect(result.text).toMatch(/superseded/i)
  })

  it('drafts a decision from "Record a decision:" and saves on confirm (FakeLlm)', async () => {
    const orchestrator = await newOrchestrator(new FakeLlm())
    const memory: ConversationMemory = {}

    const draft = await orchestrator.run('Record a decision: adopt Playwright for end-to-end tests', memory)
    expect(draft.text).toContain('Adopt Playwright for end-to-end tests')
    expect(draft.text).toContain('Reply **yes**')
    expect(memory.pendingWrite).toBeDefined()

    const saved = await orchestrator.run('yes', memory)
    expect(saved.text).toMatch(/Recorded DR-015/)
    expect(JSON.stringify(saved.cards)).toContain('Adopt Playwright for end-to-end tests')
  })

  it('accepts a created decision via "Accept DR-015" with confirmation (FakeLlm)', async () => {
    const orchestrator = await newOrchestrator(new FakeLlm())
    const memory: ConversationMemory = {}

    await orchestrator.run('Record a decision: adopt Playwright for end-to-end tests', memory)
    await orchestrator.run('yes', memory) // DR-015 created as proposed

    const prompt = await orchestrator.run('Accept DR-015', memory)
    expect(prompt.toolTrace).toHaveLength(0) // nothing changed yet
    expect(prompt.text).toContain('DR-015')
    expect(prompt.text).toContain('**accepted**')
    expect(memory.pendingWrite?.tool).toBe('update_decision_status')

    const applied = await orchestrator.run('yes', memory)
    expect(applied.toolTrace).toEqual([
      { tool: 'update_decision_status', arguments: { id: 'DR-015', status: 'accepted' }, ok: true }
    ])
    expect(applied.text).toContain('now accepted')
    expect(JSON.stringify(applied.cards)).toContain('ACCEPTED')
  })

  it('leaves status unchanged when the user declines the status change', async () => {
    const orchestrator = await newOrchestrator(new FakeLlm())
    const memory: ConversationMemory = {}

    await orchestrator.run('Record a decision: adopt Playwright for end-to-end tests', memory)
    await orchestrator.run('yes', memory)

    await orchestrator.run('Accept DR-015', memory)
    const declined = await orchestrator.run('no', memory)
    expect(declined.text).toMatch(/leave the status/)
    expect(memory.pendingWrite).toBeUndefined()

    const check = await orchestrator.run('Show DR-015', memory)
    expect(check.text).toContain('DR-015')
    expect(JSON.stringify(check.cards)).toContain('PROPOSED')
  })

  it('does not execute the write on a qualified "yes, but..."', async () => {
    const orchestrator = await newOrchestrator(
      new ScriptedLlm([{ toolCalls: [{ id: '1', name: 'create_decision', arguments: CREATE_ARGS }] }])
    )
    const memory: ConversationMemory = {}
    await orchestrator.run('Record a decision: adopt Playwright', memory)

    const qualified = await orchestrator.run('Yes, but change the area to engineering first', memory)
    expect(qualified.toolTrace).toHaveLength(0) // nothing was written
    expect(qualified.text).toMatch(/haven't saved anything/)
    expect(memory.pendingWrite).toBeUndefined()
  })

  it('refuses an invalid status change before asking for confirmation (FakeLlm)', async () => {
    const orchestrator = await newOrchestrator(new FakeLlm())
    const memory: ConversationMemory = {}

    const result = await orchestrator.run('Accept DR-003', memory)
    expect(result.text).toMatch(/can't do that/)
    expect(result.text).toMatch(/seed record/)
    expect(result.text).not.toMatch(/Reply \*\*yes\*\*/) // no doomed confirm round-trip
    expect(memory.pendingWrite).toBeUndefined()
  })

  it('builds a new draft from follow-up field input and "create new draft" intent (FakeLlm)', async () => {
    const orchestrator = await newOrchestrator(new FakeLlm())
    const memory: ConversationMemory = {}

    await orchestrator.run('Record a decision: adopt grok for AI integration in new projects', memory)
    await orchestrator.run('no', memory)

    const result = await orchestrator.run(
      'Deciders: Lovy Jain Context: Review ChatGpt, Claude Decision: we will use Grok for AI integration in project Rationale: Based on the POC conducted Alternatives considered: Claude, ChatGpt anyway create new draft',
      memory
    )

    expect(result.text).toContain('Reply **yes**')
    expect(memory.pendingWrite?.tool).toBe('create_decision')
    expect(memory.pendingWrite?.arguments.title).toBe('Adopt grok for AI integration in new projects')
    expect(memory.pendingWrite?.arguments.area).toBe('ai')
    expect(memory.pendingWrite?.arguments.deciders).toEqual(['Lovy Jain'])
  })

  it('discards the pending draft when the user declines', async () => {
    const orchestrator = await newOrchestrator(
      new ScriptedLlm([{ toolCalls: [{ id: '1', name: 'create_decision', arguments: CREATE_ARGS }] }])
    )
    const memory: ConversationMemory = {}
    await orchestrator.run('Record a decision: adopt Playwright', memory)

    const declined = await orchestrator.run('no, leave it', memory)
    expect(declined.text).toMatch(/won't record/)
    expect(declined.toolTrace).toHaveLength(0)
    expect(memory.pendingWrite).toBeUndefined()
  })

  // Regression: an MCP SDK input-validation rejection comes back as a non-JSON
  // string (not our `{ error }` shape), so the dry-run must unpack the Zod
  // issues into a readable reason instead of the opaque generic fallback.
  it('surfaces a readable reason when MCP input validation rejects a write', async () => {
    const orchestrator = await newOrchestrator(
      new ScriptedLlm([
        { toolCalls: [{ id: '1', name: 'create_decision', arguments: { title: 'A perfectly fine title', deciders: [123] } }] }
      ])
    )
    const result = await orchestrator.run('Record a decision with a malformed decider', {})

    expect(result.text).toMatch(/can't do that/)
    expect(result.text).toContain('deciders')
    expect(result.text).not.toMatch(/the decision store rejected it/) // not the opaque fallback
    expect(result.toolTrace).toHaveLength(0)
  })
})
