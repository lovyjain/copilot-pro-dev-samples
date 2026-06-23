import { beforeAll, describe, expect, it } from 'vitest'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createInProcessMcp } from '../src/mcp/client.js'
import { DecisionStore } from '../src/store/decisionStore.js'

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>
  return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
}

describe('Decision Memory MCP server (real protocol round-trip)', () => {
  let client: Client

  beforeAll(async () => {
    const store = DecisionStore.fromFile(path.resolve('data/decisions.seed.json'))
    client = await createInProcessMcp(store)
  })

  it('lists exactly the six decision tools with schemas', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_decision',
      'find_conflicting_decisions',
      'get_decision',
      'list_decisions',
      'search_decisions',
      'update_decision_status'
    ])
    for (const tool of tools) {
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toMatchObject({ type: 'object' })
    }
  })

  it('search_decisions returns ranked results as JSON text', async () => {
    const result = await client.callTool({
      name: 'search_decisions',
      arguments: { query: 'postgresql database standard' }
    })
    const payload = JSON.parse(textOf(result)) as Array<{ id: string; score: number }>
    expect(payload[0].id).toBe('DR-003')
    expect(payload[0].score).toBeGreaterThan(0)
  })

  it('get_decision returns the full record', async () => {
    const result = await client.callTool({ name: 'get_decision', arguments: { id: 'DR-012' } })
    const record = JSON.parse(textOf(result))
    expect(record.supersedes).toBe('DR-009')
    expect(record.rationale).toBeTruthy()
  })

  it('get_decision flags unknown ids as errors', async () => {
    const result = await client.callTool({ name: 'get_decision', arguments: { id: 'DR-999' } })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('DR-999')
  })

  it('find_conflicting_decisions surfaces the database conflict', async () => {
    const result = await client.callTool({
      name: 'find_conflicting_decisions',
      arguments: { proposal: 'Use MongoDB as the database for the orders service', tags: ['database'] }
    })
    const payload = JSON.parse(textOf(result)) as Array<{ id: string; whySuspected: string }>
    expect(payload.map((c) => c.id)).toContain('DR-003')
  })

  it('create_decision validates input and reports duplicates as tool errors', async () => {
    const result = await client.callTool({
      name: 'create_decision',
      arguments: {
        title: 'Standardize on PostgreSQL for transactional services',
        area: 'data',
        deciders: ['Someone'],
        context: 'Trying to duplicate an existing decision title.',
        decision: 'This should be rejected by the store.',
        rationale: 'Duplicate titles would corrupt the decision log.',
        alternativesConsidered: [],
        tags: ['data']
      }
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('already exists')
  })

  it('create_decision accepts title-only input and auto-fills remaining fields', async () => {
    const result = await client.callTool({
      name: 'create_decision',
      arguments: {
        title: 'Adopt Grok for project experimentation'
      }
    })

    expect(result.isError).toBeFalsy()
    const record = JSON.parse(textOf(result)) as {
      id: string
      title: string
      area: string
      deciders: string[]
      tags: string[]
      context: string
      decision: string
      rationale: string
      status: string
    }
    expect(record.id).toBe('DR-015')
    expect(record.title).toBe('Adopt Grok for project experimentation')
    expect(record.status).toBe('proposed')
    expect(record.area).toBe('general')
    expect(record.deciders.length).toBeGreaterThan(0)
    expect(record.tags.length).toBeGreaterThan(0)
    expect(record.context.length).toBeGreaterThanOrEqual(10)
    expect(record.decision.length).toBeGreaterThanOrEqual(10)
    expect(record.rationale.length).toBeGreaterThanOrEqual(10)
  })

  it('update_decision_status rejects seed records as a tool error', async () => {
    const result = await client.callTool({
      name: 'update_decision_status',
      arguments: { id: 'DR-003', status: 'deprecated' }
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('seed record')
  })

  it('reports schema violations as sentences, not raw Zod JSON', async () => {
    const result = await client.callTool({
      name: 'create_decision',
      arguments: {
        title: 'Short context test decision',
        area: 'general',
        deciders: ['QA'],
        context: 'too short',
        decision: 'ok',
        rationale: 'meh',
        alternativesConsidered: [],
        tags: ['general']
      }
    })
    expect(result.isError).toBe(true)
    const text = JSON.parse(textOf(result)).error as string
    expect(text).toMatch(/incomplete or invalid/)
    expect(text).toContain('context')
    expect(text).not.toContain('"code"') // no raw Zod issue objects
  })

  it('dryRun validates without writing anything', async () => {
    const result = await client.callTool({
      name: 'create_decision',
      arguments: {
        title: 'Dry run only decision',
        area: 'general',
        deciders: ['QA'],
        context: 'Validation should pass without persisting this record.',
        decision: 'Nothing is written when dryRun is set.',
        rationale: 'The agent pre-validates before asking for confirmation.',
        alternativesConsidered: [],
        tags: ['general'],
        dryRun: true
      }
    })
    expect(result.isError).toBeFalsy()
    expect(JSON.parse(textOf(result))).toEqual({ valid: true })

    const list = await client.callTool({ name: 'list_decisions', arguments: {} })
    expect(JSON.parse(textOf(list))).toHaveLength(15) // title-only test created one runtime record
  })

  it('dryRun succeeds with title-only input and writes nothing', async () => {
    const result = await client.callTool({
      name: 'create_decision',
      arguments: {
        title: 'Dry run title only decision',
        dryRun: true
      }
    })
    expect(result.isError).toBeFalsy()
    expect(JSON.parse(textOf(result))).toEqual({ valid: true })

    const list = await client.callTool({ name: 'list_decisions', arguments: {} })
    expect(JSON.parse(textOf(list))).toHaveLength(15) // unchanged after dryRun
  })

  // Regression: the real model often fills optional fields with empty arrays
  // (deciders:[] / tags:[]). With .min(1) in the tool inputSchema, the MCP SDK
  // rejected these at the protocol boundary (-32602) before the handler could
  // apply defaults, which surfaced to users as "the decision store rejected it".
  it('treats empty deciders/tags arrays as omitted and auto-fills defaults', async () => {
    const result = await client.callTool({
      name: 'create_decision',
      arguments: {
        title: 'Implement No-Admin Policy on Super Computer',
        deciders: [],
        tags: []
      }
    })
    expect(result.isError).toBeFalsy()
    const record = JSON.parse(textOf(result)) as {
      title: string
      status: string
      deciders: string[]
      tags: string[]
    }
    expect(record.title).toBe('Implement No-Admin Policy on Super Computer')
    expect(record.status).toBe('proposed')
    expect(record.deciders.length).toBeGreaterThan(0) // default applied, not rejected
    expect(record.tags.length).toBeGreaterThan(0)
  })
})
