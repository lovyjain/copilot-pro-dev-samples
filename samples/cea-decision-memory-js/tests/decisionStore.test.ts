import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { DecisionStore, tokenize } from '../src/store/decisionStore.js'
import { RuntimeStorage } from '../src/store/runtimeStorage.js'
import { DecisionRecord } from '../src/store/types.js'

const seedPath = path.resolve('data/decisions.seed.json')
const newStore = () => DecisionStore.fromFile(seedPath)

describe('tokenize', () => {
  it('lowercases, drops stopwords, and singularizes plurals', () => {
    expect(tokenize('We should use the Databases for Services')).toEqual(['database', 'service'])
  })
})

describe('DecisionStore.search', () => {
  it('ranks the PostgreSQL standard first for database questions', () => {
    const results = newStore().search('why did we choose PostgreSQL database')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].record.id).toBe('DR-003')
    expect(results[0].matchedTerms).toContain('postgresql')
  })

  it('weights title and tag matches above body matches', () => {
    const results = newStore().search('graphql')
    expect(results[0].record.id).toBe('DR-012')
  })

  it('respects status filters and limit', () => {
    const store = newStore()
    expect(store.search('partner api', { status: 'superseded' }).map((r) => r.record.id)).toEqual(['DR-009'])
    expect(store.search('standard', { limit: 2 })).toHaveLength(2)
  })

  it('returns empty for unrelated queries', () => {
    expect(newStore().search('zebra quantum juggling')).toHaveLength(0)
  })
})

describe('DecisionStore.get/list', () => {
  it('gets by id case-insensitively', () => {
    expect(newStore().get('dr-007')?.title).toMatch(/PII/)
  })

  it('returns undefined for unknown ids', () => {
    expect(newStore().get('DR-999')).toBeUndefined()
  })

  it('lists by area and status', () => {
    const store = newStore()
    expect(store.list({ area: 'api' }).map((r) => r.id)).toEqual(['DR-009', 'DR-012'])
    expect(store.list({ area: 'api', status: 'accepted' }).map((r) => r.id)).toEqual(['DR-012'])
  })
})

