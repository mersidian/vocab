import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allLoaded, entryAt, loadAll, loadIndex, positionOf } from './data'
import { cardKey, dayKey, fromCard, newCardState, REVERSE_AFTER_DAYS, scheduler, State, toCard, endOfStudyDay } from './srs'
import type { Store } from './store'
import type { CardState, DataIndex, Deck, Entry, EntryEdit, Progress, Settings } from './types'
import type { Grade } from 'ts-fsrs'

export const MY_WORDS = 'my-words'

interface Ctx {
  index: DataIndex
  decks: Deck[]                 // includes the "My Words" deck
  progress: Progress
  ready: boolean                // all entry shards loaded
  storeKind: Store['kind']
  error: string | null
  clearError(): void
  entry(id: string): Entry | undefined
  deckEntryIds(deckId: string): string[]
  answer(key: string, grade: Grade): { undo: () => void }
  setKnown(id: string, known: boolean): void
  resetEntry(id: string): void
  saveEdit(id: string, edit: EntryEdit | null): void
  saveSettings(s: Settings): void
  addCustom(entries: Omit<Entry, 'id' | 'custom'>[]): number
  deleteCustom(id: string): void
  exportBackup(): Progress
  importBackup(p: Progress): Promise<void>
}

const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

export function AppProvider({ store, children }: { store: Store; children: ReactNode }) {
  const [index, setIndex] = useState<DataIndex | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const progressRef = useRef<Progress | null>(null)
  progressRef.current = progress

  useEffect(() => {
    let alive = true
    Promise.all([loadIndex(), store.load()])
      .then(([i, p]) => { if (alive) { setIndex(i); setProgress(p) } })
      .catch((e) => alive && setError(String(e.message ?? e)))
    loadAll().then(() => alive && setReady(true)).catch((e) => alive && setError(String(e.message ?? e)))
    return () => { alive = false }
  }, [store])

  const fail = useCallback((e: unknown) => setError(`Could not save: ${(e as Error)?.message ?? e}`), [])

  const update = useCallback((fn: (p: Progress) => Progress) => {
    setProgress((p) => (p ? fn(p) : p))
  }, [])

  const entry = useCallback((id: string): Entry | undefined => {
    const p = progressRef.current
    let e: Entry | undefined = p?.custom[id]
    if (!e) {
      const pos = positionOf(id)
      e = pos === undefined ? undefined : entryAt(pos)
    }
    const edit = p?.edits[id]
    return e && edit ? { ...e, ...Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined)) } : e
  }, [])

  const decks = useMemo<Deck[]>(() => {
    if (!index) return []
    return [...index.decks, { id: MY_WORDS, title: 'My Words', category: 'My Words', items: [] }]
  }, [index])

  const deckEntryIds = useCallback((deckId: string): string[] => {
    if (deckId === MY_WORDS) {
      return Object.values(progressRef.current?.custom ?? {})
        .sort((a, b) => a.id.localeCompare(b.id)).map((e) => e.id)
    }
    const d = index?.decks.find((x) => x.id === deckId)
    if (!d) return []
    return d.items.map((pos) => entryAt(pos)?.id).filter((x): x is string => !!x)
  }, [index])

  const answer = useCallback((key: string, grade: Grade) => {
    const p = progressRef.current!
    const prev = p.cards[key]
    const now = new Date()
    const before = prev ?? newCardState(now)
    const after = fromCard(scheduler.next(toCard(before), now, grade).card)
    const changes: Record<string, CardState | null> = { [key]: after }
    const [id, dir] = [key.slice(0, key.lastIndexOf('|')), key.slice(key.lastIndexOf('|') + 1)]
    const rKey = cardKey(id, 'r')
    let addedReverse = false
    if (dir === 'f' && p.settings.reverse && !p.cards[rKey] && after.state === State.Review
        && after.scheduled_days >= REVERSE_AFTER_DAYS) {
      changes[rKey] = { ...newCardState(now), due: endOfStudyDay(now) }
      addedReverse = true
    }
    const wasNew = !prev || prev.state === State.New
    const delta = { r: 1, n: wasNew && dir === 'f' ? 1 : 0, a: grade === 1 && prev?.state === State.Review ? 1 : 0 }
    const dayK = dayKey()
    const prevDay = p.days[dayK]
    const base = prevDay ?? { n: 0, r: 0, a: 0 }
    const nextDay = { n: base.n + delta.n, r: base.r + delta.r, a: base.a + delta.a }
    update((q) => ({
      ...q,
      cards: { ...q.cards, ...(changes as Record<string, CardState>) },
      days: { ...q.days, [dayK]: nextDay },
    }))
    store.saveCards(changes).catch(fail)
    store.saveDay(dayK, nextDay).catch(fail)
    return {
      undo: () => {
        const restore: Record<string, CardState | null> = { [key]: prev ?? null }
        if (addedReverse) restore[rKey] = null
        update((q) => {
          const cards = { ...q.cards }
          for (const [k, v] of Object.entries(restore)) { if (v) cards[k] = v; else delete cards[k] }
          const days = { ...q.days }
          if (prevDay) days[dayK] = prevDay; else delete days[dayK]
          return { ...q, cards, days }
        })
        store.saveCards(restore).catch(fail)
        store.saveDay(dayK, prevDay ?? { n: 0, r: 0, a: 0 }).catch(fail)
      },
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  const setKnown = useCallback((id: string, known: boolean) => {
    const t = known ? Date.now() : null
    update((p) => {
      const k = { ...p.known }
      if (t) k[id] = t; else delete k[id]
      return { ...p, known: k }
    })
    store.setKnown(id, t).catch(fail)
  }, [store, update, fail])

  const resetEntry = useCallback((id: string) => {
    const keys = [cardKey(id, 'f'), cardKey(id, 'r')]
    update((p) => {
      const cards = { ...p.cards }
      keys.forEach((k) => delete cards[k])
      const known = { ...p.known }
      delete known[id]
      return { ...p, cards, known }
    })
    store.saveCards(Object.fromEntries(keys.map((k) => [k, null]))).catch(fail)
    store.setKnown(id, null).catch(fail)
  }, [store, update, fail])

  const saveEdit = useCallback((id: string, edit: EntryEdit | null) => {
    if (progressRef.current?.custom[id]) {
      const merged = { ...progressRef.current.custom[id], ...(edit ?? {}) }
      update((p) => ({ ...p, custom: { ...p.custom, [id]: merged } }))
      store.saveCustom(merged).catch(fail)
      return
    }
    update((p) => {
      const edits = { ...p.edits }
      if (edit) edits[id] = edit; else delete edits[id]
      return { ...p, edits }
    })
    store.saveEdit(id, edit).catch(fail)
  }, [store, update, fail])

  const saveSettings = useCallback((s: Settings) => {
    update((p) => ({ ...p, settings: s }))
    store.saveSettings(s).catch(fail)
  }, [store, update, fail])

  const addCustom = useCallback((rows: Omit<Entry, 'id' | 'custom'>[]) => {
    const existing = new Set(Object.values(progressRef.current?.custom ?? {}).map((e) => e.w.toLowerCase()))
    const added: Entry[] = []
    const stamp = Date.now().toString(36)
    rows.forEach((r, i) => {
      const w = r.w.trim()
      if (!w || existing.has(w.toLowerCase())) return
      existing.add(w.toLowerCase())
      const clean = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== ''))
      added.push({ ...clean, w, id: `u_${stamp}${i.toString(36).padStart(3, '0')}`, custom: true } as Entry)
    })
    if (added.length) {
      update((p) => ({ ...p, custom: { ...p.custom, ...Object.fromEntries(added.map((e) => [e.id, e])) } }))
      added.forEach((e) => store.saveCustom(e).catch(fail))
    }
    return added.length
  }, [store, update, fail])

  const deleteCustom = useCallback((id: string) => {
    update((p) => {
      const custom = { ...p.custom }
      delete custom[id]
      const cards = { ...p.cards }
      delete cards[cardKey(id, 'f')]
      delete cards[cardKey(id, 'r')]
      return { ...p, custom, cards }
    })
    store.deleteCustom(id).catch(fail)
    store.saveCards({ [cardKey(id, 'f')]: null, [cardKey(id, 'r')]: null }).catch(fail)
  }, [store, update, fail])

  const exportBackup = useCallback(() => structuredClone(progressRef.current!), [])

  const importBackup = useCallback(async (p: Progress) => {
    await store.replaceAll(p)
    setProgress(structuredClone(p))
  }, [store])

  if (!index || !progress) {
    return (
      <div className="center-screen">
        {error ? <p className="error-text">{error}</p> : <div className="spinner" aria-label="Loading" />}
      </div>
    )
  }

  const value: Ctx = {
    index, decks, progress, ready, storeKind: store.kind, error, clearError: () => setError(null),
    entry, deckEntryIds, answer, setKnown, resetEntry, saveEdit, saveSettings, addCustom, deleteCustom,
    exportBackup, importBackup,
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

/** All built-in + custom entries (only complete once `ready`). */
export function useAllEntries(): Entry[] {
  const { progress, ready } = useApp()
  return useMemo(() => [...allLoaded(), ...Object.values(progress.custom)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, progress.custom])
}
