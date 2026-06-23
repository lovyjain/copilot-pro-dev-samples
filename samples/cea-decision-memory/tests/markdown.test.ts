import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { conflictMarkdown, decisionListMarkdown, decisionMarkdown } from '../src/agent/markdown.js'
import { DecisionStore } from '../src/store/decisionStore.js'

const store = DecisionStore.fromFile(path.resolve('data/decisions.seed.json'))

// These renderers exist because M365 Copilot flattens Adaptive Card attachments
// into raw text. The fallback must therefore be real Markdown with hard breaks
// between sections, never the run-together TextBlock concatenation Copilot emits.

describe('Markdown renderers (M365 Copilot fallback)', () => {
  it('decisionMarkdown separates every section with a blank line', () => {
    const md = decisionMarkdown(store.get('DR-003')!)
    expect(md).toContain('**DR-003 — Standardize on PostgreSQL for transactional services**')
    expect(md).toContain('**Context:**')
    expect(md).toContain('**Decision:**')
    expect(md).toContain('**Rationale:**')
    // The Copilot flattening symptom was "servicesACCEPTED**Context:**"; assert
    // the title/status/context never run together.
    expect(md).not.toMatch(/services\*\*ACCEPTED|ACCEPTED\*\*Context/)
    expect(md).toContain('\n\n')
  })

  it('decisionMarkdown renders supersession and links instead of dropping them', () => {
    const superseded = decisionMarkdown(store.get('DR-009')!)
    expect(superseded).toContain('Superseded by: DR-012')

    const withLinks = decisionMarkdown(store.get('DR-001')!)
    expect(withLinks).toMatch(/\[[^\]]+\]\(https:/)
  })

  it('decisionListMarkdown emits one bullet per record', () => {
    const items = store.list({ area: 'api' }).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      area: r.area,
      date: r.date
    }))
    const md = decisionListMarkdown(items, 'API decisions')
    expect(md).toContain('**API decisions**')
    expect(md.match(/^- /gm)?.length).toBe(items.length)
  })

  it('conflictMarkdown surfaces the proposal and the standing decision', () => {
    const md = conflictMarkdown(
      {
        id: 'DR-003',
        title: 'Standardize on PostgreSQL for transactional services',
        status: 'accepted',
        decision: 'PostgreSQL is the only approved database.',
        whySuspected: 'Shares terms [mongodb, database] with accepted decision DR-003.'
      },
      'Use MongoDB for orders'
    )
    expect(md).toContain('Possible conflict with DR-003')
    expect(md).toContain('**Your proposal:** Use MongoDB for orders')
    expect(md).toContain('**Standing decision:** DR-003')
  })
})
