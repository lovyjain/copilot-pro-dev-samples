import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { DecisionStore } from '../src/store/decisionStore.js'

const store = DecisionStore.fromFile(path.resolve('data/decisions.seed.json'))

describe('DecisionStore.findConflicts', () => {
  it('flags a MongoDB proposal against the PostgreSQL standard (DR-003)', () => {
    const candidates = store.findConflicts(
      "We're proposing to use MongoDB as the database for the orders service",
      ['data', 'database']
    )
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].record.id).toBe('DR-003')
    expect(candidates[0].whySuspected).toContain('DR-003')
  })

  it('finds the database conflict even without tags', () => {
    const candidates = store.findConflicts('We plan to add a MongoDB database cluster for orders')
    expect(candidates.map((c) => c.record.id)).toContain('DR-003')
  })

  it('flags a US-region analytics proposal against the EU PII boundary (DR-007)', () => {
    const candidates = store.findConflicts(
      'Proposal: replicate customer PII to the US region for analytics',
      ['security', 'pii']
    )
    expect(candidates.map((c) => c.record.id)).toContain('DR-007')
  })

  it('returns nothing for unrelated proposals', () => {
    expect(store.findConflicts('We should hold a weekly team lunch on Fridays')).toHaveLength(0)
  })

  it('ranks accepted decisions above superseded ones', () => {
    const candidates = store.findConflicts(
      'Proposal: partners should integrate via a new REST API gateway',
      ['api', 'partners']
    )
    const ids = candidates.map((c) => c.record.id)
    expect(ids).toContain('DR-012')
    expect(ids.indexOf('DR-012')).toBeLessThan(Math.max(ids.indexOf('DR-009'), 0) + 1)
  })

  it('requires at least two matched terms', () => {
    for (const c of store.findConflicts('database')) {
      expect(c.matchedTerms.length).toBeGreaterThanOrEqual(2)
    }
  })
})
