import { readFileSync } from 'node:fs'
import { RuntimeStorage } from './runtimeStorage.js'
import {
  ConflictCandidate,
  DecisionRecord,
  DecisionRecordSchema,
  DecisionStatus,
  NewDecision,
  NewDecisionSchema,
  SearchResult
} from './types.js'

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'should', 'that', 'the', 'their',
  'this', 'to', 'use', 'using', 'we', 'were', 'what', 'which', 'why', 'with', 'want', 'all', 'new'
])

/** Lowercase, strip punctuation, drop stopwords, and crudely singularize. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
}

function bodyOf(r: DecisionRecord): string {
  return [r.context, r.decision, r.rationale, ...r.alternativesConsidered, r.area].join(' ')
}

const STATUS_WEIGHT: Record<DecisionStatus, number> = {
  accepted: 1,
  proposed: 0.6,
  deprecated: 0.3,
  superseded: 0.2
}

export interface DecisionStoreOptions {
  /** Backend for persisting records created at runtime. Omit for in-memory only (tests). */
  storage?: RuntimeStorage
}

/**
 * Pure in-process store over the committed seed records plus any records
 * created at runtime. The seed file is never mutated; runtime records are
 * written through to the configured RuntimeStorage backend on every change.
 */
export class DecisionStore {
  private records: DecisionRecord[]
  private readonly seedIds: Set<string>
  /** Seed records mutated by supersession; they must be persisted as overrides. */
  private readonly dirtySeedIds = new Set<string>()
  private readonly storage?: RuntimeStorage

  constructor(seed: DecisionRecord[], options: DecisionStoreOptions = {}) {
    this.records = seed.map((r) => DecisionRecordSchema.parse(r))
    this.seedIds = new Set(this.records.map((r) => r.id))
    this.storage = options.storage
  }

  /** Sync, in-memory-only construction from the seed file (tests, smoke). */
  static fromFile(seedPath: string, options: DecisionStoreOptions = {}): DecisionStore {
    const seed = JSON.parse(readFileSync(seedPath, 'utf-8')) as DecisionRecord[]
    return new DecisionStore(seed, options)
  }

  /** Sync, in-memory-only construction from already-loaded seed records. */
  static fromSeed(seed: DecisionRecord[], options: DecisionStoreOptions = {}): DecisionStore {
    return new DecisionStore(seed, options)
  }

  /** Loads the seed file plus any persisted runtime records from the backend. */
  static async load(seedPath: string, storage: RuntimeStorage): Promise<DecisionStore> {
    const store = DecisionStore.fromFile(seedPath, { storage })
    store.hydrate(await storage.load())
    return store
  }

  /** Loads pre-fetched seed records plus any persisted runtime records. */
  static async loadFromSeed(seed: DecisionRecord[], storage: RuntimeStorage): Promise<DecisionStore> {
    const store = DecisionStore.fromSeed(seed, { storage })
    store.hydrate(await storage.load())
    return store
  }

  /**
   * Apply persisted runtime data: new records are appended; records whose id
   * matches a seed are overrides (e.g. a seed superseded at runtime) and
   * replace the in-memory seed version.
   */
  private hydrate(stored: DecisionRecord[]): void {
    for (const raw of stored) {
      const record = DecisionRecordSchema.parse(raw)
      const index = this.records.findIndex((r) => r.id === record.id)
      if (index >= 0) {
        this.records[index] = record
        this.dirtySeedIds.add(record.id)
      } else {
        this.records.push(record)
      }
    }
  }

  list(filter: { area?: string; status?: DecisionStatus } = {}): DecisionRecord[] {
    return this.records.filter(
      (r) =>
        (!filter.area || r.area === filter.area) &&
        (!filter.status || r.status === filter.status)
    )
  }

  get(id: string): DecisionRecord | undefined {
    return this.records.find((r) => r.id.toLowerCase() === id.toLowerCase())
  }

