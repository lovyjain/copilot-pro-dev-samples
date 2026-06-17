import { DecisionRecord, DecisionStatus } from '../store/types.js'

export type AdaptiveCard = Record<string, unknown>

const CARD_BASE = {
  $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
  type: 'AdaptiveCard',
  version: '1.5'
}

const STATUS_COLOR: Record<DecisionStatus, string> = {
  accepted: 'Good',
  proposed: 'Accent',
  superseded: 'Warning',
  deprecated: 'Attention'
}

export function decisionCard(record: DecisionRecord): AdaptiveCard {
  const facts = [
    { title: 'Id', value: record.id },
    { title: 'Status', value: record.status },
    { title: 'Date', value: record.date },
    { title: 'Area', value: record.area },
    { title: 'Deciders', value: record.deciders.join(', ') }
  ]
  if (record.supersedes) facts.push({ title: 'Supersedes', value: record.supersedes })
  if (record.supersededBy) facts.push({ title: 'Superseded by', value: record.supersededBy })

  return {
    ...CARD_BASE,
    body: [
      {
        type: 'TextBlock',
        text: `${record.id} — ${record.title}`,
        weight: 'Bolder',
        size: 'Medium',
        wrap: true
      },
      {
        type: 'TextBlock',
        text: record.status.toUpperCase(),
        color: STATUS_COLOR[record.status],
        weight: 'Bolder',
        spacing: 'None'
      },
      { type: 'FactSet', facts },
      { type: 'TextBlock', text: '**Context:** ' + record.context, wrap: true },
      { type: 'TextBlock', text: '**Decision:** ' + record.decision, wrap: true },
      { type: 'TextBlock', text: '**Rationale:** ' + record.rationale, wrap: true },
      ...(record.alternativesConsidered.length
        ? [{
            type: 'TextBlock',
            text: '**Alternatives considered:** ' + record.alternativesConsidered.join(' · '),
            wrap: true,
            isSubtle: true
          }]
        : []),
      {
        type: 'TextBlock',
        text: record.tags.map((t) => `#${t}`).join('  '),
        wrap: true,
        isSubtle: true,
        spacing: 'Small'
      }
    ],
    actions: record.links.map((l) => ({ type: 'Action.OpenUrl', title: l.title, url: l.url }))
  }
}

export interface ConflictSummary {
  id: string
  title: string
  status: string
  decision: string
  whySuspected: string
}

export function conflictCard(conflict: ConflictSummary, proposal: string): AdaptiveCard {
  return {
    ...CARD_BASE,
    body: [
      {
        type: 'Container',
        style: 'attention',
        bleed: true,
        items: [
          {
            type: 'TextBlock',
            text: `⚠️ Possible conflict with ${conflict.id}`,
            weight: 'Bolder',
            size: 'Medium',
            wrap: true
          }
        ]
      },
      { type: 'TextBlock', text: '**Your proposal:** ' + proposal, wrap: true },
      {
        type: 'TextBlock',
        text: `**Standing decision:** ${conflict.id} — ${conflict.title} (${conflict.status})`,
        wrap: true
      },
      { type: 'TextBlock', text: conflict.decision, wrap: true, isSubtle: true },
      { type: 'TextBlock', text: '**Why flagged:** ' + conflict.whySuspected, wrap: true }
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Show full decision',
        data: { msteams: { type: 'imBack', value: `Show ${conflict.id}` } }
      }
    ]
  }
}

export interface DecisionListItem {
  id: string
  title: string
  status: string
  area: string
  date: string
}

export function decisionListCard(items: DecisionListItem[], heading: string): AdaptiveCard {
  return {
    ...CARD_BASE,
    body: [
      { type: 'TextBlock', text: heading, weight: 'Bolder', size: 'Medium', wrap: true },
      ...items.map((item) => ({
        type: 'ColumnSet',
        separator: true,
        columns: [
          {
            type: 'Column',
            width: 'stretch',
            items: [
              { type: 'TextBlock', text: `**${item.id}** — ${item.title}`, wrap: true },
              {
                type: 'TextBlock',
                text: `${item.area} · ${item.date}`,
                isSubtle: true,
                spacing: 'None'
              }
            ]
          },
          {
            type: 'Column',
            width: 'auto',
            items: [{ type: 'TextBlock', text: item.status, isSubtle: true }]
          }
        ]
      }))
    ]
  }
}
