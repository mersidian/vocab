/** One flashcard entry as shipped in public/data/s<N>.json (compact keys). */
export interface Entry {
  id: string
  w: string          // word or phrase
  p?: string         // part of speech
  l?: string         // CEFR level
  k?: 'phrasal' | 'idiom'
  a?: string[]       // alternative spellings
  i?: string         // IPA
  t?: string         // Thai meaning(s)
  x?: string         // example sentence
  xt?: string        // Thai translation of the example
  n?: string         // note
  custom?: boolean
}

export interface Deck {
  id: string
  title: string
  category: string
  composed?: boolean
  items: number[]    // indexes into the global entry order (custom deck: unused)
}

export interface DataIndex {
  version: number
  total: number
  shardSize: number
  shards: number
  withContent: number
  decks: Deck[]
}

/** Serialized ts-fsrs card (dates as epoch ms). */
export interface CardState {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps?: number
  reps: number
  lapses: number
  state: number
  last_review?: number
}

export interface Settings {
  newPerDay: number
  studying: string[]     // deck ids, in priority order
  reverse: boolean       // add Thai -> English cards after a word is learned
}

export interface EntryEdit {
  t?: string
  x?: string
  xt?: string
  n?: string
}

export interface DayLog {
  n: number   // new cards introduced
  r: number   // reviews (all answers)
  a: number   // "Again" answers on review cards
}

export interface Progress {
  cards: Record<string, CardState>        // key: `${entryId}|f` or `${entryId}|r`
  known: Record<string, number>           // entryId -> time marked known
  edits: Record<string, EntryEdit>
  custom: Record<string, Entry>
  days: Record<string, DayLog>            // 'YYYY-MM-DD'
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  studying: ['cefr-a1'],
  reverse: true,
}

export function emptyProgress(): Progress {
  return { cards: {}, known: {}, edits: {}, custom: {}, days: {}, settings: { ...DEFAULT_SETTINGS } }
}
