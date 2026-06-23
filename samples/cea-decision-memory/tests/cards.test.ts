import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { conflictCard, decisionCard, decisionListCard } from '../src/agent/cards.js'
import { DecisionStore } from '../src/store/decisionStore.js'

const store = DecisionStore.fromFile(path.resolve('data/decisions.seed.json'))

describe('Adaptive Card builders', () => {
  it('decisionCard emits a valid AdaptiveCard 1.5 with facts and supersession links', () => {
    const card = decisionCard(store.get('DR-009')!)
    expect(card).toMatchObject({ type: 'AdaptiveCard', version: '1.5' })
    const json = JSON.stringify(card)
    expect(json).toContain('Superseded by')
    expect(json).toContain('DR-012')
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('decisionCard surfaces external links as OpenUrl actions', () => {
    const card = decisionCard(store.get('DR-001')!) as { actions: Array<{ type: string; url: string }> }
    expect(card.actions[0].type).toBe('Action.OpenUrl')
    expect(card.actions[0].url).toMatch(/^https:/)
  })

  it('conflictCard uses an attention container and a follow-up action', () => {
    const card = conflictCard(
      {
        id: 'DR-003',
        title: 'Standardize on PostgreSQL for transactional services',
        status: 'accepted',
        decision: 'PostgreSQL is the only approved database.',
        whySuspected: 'Shares terms [mongodb, database] with accepted decision DR-003.'
      },
      'Use MongoDB for orders'
    )
    expect(card).toMatchObject({ type: 'AdaptiveCard', version: '1.5' })
    const json = JSON.stringify(card)
    expect(json).toContain('"style":"attention"')
    expect(json).toContain('Show DR-003')
  })

  it('decisionListCard renders one row per item', () => {
    const items = store.list({ area: 'api' }).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      area: r.area,
      date: r.date
    }))
    const card = decisionListCard(items, 'API decisions') as { body: unknown[] }
    expect(card.body).toHaveLength(1 + items.length)
  })
})
