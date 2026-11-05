import { useDeferredValue, useMemo, useState } from 'react'
import { EditSheet, EntryBack, EntryMeta, Sheet, SpeakLink } from '../components'
import { cardKey, formatInterval, MATURE_DAYS, State } from '../srs'
import { useAllEntries, useApp } from '../state'
import type { Entry, Progress } from '../types'

type Status = 'new' | 'learning' | 'review' | 'mature' | 'known'

function statusOf(id: string, p: Progress): Status {
  if (p.known[id]) return 'known'
  const c = p.cards[cardKey(id, 'f')]
  if (!c || c.state === State.New) return 'new'
  if (c.state === State.Learning || c.state === State.Relearning) return 'learning'
  return c.scheduled_days >= MATURE_DAYS ? 'mature' : 'review'
}

const STATUS_LABEL: Record<Status, string> = {
  new: 'New', learning: 'Learning', review: 'Learned', mature: 'Mature', known: 'Known',
}

export function Browse() {
  const { progress, decks, deckEntryIds, ready } = useApp()
  const all = useAllEntries()
  const [q, setQ] = useState('')
  const [deck, setDeck] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [limit, setLimit] = useState(100)
  const [open, setOpen] = useState<Entry | null>(null)
  const query = useDeferredValue(q.trim().toLowerCase())

  const deckSet = useMemo(() => (deck ? new Set(deckEntryIds(deck)) : null), [deck, deckEntryIds, ready])

  const rows = useMemo(() => {
    let list = all
    if (deckSet) list = list.filter((e) => deckSet.has(e.id))
    if (status) list = list.filter((e) => statusOf(e.id, progress) === status)
    if (query) {
      const starts: Entry[] = [], contains: Entry[] = []
      for (const raw of list) {
        const edit = progress.edits[raw.id]
        const e = edit ? { ...raw, ...edit } : raw
        const w = e.w.toLowerCase()
        if (w.startsWith(query)) starts.push(e)
        else if (w.includes(query) || e.t?.includes(query) || e.a?.some((a) => a.toLowerCase().includes(query))) contains.push(e)
      }
      starts.sort((a, b) => a.w.length - b.w.length)
      list = [...starts, ...contains]
    }
    return list
  }, [all, deckSet, status, query, progress])

  return (
    <div className="page">
      <div className="browse-controls">
        <input type="search" placeholder="Search English or Thai" value={q} onChange={(e) => { setQ(e.target.value); setLimit(100) }}
               aria-label="Search words" autoCapitalize="none" autoCorrect="off" />
        <div className="row gap">
          <select value={deck} onChange={(e) => { setDeck(e.target.value); setLimit(100) }} aria-label="Deck">
            <option value="">All decks</option>
            {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value as Status | ''); setLimit(100) }} aria-label="Status">
            <option value="">Any status</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <p className="hint">{ready ? `${rows.length.toLocaleString()} word${rows.length === 1 ? '' : 's'}` : 'Loading words…'}</p>
      </div>

      <ul className="word-list">
        {rows.slice(0, limit).map((e) => {
          const s = statusOf(e.id, progress)
          return (
            <li key={e.id}>
              <button className="word-row" onClick={() => setOpen(e)}>
                <span className="wr-main">
                  <span className="wr-word">{e.w}</span>
                  <span className="wr-th">{(progress.edits[e.id]?.t ?? e.t) || '—'}</span>
                </span>
                <span className="wr-side">
                  {e.l && <span className="chip level">{e.l}</span>}
                  <span className={`status s-${s}`}>{STATUS_LABEL[s]}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length > limit && <button className="btn outline wide" onClick={() => setLimit(limit + 200)}>Show more</button>}

      {open && <WordSheet id={open.id} onClose={() => setOpen(null)} />}
    </div>
  )
}

export function WordSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { entry, progress, setKnown, resetEntry, deleteCustom, decks, deckEntryIds } = useApp()
  const [editing, setEditing] = useState(false)
  const e = entry(id)
  const inDecks = useMemo(() => decks.filter((d) => !d.composed && deckEntryIds(d.id).includes(id)).map((d) => d.title),
    [decks, deckEntryIds, id])
  if (!e) return null
  const s = statusOf(id, progress)
  const f = progress.cards[cardKey(id, 'f')]
  const r = progress.cards[cardKey(id, 'r')]
  const when = (due: number) => due <= Date.now() ? 'due now' : `due in ${formatInterval(due - Date.now())}`

  if (editing) return <EditSheet e={e} onClose={() => setEditing(false)} />
  return (
    <Sheet title={e.w} onClose={onClose}>
      <div className="word-detail">
        <EntryMeta e={e} />
        {e.i && <p className="ipa">{e.i}</p>}
        {e.a?.length ? <p className="hint">Also: {e.a.join(', ')}</p> : null}
        <EntryBack e={e} />
        <dl className="facts">
          <dt>Status</dt><dd>{STATUS_LABEL[s]}</dd>
          {f && <><dt>English → Thai</dt><dd>{when(f.due)} · {f.reps} reviews</dd></>}
          {r && <><dt>Thai → English</dt><dd>{when(r.due)} · {r.reps} reviews</dd></>}
          {inDecks.length > 0 && <><dt>In decks</dt><dd>{inDecks.join(', ')}</dd></>}
        </dl>
        <div className="row gap wrap">
          <SpeakLink text={e.w} />
          <button className="btn outline small" onClick={() => setEditing(true)}>Edit</button>
          {s === 'known'
            ? <button className="btn outline small" onClick={() => setKnown(id, false)}>Unmark known</button>
            : !f && <button className="btn outline small" onClick={() => setKnown(id, true)}>I know this</button>}
          {f && <button className="btn outline small" onClick={() => { if (confirm(`Reset progress for “${e.w}”?`)) resetEntry(id) }}>Reset progress</button>}
          {e.custom && <button className="btn danger small" onClick={() => { if (confirm(`Delete “${e.w}” from My Words?`)) { deleteCustom(id); onClose() } }}>Delete</button>}
        </div>
      </div>
    </Sheet>
  )
}
