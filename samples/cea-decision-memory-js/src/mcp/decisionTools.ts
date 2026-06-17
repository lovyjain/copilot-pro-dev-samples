import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { DecisionStore } from '../store/decisionStore.js'
import { DecisionStatusSchema, NewDecisionSchema } from '../store/types.js'

function asResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}

function asError(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true }
}

/** Validation failures must read as sentences, not raw Zod issue JSON. */
function errorText(err: unknown): string {
  if (err instanceof z.ZodError) {
    const issues = err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
    return `The decision record is incomplete or invalid — ${issues}.`
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * The Decision Memory MCP server: six tools over the decision-record store.
 * Reused by the standalone Streamable HTTP server, the in-process test/smoke
 * wiring, and any external MCP client (e.g. MCP Inspector).
 */
export function buildDecisionMcpServer(store: DecisionStore): McpServer {
  const server = new McpServer({ name: 'decision-memory', version: '0.1.0' })

  server.registerTool(
    'search_decisions',
    {
      title: 'Search decision records',
      description:
        'Full-text search over organizational decision records (ADRs). Returns ranked matches with scores and matched terms. Use this to answer "why did we..." and "what is our standard for..." questions.',
      inputSchema: {
        query: z.string().describe('Free-text search query, e.g. "database standard" or "partner API"'),
        tags: z.array(z.string()).optional().describe('Optional tag filters to boost matching'),
        status: DecisionStatusSchema.optional().describe('Only return decisions with this status'),
        limit: z.number().int().min(1).max(20).optional().describe('Max results (default 5)')
      }
    },
    async ({ query, tags, status, limit }) => {
      const results = store.search(query, { tags, status, limit })
      return asResult(
        results.map((r) => ({
          id: r.record.id,
          title: r.record.title,
          status: r.record.status,
          area: r.record.area,
          date: r.record.date,
          score: r.score,
          matchedTerms: r.matchedTerms,
          summary: r.record.decision
        }))
      )
    }
  )

  server.registerTool(
    'get_decision',
    {
      title: 'Get a decision record',
      description:
        'Fetch the full decision record by id (e.g. "DR-003"), including context, rationale, alternatives considered, and supersession links.',
      inputSchema: { id: z.string().describe('Decision id, e.g. "DR-003"') }
    },
    async ({ id }) => {
      const record = store.get(id)
      if (!record) return asError(`No decision record found with id "${id}".`)
      return asResult(record)
    }
  )

  server.registerTool(
    'list_decisions',
    {
      title: 'List decision records',
      description: 'List decision records, optionally filtered by area and/or status.',
      inputSchema: {
        area: z.string().optional().describe('Filter by area, e.g. "data", "security", "api"'),
        status: DecisionStatusSchema.optional().describe('Filter by status')
      }
    },
    async ({ area, status }) => {
      const records = store.list({ area, status })
      return asResult(
        records.map((r) => ({ id: r.id, title: r.title, status: r.status, area: r.area, date: r.date }))
      )
    }
  )

  server.registerTool(
    'find_conflicting_decisions',
    {
      title: 'Find decisions conflicting with a proposal',
      description:
        'Given a new proposal, return existing decision records that may conflict with it, with match scores and the reason each candidate is suspected. Always run this before recording a new decision.',
      inputSchema: {
        proposal: z.string().describe('The proposal text, e.g. "Use MongoDB for the orders service"'),
        tags: z.array(z.string()).optional().describe('Topic tags for the proposal, e.g. ["data", "database"]')
      }
    },
    async ({ proposal, tags }) => {
      const candidates = store.findConflicts(proposal, tags)
      return asResult(
        candidates.map((c) => ({
          id: c.record.id,
          title: c.record.title,
          status: c.record.status,
          area: c.record.area,
          decision: c.record.decision,
          score: c.score,
          matchedTerms: c.matchedTerms,
          whySuspected: c.whySuspected
        }))
      )
    }
  )

  server.registerTool(
    'create_decision',
    {
      title: 'Create a decision record draft',
      description:
        'Record a new decision as a draft with status "proposed". Title is required; other fields may be omitted and will be auto-filled with safe defaults. Only call this after the user has explicitly confirmed they want the decision recorded. Rejects duplicate titles. If supersedes is set, the superseded record is marked "superseded" when this draft is later accepted.',
      inputSchema: {
        title: z.string().describe('Short imperative title, e.g. "Adopt MongoDB for the orders catalog"'),
        area: z.string().optional().describe('Decision area, e.g. "data", "api", "security" (optional; defaults to "general")'),
        // No .min(1) here on purpose: these fields are optional and auto-filled.
        // If the SDK enforced .min(1), a model that passes deciders:[] or tags:[]
        // would be rejected at the protocol boundary (MCP -32602) before the
        // handler can apply defaults — surfacing to the user as an opaque error.
        deciders: z.array(z.string()).optional().describe('People or groups who made the decision (optional; auto-filled when omitted or empty)'),
        context: z.string().optional().describe('The situation that forced the decision (optional; auto-filled when omitted or blank, minimum 10 chars when provided)'),
        decision: z.string().optional().describe('What was decided (optional; auto-filled when omitted or blank, minimum 10 chars when provided)'),
        rationale: z.string().optional().describe('Why this option won (optional; auto-filled when omitted or blank, minimum 10 chars when provided)'),
        alternativesConsidered: z.array(z.string()).optional().describe('Options that were rejected (optional)'),
        tags: z.array(z.string()).optional().describe('Topic tags (optional; defaults to ["draft"] when omitted or empty)'),
        supersedes: z.string().optional().describe('Id of a decision this one replaces, if any'),
        dryRun: z.boolean().optional().describe('Validate only — nothing is written')
      }
    },
    async ({ dryRun, ...rawInput }) => {
      try {
        // Parse through the schema to apply defaults and validate types. Empty
        // arrays and blank strings are treated as "omitted" so a model that
        // fills optional fields with [] or "" still gets the safe defaults
        // instead of failing the schema's min constraints.
        const input = NewDecisionSchema.parse(
          Object.fromEntries(
            Object.entries(rawInput).filter(([, v]) => {
              if (v === undefined || v === null) return false
              if (Array.isArray(v) && v.length === 0) return false
              if (typeof v === 'string' && v.trim() === '') return false
              return true
            })
          )
        )
        
        if (dryRun) {
          store.validateCreate(input)
          return asResult({ valid: true })
        }
        const record = await store.create(input)
        return asResult(record)
      } catch (err) {
        return asError(errorText(err))
      }
    }
  )

  server.registerTool(
    'update_decision_status',
    {
      title: 'Accept or reject a proposed decision',
      description:
        'Change a proposed decision record to "accepted" (in force) or "deprecated" (rejected draft). Only works for records created at runtime and only from status "proposed". Acceptance applies the record\'s supersession link, marking the replaced decision as "superseded". Only call this after the user has explicitly confirmed the status change.',
      inputSchema: {
        id: z.string().describe('Decision id, e.g. "DR-015"'),
        status: z.enum(['accepted', 'deprecated']).describe('"accepted" puts the decision in force; "deprecated" rejects the draft'),
        dryRun: z.boolean().optional().describe('Validate only — nothing is written')
      }
    },
    async ({ id, status, dryRun }) => {
      try {
        if (dryRun) {
          store.validateStatusChange(id, status)
          return asResult({ valid: true })
        }
        const record = await store.updateStatus(id, status)
        return asResult(record)
      } catch (err) {
        return asError(errorText(err))
      }
    }
  )

  return server
}
