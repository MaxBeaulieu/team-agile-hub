// Shared helpers for retro card grouping: auto-generated ("frankenstein") group
// labels and group-aware vote aggregation. Used by both the team retro and the
// quick retro boards.

/** Matches the `group_label` column length in the database. */
export const GROUP_LABEL_MAX = 100

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'for', 'from', 'get', 'got', 'had',
  'has', 'have', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just',
  'me', 'my', 'not', 'of', 'on', 'or', 'our', 'out', 'so', 'some', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to',
  'too', 'us', 'very', 'was', 'we', 'were', 'what', 'when', 'which', 'while',
  'who', 'will', 'with', 'would', 'you', 'your',
])

function cleanWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1)
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** Shortest meaningful fragment of a card: its first few non-filler words. */
function snippetOf(content: string, maxWords = 3): string {
  const words = content.trim().split(/\s+/).map(cleanWord).filter(Boolean)
  if (words.length === 0) return ''
  const meaningful = words.filter(w => !STOP_WORDS.has(w.toLowerCase()))
  const picked = (meaningful.length > 0 ? meaningful : words).slice(0, maxWords)
  return capitalize(picked.join(' '))
}

/**
 * Stitches a group name together out of the cards it contains, e.g.
 * ["Standup runs too long", "Too many meetings"] → "Standup runs long + Many meetings".
 */
export function buildGroupLabel(contents: string[]): string {
  const seen = new Set<string>()
  const snippets: string[] = []

  for (const content of contents) {
    const snippet = snippetOf(content)
    if (!snippet) continue
    const key = snippet.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    snippets.push(snippet)
  }

  if (snippets.length === 0) return ''
  return truncate(snippets.join(' + '), GROUP_LABEL_MAX)
}

// ─── Grouping & votes ───────────────────────────────────────────────────────

type VoteLike = { userId: string; count: number }

export type GroupableCard = {
  id: string
  content: string
  groupId: string | null
  groupLabel: string | null
  retro_votes: VoteLike[]
}

export type CardGroup<T extends GroupableCard> = {
  /** Stable key — the shared groupId, or the card id when ungrouped. */
  key: string
  /** Card that carries the group's votes (the one whose id is the groupId). */
  anchorId: string
  label: string | null
  cards: T[]
  isGroup: boolean
  /** Votes cast by everyone (visible to the caller) across the whole group. */
  totalVotes: number
}

export function sumVotes(cards: GroupableCard[]): number {
  return cards.reduce((sum, c) => sum + c.retro_votes.reduce((s, v) => s + v.count, 0), 0)
}

export function sumMyVotes(cards: GroupableCard[], userId: string): number {
  return cards.reduce(
    (sum, c) => sum + c.retro_votes.filter(v => v.userId === userId).reduce((s, v) => s + v.count, 0),
    0,
  )
}

/** Collapses cards into groups, preserving the order cards first appear in. */
export function groupCards<T extends GroupableCard>(cards: T[]): CardGroup<T>[] {
  const order: string[] = []
  const buckets = new Map<string, T[]>()

  for (const card of cards) {
    const key = card.groupId ?? card.id
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(card)
  }

  return order.map(key => {
    const grouped = buckets.get(key)!
    const anchor  = grouped.find(c => c.id === key) ?? grouped[0]
    return {
      key,
      anchorId:   anchor.id,
      label:      grouped.find(c => c.groupLabel)?.groupLabel ?? null,
      cards:      grouped,
      isGroup:    grouped.length > 1,
      totalVotes: sumVotes(grouped),
    }
  })
}

/** cardId → total votes of the group that card belongs to. */
export function groupVotesByCardId(cards: GroupableCard[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const group of groupCards(cards)) {
    for (const card of group.cards) map[card.id] = group.totalVotes
  }
  return map
}
