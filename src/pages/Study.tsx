import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditSheet, EntryBack, EntryMeta, SpeakLink } from '../components'
import { dueKeys, interleave, newLeftToday, pickNew } from '../queue'
import { formatInterval, GRADES, LEARN_AHEAD_MS, preview, splitKey, State } from '../srs'
import { useApp } from '../state'
import type { Grade } from 'ts-fsrs'

interface Session {
  queue: string[]                 // reviews + new, in order
  learning: { key: string; due: number }[]
  done: number
}

export function Study({ go }: { go: (tab: string) => void }) {
  const app = useApp()
  const { progress, entry, deckEntryIds, answer, setKnown } = app
  const [session, setSession] = useState<Session | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [editing, setEditing] = useState(false)
  const undoRef = useRef<{ undo: () => void; key: string; session: Session } | null>(null)
  const [, force] = useState(0)

  // Build the session once, when the page opens.
  useEffect(() => {
    if (session) return
    const reviews = dueKeys(progress, (id) => !!entry(id))
    const fresh = pickNew(progress, deckEntryIds, newLeftToday(progress))
    const s = { queue: interleave(reviews, fresh), learning: [], done: 0 }
    setSession(s)
    setCurrent(next(s))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const next = (s: Session): string | null => {
    const now = Date.now()
    s.learning.sort((a, b) => a.due - b.due)
    if (s.learning[0] && s.learning[0].due <= now) return s.learning.shift()!.key
    if (s.queue.length) return s.queue.shift()!
    if (s.learning.length) return s.learning.shift()!.key   // learn ahead
    return null
  }

  const state = current ? progress.cards[current] : undefined
  const previews = useMemo(() => (current ? preview(state) : null), [current, state])

  const onGrade = useCallback((g: Grade) => {
    if (!current || !session) return
    const snapshot: Session = { queue: [current, ...session.queue], learning: [...session.learning], done: session.done }
    const res = answer(current, g)
    undoRef.current = { ...res, key: current, session: snapshot }
    const after = previews![g]
    const s = { ...session, learning: [...session.learning], done: session.done + 1 }
    if ((after.state === State.Learning || after.state === State.Relearning) && after.due - Date.now() <= LEARN_AHEAD_MS) {
      s.learning.push({ key: current, due: after.due })
    }
    setSession(s)
    setCurrent(next(s))
    setShown(false)
  }, [current, session, answer, previews])

  const onKnown = () => {
    if (!current || !session) return
    setKnown(splitKey(current).id, true)
    undoRef.current = null
    const s = { ...session }
    // replace the skipped new card with the next one from the decks, if any
    const more = pickNew({ ...progress, known: { ...progress.known, [splitKey(current).id]: Date.now() } },
      deckEntryIds, 1 + s.queue.filter((k) => !progress.cards[k]).length)
      .filter((k) => k !== current && !s.queue.includes(k))
    if (more[0]) s.queue = [...s.queue, more[0]]
    setSession(s)
    setCurrent(next(s))
    setShown(false)
  }

  const onUndo = () => {
    const u = undoRef.current
    if (!u) return
    u.undo()
    undoRef.current = null
    setSession({ ...u.session, queue: u.session.queue.slice(1) })
    setCurrent(u.key)
    setShown(false)
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (editing || (ev.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (!shown && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); setShown(true) }
      else if (shown) {
        const g = GRADES.find((x) => x.key === ev.key)
        if (g) onGrade(g.grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, onGrade, editing])

  // re-render once a learn-ahead card becomes due so the counter stays honest
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  if (!session) return <div className="center-screen"><div className="spinner" /></div>

  if (!current) {
    return (
      <div className="page done-page">
        <h1>Done for now</h1>
        <p>{session.done ? `You answered ${session.done} card${session.done === 1 ? '' : 's'}.` : 'Nothing is due right now.'}</p>
        <div className="row gap center">
          <button className="btn primary" onClick={() => go('home')}>Back to decks</button>
          {undoRef.current && <button className="btn ghost" onClick={onUndo}>Undo last</button>}
        </div>
      </div>
    )
  }

  const { id, dir } = splitKey(current)
  const e = entry(id)
  if (!e) { // entry vanished (e.g. deleted custom word)
    const s = { ...session }
    setTimeout(() => { setSession(s); setCurrent(next(s)) })
    return null
  }
  const isNew = !state || state.state === State.New
  const remaining = session.queue.length + session.learning.length + 1

  return (
    <div className="page study">
      <div className="study-top">
        <button className="btn ghost small" onClick={() => go('home')}>‹ Decks</button>
        <span className="counter" aria-label={`${remaining} cards left`}>{remaining} left</span>
        <button className="btn ghost small" disabled={!undoRef.current} onClick={onUndo}>Undo</button>
      </div>

      <article className={`card ${shown ? 'flipped' : ''}`} onClick={() => !shown && setShown(true)}>
        <div className="card-tags">
          {isNew && <span className="chip good">new</span>}
          {dir === 'r' && <span className="chip muted">Thai → English</span>}
        </div>
        {dir === 'f' ? (
          <div className="front">
            <h1 className="word">{e.w}</h1>
            <EntryMeta e={e} />
            {e.i && <p className="ipa">{e.i}</p>}
          </div>
        ) : (
          <div className="front">
            <p className="thai big">{e.t || '(no Thai meaning yet)'}</p>
            <EntryMeta e={e} />
          </div>
        )}
        {shown && (
          <>
            <hr />
            {dir === 'r' && (
              <div className="front">
                <h1 className="word">{e.w}</h1>
                {e.i && <p className="ipa">{e.i}</p>}
              </div>
            )}
            {dir === 'f' ? <EntryBack e={e} /> : <EntryBack e={{ ...e, t: undefined }} />}
          </>
        )}
        {!shown && <p className="tap-hint">Tap to show answer</p>}
      </article>

      <div className="card-tools">
        <SpeakLink text={e.w} />
        {shown && <button className="btn ghost small" onClick={() => setEditing(true)}>Edit</button>}
        {isNew && dir === 'f' && <button className="btn ghost small" onClick={onKnown}>I know this</button>}
      </div>

      <div className="answer-bar">
        {!shown ? (
          <button className="btn primary big" onClick={() => setShown(true)}>Show answer</button>
        ) : (
          <div className="grades">
            {GRADES.map(({ grade, label }) => (
              <button key={grade} className={`btn grade g${grade}`} onClick={() => onGrade(grade)}>
                <span className="ivl">{previews ? formatInterval(previews[grade].due - Date.now()) : ''}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {editing && <EditSheet e={e} onClose={() => setEditing(false)} />}
    </div>
  )
}