  search(
    query: string,
    options: { tags?: string[]; status?: DecisionStatus; limit?: number } = {}
  ): SearchResult[] {
    const terms = [...new Set([...tokenize(query), ...(options.tags ?? []).map((t) => t.toLowerCase())])]
    const limit = options.limit ?? 5
    const results: SearchResult[] = []

    for (const record of this.records) {
      if (options.status && record.status !== options.status) continue
      const titleTokens = new Set(tokenize(record.title))
      const tagTokens = new Set(record.tags.flatMap((t) => tokenize(t)))
      const bodyTokens = new Set(tokenize(bodyOf(record)))

      let score = 0
      const matchedTerms: string[] = []
      for (const term of terms) {
        let termScore = 0
        if (titleTokens.has(term)) termScore += 3
        if (tagTokens.has(term)) termScore += 3
        if (bodyTokens.has(term)) termScore += 1
        if (termScore > 0) {
          score += termScore
          matchedTerms.push(term)
        }
      }
      if (score > 0) results.push({ record, score, matchedTerms })
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  /**
   * Heuristic recall pass for proposals that may contradict existing decisions.
   * The agent's LLM makes the final conflict judgment over these candidates;
   * this layer only guarantees nothing relevant is missed and stays deterministic.
   *
   * Score = 0.5 * tag overlap + 0.35 * keyword overlap + 0.15 * status weight.
   * A candidate also needs at least two distinct matched terms, so incidental
   * single-word overlaps ("team", "service") don't surface noise.
   */
  findConflicts(proposalText: string, tags: string[] = []): ConflictCandidate[] {
    const proposalTokens = [...new Set(tokenize(proposalText))]
    const proposalTags = new Set(tags.map((t) => t.toLowerCase()))
    const candidates: ConflictCandidate[] = []

    for (const record of this.records) {
      const recordTags = new Set(record.tags.map((t) => t.toLowerCase()))
      const recordTokens = new Set([
        ...tokenize(record.title),
        ...tokenize(bodyOf(record)),
        ...record.tags.flatMap((t) => tokenize(t))
      ])

      const tagMatches = [...proposalTags].filter((t) => recordTags.has(t))
      const keywordMatches = proposalTokens.filter((t) => recordTokens.has(t))
      const tagOverlap = proposalTags.size > 0 ? tagMatches.length / proposalTags.size : 0
      const keywordOverlap =
        proposalTokens.length > 0
          ? keywordMatches.length / Math.min(proposalTokens.length, 6)
          : 0

      const score =
        0.5 * tagOverlap + 0.35 * Math.min(keywordOverlap, 1) + 0.15 * STATUS_WEIGHT[record.status]
      const matchedTerms = [...new Set([...tagMatches, ...keywordMatches])]

      if (matchedTerms.length >= 2 && score >= 0.25) {
        candidates.push({
          record,
          score: Math.round(score * 100) / 100,
          matchedTerms,
          whySuspected: `Shares terms [${matchedTerms.join(', ')}] with ${record.status} decision ${record.id} ("${record.title}") in area "${record.area}".`
        })
      }
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 3)
  }

  /**
   * Throws (with a user-presentable message) if the input cannot be created.
   * Exposed via the tools' dryRun flag so the agent can pre-validate a write
   * before asking the user to confirm it.
   */
  validateCreate(input: NewDecision): NewDecision {
    const parsed = NewDecisionSchema.parse(input)
    const duplicate = this.records.find(
      (r) => r.title.trim().toLowerCase() === parsed.title.trim().toLowerCase()
    )
    if (duplicate) {
      throw new Error(`A decision with this title already exists: ${duplicate.id} ("${duplicate.title}")`)
    }
    if (parsed.supersedes) {
      const target = this.get(parsed.supersedes)
      if (!target) {
        throw new Error(`Cannot supersede "${parsed.supersedes}" — no decision record has that id.`)
      }
      if (target.status === 'superseded') {
        throw new Error(
          `${target.id} was already superseded by ${target.supersededBy ?? 'another decision'}; supersede that record instead.`
        )
      }
    }
    return parsed
  }

  async create(input: NewDecision): Promise<DecisionRecord> {
    const parsed = this.validateCreate(input)

    const maxId = this.records.reduce((max, r) => Math.max(max, Number(r.id.slice(3))), 0)
    const record: DecisionRecord = {
      ...parsed,
      id: `DR-${String(maxId + 1).padStart(3, '0')}`,
      status: 'proposed',
      date: new Date().toISOString().slice(0, 10)
    }
    DecisionRecordSchema.parse(record)
    this.records.push(record)
    await this.persistRuntime()
    return record
  }

  /**
   * Throws (with a user-presentable message) if the transition is not allowed.
   * Exposed via the tool's dryRun flag so the agent can pre-validate before
   * asking the user to confirm.
   */
  validateStatusChange(id: string, status: 'accepted' | 'deprecated'): DecisionRecord {
    const record = this.get(id)
    if (!record) {
      throw new Error(`No decision record found with id "${id}".`)
    }
    if (this.seedIds.has(record.id)) {
      throw new Error(
        `${record.id} is a seed record and cannot change status directly; to retire it, record a new decision that supersedes it.`
      )
    }
    if (record.status !== 'proposed') {
      throw new Error(
        `${record.id} has status "${record.status}" — only "proposed" records can be ${status === 'accepted' ? 'accepted' : 'deprecated'}.`
      )
    }
    if (status === 'accepted' && record.supersedes) {
      const target = this.get(record.supersedes)
      if (target && target.status === 'superseded' && target.supersededBy !== record.id) {
        throw new Error(
          `${record.id} supersedes ${target.id}, but ${target.id} was already superseded by ${target.supersededBy}; the chain has moved on.`
        )
      }
    }
    return record
  }

  /**
   * Promote a draft to accepted, or reject it as deprecated. Only records
   * created at runtime can be targeted directly. Acceptance applies the
   * record's supersession: the superseded decision (seed records included)
   * is marked "superseded" and linked back, and the override is persisted.
   */
  async updateStatus(id: string, status: 'accepted' | 'deprecated'): Promise<DecisionRecord> {
    const record = this.validateStatusChange(id, status)
    record.status = status
    if (status === 'accepted' && record.supersedes) {
      const target = this.get(record.supersedes)
      if (target && target.status !== 'superseded') {
        target.status = 'superseded'
        target.supersededBy = record.id
        if (this.seedIds.has(target.id)) this.dirtySeedIds.add(target.id)
      }
    }
    await this.persistRuntime()
    return record
  }

  /** Write-through: awaited by every mutation, so a successful tool result means the data is durable. */
  private async persistRuntime(): Promise<void> {
    if (!this.storage) return
    const toPersist = this.records.filter((r) => !this.seedIds.has(r.id) || this.dirtySeedIds.has(r.id))
    await this.storage.save(toPersist)
  }
}
