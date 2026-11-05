import { cardKey, dayKey, endOfStudyDay, LEARN_AHEAD_MS, splitKey, State } from './srs'
import type { Progress } from './types'

export interface TodayCounts {
  due: number          // review + learning cards due today
  newLeft: number      // new cards still allowed today
  newAvailable: number // new cards that exist in studied decks (capped by newLeft)
}

export function dueKeys(p: Progress, exists: (id: string) => boolean, now = Date.now()): string[] {
  const eod = endOfStudyDay(new Date(now))
  return Object.entries(p.cards)
    .filter(([key, s]) => {
      if (!exists(splitKey(key).id)) return false
      if (key.endsWith('|r') && !p.settings.reverse) return false
      const learning = s.state === State.Learning || s.state === State.Relearning
      return learning ? s.due <= now + LEARN_AHEAD_MS : s.due <= eod
    })
    .sort((a, b) => a[1].due - b[1].due)
    .map(([k]) => k)
}

export function newLeftToday(p: Progress): number {
  return Math.max(0, p.settings.newPerDay - (p.days[dayKey()]?.n ?? 0))
}

/**
 * Pick new forward cards from the studied decks, round-robin in the order the
 * decks were chosen, each deck in its own (frequency) order.
 */
export function pickNew(p: Progress, deckIds: (deck: string) => string[], limit: number): string[] {
  if (limit <= 0) return []
  const lists = p.settings.studying.map((d) => deckIds(d))
  const ptr = lists.map(() => 0)
  const out: string[] = []
  const seen = new Set<string>()
  let progress = true
  while (out.length < limit && progress) {
    progress = false
    for (let i = 0; i < lists.length && out.length < limit; i++) {
      const list = lists[i]
      while (ptr[i] < list.length) {
        const id = list[ptr[i]++]
        if (seen.has(id) || p.known[id] || p.cards[cardKey(id, 'f')]) continue
        seen.add(id)
        out.push(cardKey(id, 'f'))
        progress = true
        break
      }
    }
  }
  return out
}

/** Spread new cards evenly through the reviews. */
export function interleave(reviews: string[], fresh: string[]): string[] {
  if (!fresh.length) return reviews
  if (!reviews.length) return fresh
  const out: string[] = []
  const step = (reviews.length + fresh.length) / fresh.length
  let r = 0, n = 0
  for (let i = 0; i < reviews.length + fresh.length; i++) {
    if (n < fresh.length && i >= Math.round(n * step + step / 2) - 1) out.push(fresh[n++])
    else if (r < reviews.length) out.push(reviews[r++])
    else out.push(fresh[n++])
  }
  return out
}
