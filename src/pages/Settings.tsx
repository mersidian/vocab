import { useRef, useState } from 'react'
import { firebaseEnabled, signOutUser } from '../store'
import { useApp } from '../state'
import { emptyProgress, type Entry, type Progress } from '../types'

/** Minimal CSV parser (quotes, commas, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean))
}

const COLS = ['word', 'thai', 'pos', 'example', 'example_thai', 'note'] as const

function rowsToEntries(rows: string[][]): Omit<Entry, 'id' | 'custom'>[] {
  if (!rows.length) return []
  let map: Record<string, number> = Object.fromEntries(COLS.map((c, i) => [c, i]))
  const head = rows[0].map((h) => h.toLowerCase().replace(/[\s-]+/g, '_'))
  if (head.includes('word')) {
    map = Object.fromEntries(COLS.map((c) => [c, head.indexOf(c)]))
    rows = rows.slice(1)
  }
  const get = (r: string[], c: (typeof COLS)[number]) => (map[c] >= 0 ? r[map[c]] || undefined : undefined)
  return rows.filter((r) => get(r, 'word')).map((r) => ({
    w: get(r, 'word')!, t: get(r, 'thai'), p: get(r, 'pos'), x: get(r, 'example'), xt: get(r, 'example_thai'), n: get(r, 'note'),
  }))
}

export function Settings({ email }: { email?: string | null }) {
  const app = useApp()
  const { progress, saveSettings, addCustom, exportBackup, importBackup, storeKind } = app
  const s = progress.settings
  const [msg, setMsg] = useState<string | null>(null)
  const [word, setWord] = useState({ w: '', t: '', p: '', x: '', xt: '' })
  const csvRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)

  const setNew = (n: number) => saveSettings({ ...s, newPerDay: Math.max(0, Math.min(200, Math.round(n) || 0)) })

  const addOne = () => {
    if (!word.w.trim()) return
    const n = addCustom([{ w: word.w, t: word.t, p: word.p, x: word.x, xt: word.xt }])
    setMsg(n ? `Added “${word.w.trim()}” to My Words.` : `“${word.w.trim()}” is already in My Words.`)
    if (n) setWord({ w: '', t: '', p: '', x: '', xt: '' })
  }

  const importCsv = async (f: File) => {
    const entries = rowsToEntries(parseCsv(await f.text()))
    const n = addCustom(entries)
    setMsg(`Imported ${n} new word${n === 1 ? '' : 's'} into My Words${entries.length > n ? ` (${entries.length - n} skipped as duplicates)` : ''}.`)
  }

  const download = () => {
    const data = JSON.stringify({ app: 'vocab', version: 1, exported: new Date().toISOString(), progress: exportBackup() })
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `vocab-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const restore = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text())
      if (parsed?.app !== 'vocab' || !parsed.progress?.cards) throw new Error('This is not a Vocab backup file.')
      const p: Progress = { ...emptyProgress(), ...parsed.progress }
      if (!confirm(`Replace all current progress with the backup from ${parsed.exported?.slice(0, 10) ?? 'unknown date'}?`)) return
      await importBackup(p)
      setMsg('Backup restored.')
    } catch (e) {
      setMsg(`Could not restore: ${(e as Error).message}`)
    }
  }

  return (
    <div className="page settings">
      {msg && <p className="toast" role="status" onClick={() => setMsg(null)}>{msg}</p>}

      <section className="panel">
        <h2>Study</h2>
        <div className="setting">
          <div><b>New words per day</b><p className="hint">10 is a good pace: about 10–15 minutes a day.</p></div>
          <div className="stepper">
            <button className="btn outline small" onClick={() => setNew(s.newPerDay - 5)} aria-label="Fewer">−</button>
            <input type="number" inputMode="numeric" value={s.newPerDay} onChange={(e) => setNew(Number(e.target.value))} aria-label="New words per day" />
            <button className="btn outline small" onClick={() => setNew(s.newPerDay + 5)} aria-label="More">+</button>
          </div>
        </div>
        <label className="setting">
          <div><b>Thai → English cards</b><p className="hint">After you know a word for a few days, also ask it the other way round.</p></div>
          <input type="checkbox" className="switch" checked={s.reverse} onChange={(e) => saveSettings({ ...s, reverse: e.target.checked })} />
        </label>
      </section>

      <section className="panel">
        <h2>Add your own word</h2>
        <label className="field">Word or phrase<input value={word.w} onChange={(e) => setWord({ ...word, w: e.target.value })} autoCapitalize="none" /></label>
        <label className="field">Thai meaning<input value={word.t} onChange={(e) => setWord({ ...word, t: e.target.value })} lang="th" /></label>
        <div className="row gap">
          <label className="field grow">Part of speech<input value={word.p} placeholder="noun, verb…" onChange={(e) => setWord({ ...word, p: e.target.value })} /></label>
        </div>
        <label className="field">Example sentence<input value={word.x} onChange={(e) => setWord({ ...word, x: e.target.value })} /></label>
        <label className="field">Example in Thai<input value={word.xt} onChange={(e) => setWord({ ...word, xt: e.target.value })} lang="th" /></label>
        <div className="row gap wrap">
          <button className="btn primary" onClick={addOne} disabled={!word.w.trim()}>Add to My Words</button>
          <button className="btn outline" onClick={() => csvRef.current?.click()}>Import CSV…</button>
        </div>
        <p className="hint">CSV columns: word, thai, pos, example, example_thai, note (a header row is optional). Your own words are stored only in your account.</p>
        <input ref={csvRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = '' }} />
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <p className="hint">{storeKind === 'firebase' ? 'Progress syncs to your account automatically. A backup file is an extra copy.' : 'Local mode: progress lives only in this browser. Download a backup now and then.'}</p>
        <div className="row gap wrap">
          <button className="btn outline" onClick={download}>Download backup</button>
          <button className="btn outline" onClick={() => backupRef.current?.click()}>Restore backup…</button>
        </div>
        <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
      </section>

      <section className="panel">
        <h2>Account</h2>
        {firebaseEnabled ? (
          <div className="row between wrap gap">
            <span>Signed in as <b>{email}</b></span>
            <button className="btn outline small" onClick={() => signOutUser()}>Sign out</button>
          </div>
        ) : <p className="hint">Sync is not set up yet, so this copy runs in local mode.</p>}
      </section>

      <section className="panel credits">
        <h2>Word lists &amp; credits</h2>
        <ul>
          <li>The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from <a href="https://www.cefr-j.org/" target="_blank" rel="noopener noreferrer">cefr-j.org</a>.</li>
          <li>Octanove Vocabulary Profile C1/C2 by Octanove Labs, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.</li>
          <li>New General Service List, NGSL-Spoken, NGSL-GR, New Dolch List, NAWL, TSL, BSL, FEL and BEL by Browne, C., Culligan, B., and Phillips, J. (<a href="https://www.newgeneralservicelist.com/" target="_blank" rel="noopener noreferrer">newgeneralservicelist.com</a>), CC BY-SA 4.0.</li>
          <li>Medical Oral English List by Chartrand, R. &amp; Dilenschneider, R., CC BY-SA 4.0.</li>
          <li>Pronunciation, phrasal verbs and idioms from <a href="https://en.wiktionary.org/" target="_blank" rel="noopener noreferrer">Wiktionary</a> (via kaikki.org), CC BY-SA 4.0.</li>
          <li>Word frequencies from Words-CEFR-Dataset by Maximax67, MIT License.</li>
          <li>Thai meanings and example sentences were written by Claude (AI) and may contain mistakes. Use Edit to correct them.</li>
          <li>Exam prep decks are built from the level lists above. They are not official lists from IELTS, TOEFL, Cambridge, CU-TEP, TU-GET or TGAT.</li>
        </ul>
        <p className="hint">The word data file is shared under CC BY-SA 4.0.</p>
      </section>
    </div>
  )
}
