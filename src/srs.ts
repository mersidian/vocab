import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs'
import type { CardState, Progress } from './types'

export const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }))
export { Rating, State }
export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: Rating.Again, label: 'Again', key: '1' },
  { grade: Rating.Hard, label: 'Hard', key: '2' },
  { grade: Rating.Good, label: 'Good', key: '3' },
  { grade: Rating.Easy, label: 'Easy', key: '4' },
]

/** Reverse (Thai -> English) card is added once the forward card reaches this interval. */
export const REVERSE_AFTER_DAYS = 3
/** Learning cards due within this window are shown in the current session. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000
export const MATURE_DAYS = 21

export function toCard(s: CardState): Card {
  return {
    ...(s as unknown as Card),
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card
}

export function fromCard(c: Card): CardState {
  const s: CardState = {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
  }
  const steps = (c as unknown as { learning_steps?: number }).learning_steps
  if (steps !== undefined) s.learning_steps = steps
  if (c.last_review) s.last_review = c.last_review.getTime()
  return s
}

export function newCardState(now = new Date()): CardState {
  return fromCard(createEmptyCard(now))
}

export function preview(s: CardState | undefined, now = new Date()): Record<number, CardState> {
  const card = s ? toCard(s) : createEmptyCard(now)
  const out: Record<number, CardState> = {}
  for (const { grade } of GRADES) out[grade] = fromCard(scheduler.next(card, now, grade).card)
  return out
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(ms / 86400000)
  if (d < 31) return `${d}d`
  const mo = d / 30.4
  if (mo < 12) return `${mo.toFixed(mo < 10 ? 1 : 0).replace(/\.0$/, '')}mo`
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}y`
}

/* ------------------------------------------------------------ day helpers */
export function dayKey(t: number | Date = new Date()): string {
  const d = new Date(t)
  // the study day rolls over at 04:00 local time, like Anki
  d.setHours(d.getHours() - 4)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function endOfStudyDay(now = new Date()): number {
  const d = new Date(now)
  d.setHours(d.getHours() - 4)
  d.setHours(24 + 4, 0, 0, 0)
  return d.getTime()
}

export function streak(p: Progress, now = new Date()): number {
  let n = 0
  const d = new Date(now)
  const has = (k: string) => (p.days[k]?.r ?? 0) + (p.days[k]?.n ?? 0) > 0
  if (!has(dayKey(d))) d.setDate(d.getDate() - 1)   // today not done yet: count up to yesterday
  while (has(dayKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export const cardKey = (id: string, dir: 'f' | 'r') => `${id}|${dir}`
export const splitKey = (key: string) => {
  const i = key.lastIndexOf('|')
  return { id: key.slice(0, i), dir: key.slice(i + 1) as 'f' | 'r' }
}
