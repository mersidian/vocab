import { useMemo, useState } from 'react'
import { ProgressBar } from '../components'
import { dueKeys, newLeftToday, pickNew } from '../queue'
import { cardKey, MATURE_DAYS, streak } from '../srs'
import { MY_WORDS, useApp } from '../state'
import type { Deck, Progress } from '../types'

export function deckStats(ids: string[], p: Progress) {
  let learned = 0, mature = 0, known = 0
  for (const id of ids) {
    if (p.known[id]) { known++; continue }
    const c = p.cards[cardKey(id, 'f')]
    if (c) { learned++; if (c.scheduled_days >= MATURE_DAYS) mature++ }
  }
  return { total: ids.length, learned, mature, known }
}

const CATEGORY_ORDER = ['Levels', 'Exam Prep', 'General', 'Academic & Exams', 'Specialized', 'Phrasal Verbs & Idioms', 'My Words']

export function Home({ go }: { go: (tab: string) => void }) {
  const { progress, decks, deckEntryIds, saveSettings, entry, ready } = useApp()
  const [open, setOpen] = useState<string | null>('Levels')
  const studying = progress.settings.studying

  const today = useMemo(() => {
    if (!ready) return null
    const due = dueKeys(progress, (id) => !!entry(id)).length
    const left = newLeftToday(progress)
    const fresh = pickNew(progress, deckEntryIds, left).length
    return { due, fresh }
  }, [progress, ready, entry, deckEntryIds])

  const toggle = (d: Deck) => {
    const s = studying.includes(d.id) ? studying.filter((x) => x !== d.id) : [...studying, d.id]
    saveSettings({ ...progress.settings, studying: s })
  }

  const grouped = useMemo(() => {
    const g = new Map<string, Deck[]>()
    for (const d of decks) g.set(d.category, [...(g.get(d.category) ?? []), d])
    return [...g.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]))
  }, [decks])

  const days = streak(progress)
  const total = today ? today.due + today.fresh : 0

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-stats">
          <div><span className="num">{today ? today.due : '–'}</span><span className="lbl">to review</span></div>
          <div><span className="num">{today ? today.fresh : '–'}</span><span className="lbl">new</span></div>
          <div><span className="num">{days}</span><span className="lbl">day streak</span></div>
        </div>
        <button className="btn primary big" disabled={!ready || total === 0} onClick={() => go('study')}>
          {!ready ? 'Loading words…' : total === 0 ? 'All done for today' : `Study ${total} card${total === 1 ? '' : 's'}`}
        </button>
        {ready && total === 0 && studying.length === 0 && (
          <p className="hint">Choose a deck below to start learning.</p>
        )}
      </section>

      <h2 className="section-title">Decks</h2>
      <p className="hint">Tap <b>Study</b> on any deck to include it. New words come from your chosen decks, most common words first.</p>

      {grouped.map(([cat, list]) => (
        <section key={cat} className="group">
          <button className="group-head" aria-expanded={open === cat} onClick={() => setOpen(open === cat ? null : cat)}>
            <span>{cat}</span>
            <span className="group-count">{list.filter((d) => studying.includes(d.id)).length || ''}</span>
            <span className={`chev ${open === cat ? 'up' : ''}`} aria-hidden="true">›</span>
          </button>
          {open === cat && (
            <ul className="deck-list">
              {list.map((d) => {
                const ids = ready || d.id === MY_WORDS ? deckEntryIds(d.id) : []
                const s = deckStats(ids, progress)
                const on = studying.includes(d.id)
                return (
                  <li key={d.id} className={`deck ${on ? 'on' : ''}`}>
                    <div className="deck-main">
                      <div className="deck-title">{d.title}</div>
                      <div className="deck-sub">
                        {ready || d.id === MY_WORDS
                          ? `${s.learned + s.known} / ${s.total} words${s.known ? ` · ${s.known} known` : ''}`
                          : `${d.items.length} words`}
                        {d.composed && ' · built from level lists, not an official list'}
                      </div>
                      <ProgressBar value={s.learned + s.known} max={s.total || d.items.length} label={`${d.title} progress`} />
                    </div>
                    <button className={`btn small ${on ? 'primary' : 'outline'}`} aria-pressed={on} onClick={() => toggle(d)}>
                      {on ? 'Studying' : 'Study'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