describe('DecisionStore.create', () => {
  const input = {
    title: 'Adopt feature environments for QA',
    area: 'process',
    deciders: ['QA Guild'],
    context: 'Shared staging causes test collisions between teams.',
    decision: 'Each PR gets an ephemeral feature environment.',
    rationale: 'Isolation removes cross-team test interference.',
    alternativesConsidered: ['Time-sliced staging calendar'],
    tags: ['process', 'qa'],
    links: []
  }

  it('assigns the next id and proposed status', async () => {
    const record = await newStore().create(input)
    expect(record.id).toBe('DR-015')
    expect(record.status).toBe('proposed')
    expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('rejects duplicate titles', async () => {
    await expect(
      newStore().create({ ...input, title: 'Standardize on PostgreSQL for transactional services' })
    ).rejects.toThrow(/already exists.*DR-003/)
  })

  it('does not mutate the seed: a fresh store has 14 records', async () => {
    const store = newStore()
    await store.create(input)
    expect(store.list()).toHaveLength(15)
    expect(newStore().list()).toHaveLength(14)
  })

  describe('updateStatus', () => {
    it('accepts a runtime-created proposed record', async () => {
      const store = newStore()
      const created = await store.create(input)
      const updated = await store.updateStatus(created.id, 'accepted')
      expect(updated.status).toBe('accepted')
      expect(store.get(created.id)?.status).toBe('accepted')
    })

    it('can reject a draft as deprecated', async () => {
      const store = newStore()
      const created = await store.create(input)
      await expect(store.updateStatus(created.id, 'deprecated')).resolves.toMatchObject({ status: 'deprecated' })
    })

    it('refuses to touch seed records directly', async () => {
      await expect(newStore().updateStatus('DR-003', 'deprecated')).rejects.toThrow(/seed record/)
    })

    it('rejects unknown ids', async () => {
      await expect(newStore().updateStatus('DR-999', 'accepted')).rejects.toThrow(/No decision record/)
    })

    it('only allows transitions from proposed', async () => {
      const store = newStore()
      const created = await store.create(input)
      await store.updateStatus(created.id, 'accepted')
      await expect(store.updateStatus(created.id, 'deprecated')).rejects.toThrow(/only "proposed"/)
    })
  })

  describe('supersession', () => {
    const superseding = {
      ...input,
      title: 'Adopt CockroachDB for transactional services',
      supersedes: 'DR-003'
    }

    it('rejects superseding an unknown id at create time', async () => {
      await expect(newStore().create({ ...superseding, supersedes: 'DR-999' })).rejects.toThrow(
        /no decision record has that id/
      )
    })

    it('rejects superseding an already-superseded record', async () => {
      // DR-009 is superseded by DR-012 in the seed
      await expect(newStore().create({ ...superseding, supersedes: 'DR-009' })).rejects.toThrow(
        /already superseded by DR-012/
      )
    })

    it('marks the old record superseded when the new one is accepted — not before', async () => {
      const store = newStore()
      const draft = await store.create(superseding)
      expect(store.get('DR-003')?.status).toBe('accepted') // draft alone changes nothing

      await store.updateStatus(draft.id, 'accepted')
      const old = store.get('DR-003')
      expect(old?.status).toBe('superseded')
      expect(old?.supersededBy).toBe(draft.id)
    })

    it('leaves the old record untouched when the draft is rejected', async () => {
      const store = newStore()
      const draft = await store.create(superseding)
      await store.updateStatus(draft.id, 'deprecated')
      expect(store.get('DR-003')?.status).toBe('accepted')
      expect(store.get('DR-003')?.supersededBy).toBeUndefined()
    })

    it('refuses to accept a draft whose supersession chain has moved on', async () => {
      const store = newStore()
      const first = await store.create(superseding)
      const second = await store.create({
        ...superseding,
        title: 'Adopt TiDB for transactional services'
      })
      await store.updateStatus(first.id, 'accepted')
      await expect(store.updateStatus(second.id, 'accepted')).rejects.toThrow(/already superseded by DR-015/)
    })
  })

  describe('runtime storage backend', () => {
    class InMemoryStorage implements RuntimeStorage {
      readonly description = 'in-memory test backend'
      saves: DecisionRecord[][] = []
      constructor(public records: DecisionRecord[] = []) {}
      async load(): Promise<DecisionRecord[]> {
        return this.records
      }
      async save(records: DecisionRecord[]): Promise<void> {
        this.records = records
        this.saves.push(records)
      }
    }

    it('hydrates persisted runtime records on load', async () => {
      const first = new InMemoryStorage()
      const store = await DecisionStore.load(seedPath, first)
      await store.create(input)
      expect(first.records.map((r) => r.id)).toEqual(['DR-015'])

      // a brand-new store over the same backend sees the record again
      const reloaded = await DecisionStore.load(seedPath, new InMemoryStorage(first.records))
      expect(reloaded.get('DR-015')?.title).toBe(input.title)
      expect(reloaded.list()).toHaveLength(15)
    })

    it('writes through on every mutation, runtime records only', async () => {
      const storage = new InMemoryStorage()
      const store = await DecisionStore.load(seedPath, storage)
      const created = await store.create(input)
      await store.updateStatus(created.id, 'accepted')

      expect(storage.saves).toHaveLength(2) // create + status change, each awaited
      expect(storage.records).toHaveLength(1) // seed records never leak into the backend
      expect(storage.records[0]).toMatchObject({ id: 'DR-015', status: 'accepted' })
    })

    it('persists a superseded seed as an override and re-applies it on load', async () => {
      const storage = new InMemoryStorage()
      const store = await DecisionStore.load(seedPath, storage)
      const draft = await store.create({
        ...input,
        title: 'Adopt CockroachDB for transactional services',
        supersedes: 'DR-003'
      })
      await store.updateStatus(draft.id, 'accepted')

      // backend holds the new record plus the overridden seed, nothing else
      expect(storage.records.map((r) => r.id).sort()).toEqual(['DR-003', 'DR-015'])
      expect(storage.records.find((r) => r.id === 'DR-003')).toMatchObject({
        status: 'superseded',
        supersededBy: 'DR-015'
      })

      // a fresh store over the same backend sees the supersession
      const reloaded = await DecisionStore.load(seedPath, new InMemoryStorage(storage.records))
      expect(reloaded.get('DR-003')?.status).toBe('superseded')
      expect(reloaded.get('DR-003')?.supersededBy).toBe('DR-015')
      expect(reloaded.list()).toHaveLength(15)
    })
  })
})
