import { useEffect, useState, type ReactNode } from 'react'
import { translateUrl } from './data'
import { useApp } from './state'
import type { Entry } from './types'

export function Chip({ children, tone }: { children: ReactNode; tone?: 'level' | 'muted' | 'good' | 'warn' }) {
  return <span className={`chip ${tone ?? ''}`}>{children}</span>
}

export function EntryMeta({ e }: { e: Entry }) {
  return (
    <span className="meta-row">
      {e.p && <Chip tone="muted">{e.p}</Chip>}
      {e.k && <Chip tone="muted">{e.k === 'phrasal' ? 'phrasal verb' : 'idiom'}</Chip>}
      {e.l && <Chip tone="level">{e.l}</Chip>}
      {e.custom && <Chip tone="good">my word</Chip>}
    </span>
  )
}

export function SpeakLink({ text, label = 'Listen' }: { text: string; label?: string }) {
  return (
    <a className="btn ghost small" href={translateUrl(text)} target="_blank" rel="noopener noreferrer"
       aria-label={`${label}: open Google Translate for “${text}”`}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" fill="currentColor" />
      </svg>
      {label}
    </a>
  )
}

/** Example sentence with the headword emphasised. */
export function Example({ text, word }: { text: string; word: string }) {
  const stem = word.split(' ')[0].replace(/[^a-zA-Z'-]/g, '')
  if (stem.length < 2) return <>{text}</>
  const re = new RegExp(`(\\b${stem.slice(0, Math.max(3, stem.length - 2))}[a-zA-Z'-]*)`, 'i')
  const parts = text.split(re)
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>
}

export function EntryBack({ e }: { e: Entry }) {
  return (
    <div className="entry-back">
      {e.t ? <p className="thai">{e.t}</p> : (
        <p className="pending">Thai meaning not added yet. <a href={translateUrl(e.w)} target="_blank" rel="noopener noreferrer">Look it up</a></p>
      )}
      {e.x && (
        <div className="example">
          <p className="en"><Example text={e.x} word={e.w} /></p>
          {e.xt && <p className="th">{e.xt}</p>}
        </div>
      )}
      {e.n && <p className="note">{e.n}</p>}
    </div>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(ev) => ev.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function EditSheet({ e, onClose }: { e: Entry; onClose: () => void }) {
  const { saveEdit, progress } = useApp()
  const [t, setT] = useState(e.t ?? '')
  const [x, setX] = useState(e.x ?? '')
  const [xt, setXt] = useState(e.xt ?? '')
  const [n, setN] = useState(e.n ?? '')
  const hasEdit = !!progress.edits[e.id]
  const save = () => {
    saveEdit(e.id, { t: t.trim(), x: x.trim(), xt: xt.trim(), n: n.trim() })
    onClose()
  }
  return (
    <Sheet title={`Edit “${e.w}”`} onClose={onClose}>
      <label className="field">Thai meaning<textarea rows={2} value={t} onChange={(ev) => setT(ev.target.value)} lang="th" /></label>
      <label className="field">Example sentence<textarea rows={2} value={x} onChange={(ev) => setX(ev.target.value)} /></label>
      <label className="field">Example in Thai<textarea rows={2} value={xt} onChange={(ev) => setXt(ev.target.value)} lang="th" /></label>
      <label className="field">Note<textarea rows={2} value={n} onChange={(ev) => setN(ev.target.value)} /></label>
      <div className="row gap">
        <button className="btn primary" onClick={save}>Save</button>
        {hasEdit && <button className="btn ghost" onClick={() => { saveEdit(e.id, null); onClose() }}>Restore original</button>}
      </div>
    </Sheet>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
