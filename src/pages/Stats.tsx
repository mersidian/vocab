import { useMemo } from 'react'
import { ProgressBar } from '../components'
import { dayKey, MATURE_DAYS, State, streak } from '../srs'
import { useApp } from '../state'
import { deckStats } from './Home'

export function Stats() {
  const { progress, decks, deckEntryIds, ready } = useApp()
  const p = progress

  const totals = useMemo(() => {
    let learned = 0, mature = 0, reverse = 0
    for (const [k, c] of Object.entries(p.cards)) {
      if (k.endsWith('|r')) { reverse++; continue }
      if (c.state !== State.New) learned++
      if (c.scheduled_days >= MATURE_DAYS) mature++
    }
    return { learned, mature, reverse, known: Object.keys(p.known).length }
  }, [p.cards, p.known])

  // reviews due per day for the next 30 days
  const forecast = useMemo(() => {
    const out = Array.from({ length: 30 }, () => 0)
    const start = new Date()
    const todayKey = dayKey(start)
    const keys = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return dayKey(d)
    })
    for (const c of Object.values(p.cards)) {
      const k = dayKey(c.due)
      const i = k <= todayKey ? 0 : keys.indexOf(k)
      if (i >= 0) out[i]++
    }
    return out
  }, [p.cards])

  // last 16 weeks of activity
  const history = useMemo(() => {
    const days: { key: string; count: number }[] = []
    const d = new Date()
    for (let i = 0; i < 16 * 7; i++) {
      const k = dayKey(d)
      days.unshift({ key: k, count: (p.days[k]?.r ?? 0) })
      d.setDate(d.getDate() - 1)
    }
    return days
  }, [p.days])

  const month = useMemo(() => {
    let r = 0, a = 0, n = 0, active = 0
    history.slice(-30).forEach(({ key }) => {
      const l = p.days[key]
      if (!l) return
      r += l.r; a += l.a; n += l.n
      if (l.r) active++
    })
    const reviewsOnly = r - n
    return { r, n, active, retention: reviewsOnly > 0 ? Math.round((1 - a / reviewsOnly) * 100) : null }
  }, [history, p.days])

  const maxF = Math.max(1, ...forecast)
  const maxH = Math.max(1, ...history.map((h) => h.count))
  const today = p.days[dayKey()] ?? { n: 0, r: 0, a: 0 }
  const studied = decks.filter((d) => p.settings.studying.includes(d.id))

  return (
    <div className="page">
      <div className="tiles">
        <div className="tile"><span className="num">{streak(p)}</span><span className="lbl">day streak</span></div>
        <div className="tile"><span className="num">{today.r}</span><span className="lbl">answers today</span></div>
        <div className="tile"><span className="num">{totals.learned.toLocaleString()}</span><span className="lbl">words learned</span></div>
        <div className="tile"><span className="num">{totals.mature.toLocaleString()}</span><span className="lbl">mature (21d+)</span></div>
        <div className="tile"><span className="num">{totals.known.toLocaleString()}</span><span className="lbl">marked known</span></div>
        <div className="tile"><span className="num">{month.retention === null ? '–' : `${month.retention}%`}</span><span className="lbl">recall, 30 days</span></div>
      </div>

      <section className="panel">
        <h2>Coming up · next 30 days</h2>
        <div className="bars" role="img" aria-label={`Reviews due: today ${forecast[0]}, tomorrow ${forecast[1]}`}>
          {forecast.map((v, i) => (
            <div key={i} className="bar-col" title={`${i === 0 ? 'Today' : `In ${i} day${i > 1 ? 's' : ''}`}: ${v}`}>
              <div className="bar-v" style={{ height: `${(v / maxF) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="axis"><span>Today</span><span>+15d</span><span>+29d</span></div>
        <p className="hint">Today {forecast[0]} · tomorrow {forecast[1]} · this week {forecast.slice(0, 7).reduce((a, b) => a + b, 0)}</p>
      </section>

      <section className="panel">
        <h2>Activity · last 16 weeks</h2>
        <div className="heat" role="img" aria-label={`${month.active} active days in the last 30 days`}>
          {history.map((h) => (
            <span key={h.key} className="heat-cell" title={`${h.key}: ${h.count} answers`}
                  style={{ opacity: h.count ? 0.25 + 0.75 * (h.count / maxH) : 1 }} data-on={h.count > 0} />
          ))}
        </div>
        <p className="hint">Last 30 days: {month.active} active days · {month.n} new words · {month.r} answers</p>
      </section>

      <section className="panel">
        <h2>Decks you study</h2>
        {!ready ? <p className="hint">Loading…</p> : studied.length === 0 ? <p className="hint">No decks chosen yet.</p> : (
          <ul className="deck-stats">
            {studied.map((d) => {
              const s = deckStats(deckEntryIds(d.id), p)
              return (
                <li key={d.id}>
                  <div className="row between"><span>{d.title}</span><span className="hint">{s.learned + s.known} / {s.total}</span></div>
                  <ProgressBar value={s.learned + s.known} max={s.total} label={d.title} />
                  <div className="hint">{s.mature} mature · {s.known} known</div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
