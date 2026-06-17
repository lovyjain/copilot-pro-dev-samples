/**
 * Offline end-to-end smoke test: full agent wiring (store → in-process MCP →
 * FakeLlm orchestrator) with zero credentials. Exits non-zero on failure.
 */
import { Orchestrator } from '../src/agent/orchestrator.js'
import { FakeLlm } from '../src/agent/llm.js'
import { createInProcessMcp } from '../src/mcp/client.js'
import { DecisionStore } from '../src/store/decisionStore.js'
import { loadConfig } from '../src/config.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`✗ ${message}`)
    process.exit(1)
  }
  console.log(`✓ ${message}`)
}

const config = loadConfig()
const store = DecisionStore.fromFile(config.seedPath)
const mcp = await createInProcessMcp(store)
const orchestrator = new Orchestrator(new FakeLlm(), mcp)

// Scenario 1: a proposal that contradicts the PostgreSQL standard (DR-003).
const conflict = await orchestrator.run("We're proposing to use MongoDB for the orders service")
assert(
  conflict.toolTrace.some((t) => t.tool === 'find_conflicting_decisions'),
  'proposal triggers find_conflicting_decisions'
)
assert(
  conflict.toolTrace.some((t) => t.tool === 'get_decision'),
  'agent drills into the conflicting record (multi-step)'
)
assert(JSON.stringify(conflict.cards).includes('DR-003'), 'conflict card references DR-003')
assert(conflict.text.includes('DR-003'), 'reply cites DR-003')

// Scenario 2: a "why" question grounded in the decision store.
const why = await orchestrator.run('Why did we choose PostgreSQL for our services?')
assert(why.text.includes('DR-003'), 'answer cites DR-003 as the source')
assert(why.cards.length > 0, 'answer includes a decision card')

// Scenario 3: superseded decision chain is followed to the current standard.
const partner = await orchestrator.run('What is our current standard for partner APIs?')
assert(
  partner.toolTrace.some((t) => t.tool === 'search_decisions'),
  'question triggers search_decisions'
)
assert(
  partner.toolTrace.filter((t) => t.tool === 'get_decision').length >= 2,
  'agent follows the supersession chain (multi-hop get_decision)'
)
assert(partner.text.includes('DR-012'), 'answer cites the decision currently in force (DR-012)')
assert(/superseded/i.test(partner.text), 'answer explains the supersession history')

// Scenario 4: drafting a new decision requires explicit confirmation,
// and a "yes, but..." never executes the unmodified write.
const memory = {}
const draft = await orchestrator.run('Record a decision: adopt Playwright for end-to-end tests', memory)
assert(/Reply \*\*yes\*\*/.test(draft.text), 'create flow asks for confirmation before writing')
const qualified = await orchestrator.run('Yes, but change the title first', memory)
assert(/haven't saved anything/.test(qualified.text), 'a qualified "yes" does not execute the write')
const redraft = await orchestrator.run('Record a decision: adopt Playwright for end-to-end tests', memory)
assert(/Reply \*\*yes\*\*/.test(redraft.text), 'the draft can be recreated after a qualified yes')
const saved = await orchestrator.run('yes', memory)
assert(/Recorded DR-015/.test(saved.text), 'confirmation records the new decision (DR-015)')
assert(saved.cards.length > 0, 'recorded decision is shown as a card')

// Scenario 5: invalid status changes are refused before any confirmation prompt.
const seedAccept = await orchestrator.run('Accept DR-003', memory)
assert(/can't do that/.test(seedAccept.text), 'accepting a seed record is refused without a confirm round-trip')
assert(!/Reply \*\*yes\*\*/.test(seedAccept.text), 'no confirmation is requested for a doomed write')

// Scenario 6: promoting the draft to accepted also requires confirmation.
const acceptPrompt = await orchestrator.run('Accept DR-015', memory)
assert(/\*\*accepted\*\*/.test(acceptPrompt.text), 'status change asks for confirmation first')
const accepted = await orchestrator.run('yes', memory)
assert(/now accepted/.test(accepted.text), 'confirmation promotes DR-015 to accepted')
assert(JSON.stringify(accepted.cards).includes('ACCEPTED'), 'card shows the ACCEPTED status badge')

console.log('\nSmoke test passed: agent loop, MCP tools, and cards all work offline.')
await mcp.close()
