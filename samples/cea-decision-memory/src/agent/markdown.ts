import { DecisionRecord } from '../store/types.js'
import { ConflictSummary, DecisionListItem } from './cards.js'

// M365 Copilot (channelId "msteams") flattens Adaptive Card attachments into
// raw text — markdown is left literal and TextBlocks run together. These
// renderers produce the same content as the cards in plain Markdown, which
// Copilot renders correctly. Card-capable surfaces (playground/webchat) keep
// using the Adaptive Cards instead.

const META_SEP = '  ·  '

/** Full decision record, mirroring decisionCard. */
export function decisionMarkdown(record: DecisionRecord): string {
  const meta = [
    `Status: **${record.status.toUpperCase()}**`,
    `Date: ${record.date}`,
    `Area: ${record.area}`
  ]
  if (record.deciders.length) meta.push(`Deciders: ${record.deciders.join(', ')}`)
  if (record.supersedes) meta.push(`Supersedes: ${record.supersedes}`)
  if (record.supersededBy) meta.push(`Superseded by: ${record.supersededBy}`)

  const parts = [
    `**${record.id} — ${record.title}**`,
    meta.join(META_SEP),
    `**Context:** ${record.context}`,
    `**Decision:** ${record.decision}`,
    `**Rationale:** ${record.rationale}`
  ]
  if (record.alternativesConsidered.length) {
    parts.push(`**Alternatives considered:** ${record.alternativesConsidered.join(' · ')}`)
  }
  // "Tags: " keeps the leading "#" off the start of a line so it is not parsed
  // as a Markdown heading.
  if (record.tags.length) parts.push(`Tags: ${record.tags.map((t) => `#${t}`).join(' ')}`)
  if (record.links.length) parts.push(record.links.map((l) => `[${l.title}](${l.url})`).join(' · '))

  return parts.join('\n\n')
}

/** Search / list results, mirroring decisionListCard. */
export function decisionListMarkdown(items: DecisionListItem[], heading: string): string {
  const rows = items.map(
    (item) => `- **${item.id}** — ${item.title} · *${item.area}* · ${item.date} · ${item.status}`
  )
  return [`**${heading}**`, rows.join('\n')].join('\n\n')
}

/** Conflict warning, mirroring conflictCard. */
export function conflictMarkdown(conflict: ConflictSummary, proposal: string): string {
  return [
    `⚠️ **Possible conflict with ${conflict.id}**`,
    `**Your proposal:** ${proposal}`,
    `**Standing decision:** ${conflict.id} — ${conflict.title} (${conflict.status})`,
    `> ${conflict.decision}`,
    `**Why flagged:** ${conflict.whySuspected}`
  ].join('\n\n')
}
