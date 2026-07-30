// Builds a Markdown recap of a retro session and triggers a browser download.
// Shared by the team retro and the quick retro wrap-up panels.

import { groupCards, type GroupableCard } from './retro-groups'

const MOOD_LABELS: Record<number, string> = {
  1: '😔 Not great',
  2: '😕 Meh',
  3: '😐 Ok',
  4: '🙂 Good',
  5: '😄 Great',
}

export type ExportCard = GroupableCard & {
  column: string
  discussionNotes: string | null
  isDiscussed: boolean
}

export type ExportMoodCheckin = {
  entryMood: number | null
  exitMood: number | null
}

export type ExportMember = {
  userId: string
  displayName: string
}

export type ExportActionItem = {
  id: string
  text: string
  assigneeId: string | null
  status: string
  dueDate: string | null
  retroCardId: string | null
}

export type RetroExportInput = {
  title: string
  cards: ExportCard[]
  moodCheckins: ExportMoodCheckin[]
  teamMembers: ExportMember[]
  actionItems: ExportActionItem[]
}

/** Escapes the characters that would otherwise break inline Markdown. */
function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]#|])/g, '\\$1')
}

function blockquote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map(line => `> ${line}`)
    .join('\n')
}

function moodSection(moodCheckins: ExportMoodCheckin[], key: 'entryMood' | 'exitMood'): string[] {
  const moods = moodCheckins.map(m => m[key]).filter((v): v is number => v !== null)
  const label = key === 'entryMood' ? 'Entry' : 'Exit'
  if (moods.length === 0) return [`- **${label} mood:** no responses`]

  const avg = moods.reduce((a, b) => a + b, 0) / moods.length
  const dist = [1, 2, 3, 4, 5]
    .map(value => ({ value, count: moods.filter(v => v === value).length }))
    .filter(d => d.count > 0)
    .map(d => `${MOOD_LABELS[d.value]} ×${d.count}`)
    .join(', ')

  return [
    `- **${label} mood:** ${avg.toFixed(1)} / 5 (${moods.length} response${moods.length === 1 ? '' : 's'})`,
    `  - ${dist}`,
  ]
}

export function buildRetroMarkdown({
  title, cards, moodCheckins, teamMembers, actionItems,
}: RetroExportInput): string {
  const nameByUserId = new Map(teamMembers.map(m => [m.userId, m.displayName]))
  const cardById     = new Map(cards.map(c => [c.id, c]))
  const groups       = groupCards(cards).sort((a, b) => b.totalVotes - a.totalVotes)

  const lines: string[] = [
    `# ${title} — Retro Summary`,
    '',
    `_Exported ${new Date().toLocaleString()}_`,
    '',
    '## Mood',
    '',
    ...moodSection(moodCheckins, 'entryMood'),
    ...moodSection(moodCheckins, 'exitMood'),
    '',
    '## Action Items',
    '',
  ]

  if (actionItems.length === 0) {
    lines.push('_No action items recorded._', '')
  } else {
    for (const item of actionItems) {
      const assignee = item.assigneeId ? nameByUserId.get(item.assigneeId) : null
      const meta: string[] = [`assignee: ${assignee ?? 'Unassigned'}`]
      if (item.dueDate) meta.push(`due: ${item.dueDate}`)
      if (item.status) meta.push(`status: ${item.status}`)

      const checkbox = item.status?.toLowerCase() === 'done' ? '[x]' : '[ ]'
      lines.push(`- ${checkbox} ${escapeInline(item.text)} — _(${meta.join(', ')})_`)

      const card = item.retroCardId ? cardById.get(item.retroCardId) : null
      if (card) lines.push(`  - From **${escapeInline(card.column)}**: ${escapeInline(card.content)}`)
    }
    lines.push('')
  }

  lines.push('## Cards', '')

  if (groups.length === 0) {
    lines.push('_No cards were written._', '')
  } else {
    for (const group of groups) {
      const anchor  = group.cards.find(c => c.id === group.anchorId) ?? group.cards[0]
      const heading = group.isGroup && group.label ? group.label : anchor.content
      const status  = group.cards.every(c => c.isDiscussed) ? 'discussed' : 'not discussed'

      lines.push(
        `### ${escapeInline(heading)}`,
        '',
        `- Column: **${escapeInline(anchor.column)}** · Votes: **${group.totalVotes}** · ${status}`,
      )

      const headingIsCard = !(group.isGroup && group.label)
      for (const card of group.cards) {
        // Skip the card whose text is already the heading.
        if (!headingIsCard || card.id !== anchor.id) {
          lines.push(`- ${escapeInline(card.content)}`)
        }
        const notes = card.discussionNotes?.trim()
        if (notes) lines.push('', blockquote(notes))
      }

      lines.push('')
    }
  }

  return lines.join('\n')
}

/** Filesystem-safe file name stem derived from the retro title. */
export function retroFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)
  const date = new Date().toISOString().slice(0, 10)
  return `${slug || 'retro'}-summary-${date}.md`
}

/** Triggers a client-side download of `content` as a Markdown file. */
export function downloadMarkdown(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
