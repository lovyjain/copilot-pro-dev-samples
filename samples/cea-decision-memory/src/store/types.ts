import { z } from 'zod'

export const DecisionStatusSchema = z.enum(['proposed', 'accepted', 'superseded', 'deprecated'])
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>

export const DecisionRecordSchema = z.object({
  id: z.string().regex(/^DR-\d{3}$/),
  title: z.string().min(5),
  status: DecisionStatusSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  area: z.string().min(2),
  deciders: z.array(z.string()).min(1),
  context: z.string().min(10),
  decision: z.string().min(10),
  rationale: z.string().min(10),
  alternativesConsidered: z.array(z.string()),
  tags: z.array(z.string()).min(1),
  supersedes: z.string().optional(),
  supersededBy: z.string().optional(),
  links: z.array(z.object({ title: z.string(), url: z.string().url() }))
})
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>

/** Input accepted by the create_decision tool: id/status/date are assigned by the store. */
export const NewDecisionSchema = DecisionRecordSchema.omit({
  id: true,
  status: true,
  date: true,
  supersededBy: true
}).extend({
  area: z.string().min(2).default('general'),
  deciders: z.array(z.string()).min(1).default(['Proposed via Decision Memory agent']),
  context: z
    .string()
    .min(10)
    .default('Drafted in conversation; context to be refined before acceptance.'),
  decision: z
    .string()
    .min(10)
    .default('Decision recorded as a draft; details to be refined before acceptance.'),
  rationale: z
    .string()
    .min(10)
    .default('Draft rationale captured automatically; final rationale to be confirmed by deciders.'),
  alternativesConsidered: z.array(z.string()).default([]),
  tags: z.array(z.string()).min(1).default(['draft']),
  links: z.array(z.object({ title: z.string(), url: z.string().url() })).default([])
})
export type NewDecision = z.infer<typeof NewDecisionSchema>

export interface SearchResult {
  record: DecisionRecord
  score: number
  matchedTerms: string[]
}

export interface ConflictCandidate {
  record: DecisionRecord
  score: number
  matchedTerms: string[]
  whySuspected: string
}
