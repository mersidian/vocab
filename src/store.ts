/**
 * Progress storage. Two backends with the same interface:
 *  - FirestoreStore: synced across devices, works offline (persistent cache)
 *  - LocalStore:     this browser only (used when Firebase is not configured)
 *
 * Firestore layout under users/{uid}/ (few, larger docs keep the free read quota low):
 *   cards/{0..31}   map cardKey -> CardState   (sharded by hash)
 *   meta/settings   Settings
 *   meta/known      map entryId -> time
 *   meta/edits      map entryId -> EntryEdit
 *   days/{YYYY-MM}  map YYYY-MM-DD -> DayLog
 *   custom/{id}     Entry
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User,
} from 'firebase/auth'
import {
  collection, deleteDoc, deleteField, doc, getDocs, initializeFirestore, persistentLocalCache,
  persistentMultipleTabManager, setDoc, writeBatch, type Firestore,
} from 'firebase/firestore'
import { firebaseConfig, OWNER_EMAIL } from './firebase-config'
import {
  emptyProgress, type CardState, type DayLog, type Entry, type EntryEdit, type Progress, type Settings,
} from './types'

export interface Store {
  readonly kind: 'firebase' | 'local'
  load(): Promise<Progress>
  saveCard(key: string, state: CardState | null): Promise<void>
  saveCards(states: Record<string, CardState | null>): Promise<void>
  setKnown(id: string, time: number | null): Promise<void>
  saveSettings(s: Settings): Promise<void>
  saveEdit(id: string, edit: EntryEdit | null): Promise<void>
  saveCustom(entry: Entry): Promise<void>
  deleteCustom(id: string): Promise<void>
  saveDay(day: string, log: DayLog): Promise<void>
  replaceAll(p: Progress): Promise<void>
}

export const firebaseEnabled = !!firebaseConfig.apiKey

const SHARDS = 32
function shardOf(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return String(Math.abs(h) % SHARDS)
}

/* ------------------------------------------------------------------ local */
const LS_KEY = 'vocab-progress-v1'

export class LocalStore implements Store {
  readonly kind = 'local' as const
  private p: Progress = emptyProgress()

  async load() {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) this.p = { ...emptyProgress(), ...JSON.parse(raw) }
    } catch { /* storage blocked: start empty */ }
    return structuredClone(this.p)
  }
  private persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.p)) } catch { /* ignore */ }
  }
  async saveCard(key: string, s: CardState | null) { this.saveCards({ [key]: s }) }
  async saveCards(states: Record<string, CardState | null>) {
    for (const [k, s] of Object.entries(states)) {
      if (s) this.p.cards[k] = s
      else delete this.p.cards[k]
    }
    this.persist()
  }
  async setKnown(id: string, t: number | null) {
    if (t) this.p.known[id] = t
    else delete this.p.known[id]
    this.persist()
  }
  async saveSettings(s: Settings) { this.p.settings = s; this.persist() }
  async saveEdit(id: string, e: EntryEdit | null) {
    if (e) this.p.edits[id] = e
    else delete this.p.edits[id]
    this.persist()
  }
  async saveCustom(e: Entry) { this.p.custom[e.id] = e; this.persist() }
  async deleteCustom(id: string) { delete this.p.custom[id]; this.persist() }
  async saveDay(day: string, log: DayLog) { this.p.days[day] = log; this.persist() }
  async replaceAll(p: Progress) { this.p = structuredClone(p); this.persist() }
}

/* --------------------------------------------------------------- firebase */
let app: FirebaseApp | null = null
let db: Firestore | null = null

function fb() {
  if (!app) {
    app = initializeApp(firebaseConfig)
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  }
  return { app: app!, db: db! }
}

export function watchUser(cb: (u: User | null) => void): () => void {
  return onAuthStateChanged(getAuth(fb().app), cb)
}

export async function signIn(): Promise<void> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ login_hint: OWNER_EMAIL, prompt: 'select_account' })
  await signInWithPopup(getAuth(fb().app), provider)
}

export function signOutUser(): Promise<void> {
  return signOut(getAuth(fb().app))
}

export function isOwner(u: User | null): boolean {
  return !!u && u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
}

export class FirestoreStore implements Store {
  readonly kind = 'firebase' as const
  constructor(private uid: string) {}

  private ref(...path: string[]) {
    return doc(fb().db, 'users', this.uid, ...path)
  }

  async load(): Promise<Progress> {
    const { db } = fb()
    const base = ['users', this.uid] as const
    const [cards, meta, days, custom] = await Promise.all([
      getDocs(collection(db, ...base, 'cards')),
      getDocs(collection(db, ...base, 'meta')),
      getDocs(collection(db, ...base, 'days')),
      getDocs(collection(db, ...base, 'custom')),
    ])
    const p = emptyProgress()
    cards.forEach((d) => Object.assign(p.cards, d.data()))
    meta.forEach((d) => {
      if (d.id === 'settings') p.settings = { ...p.settings, ...(d.data() as Settings) }
      if (d.id === 'known') p.known = d.data() as Progress['known']
      if (d.id === 'edits') p.edits = d.data() as Progress['edits']
    })
    days.forEach((d) => Object.assign(p.days, d.data()))
    custom.forEach((d) => (p.custom[d.id] = d.data() as Entry))
    return p
  }

  async saveCard(key: string, s: CardState | null) {
    await this.saveCards({ [key]: s })
  }

  async saveCards(states: Record<string, CardState | null>) {
    const byShard: Record<string, Record<string, unknown>> = {}
    for (const [k, s] of Object.entries(states)) {
      ;(byShard[shardOf(k)] ??= {})[k] = s ?? deleteField()
    }
    // setDoc(merge) treats keys literally, so ids with odd characters are safe
    await Promise.all(Object.entries(byShard).map(([n, data]) =>
      setDoc(this.ref('cards', n), data, { merge: true })))
  }

  async setKnown(id: string, t: number | null) {
    await setDoc(this.ref('meta', 'known'), { [id]: t ?? deleteField() }, { merge: true })
  }

  async saveSettings(s: Settings) {
    await setDoc(this.ref('meta', 'settings'), s)
  }

  async saveEdit(id: string, e: EntryEdit | null) {
    await setDoc(this.ref('meta', 'edits'), { [id]: e ?? deleteField() }, { merge: true })
  }

  async saveCustom(e: Entry) {
    await setDoc(this.ref('custom', e.id), e)
  }

  async deleteCustom(id: string) {
    await deleteDoc(this.ref('custom', id))
  }

  async saveDay(day: string, log: DayLog) {
    await setDoc(this.ref('days', day.slice(0, 7)), { [day]: log }, { merge: true })
  }

  /** Restore from a backup file: overwrites everything. */
  async replaceAll(p: Progress) {
    const { db } = fb()
    const base = ['users', this.uid] as const
    const old = await Promise.all(['cards', 'days', 'custom'].map((c) => getDocs(collection(db, ...base, c))))
    let batch = writeBatch(db)
    let ops = 0
    const flush = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0 } }
    const put = async (fn: () => void) => { fn(); if (++ops >= 400) await flush() }
    for (const snap of old) for (const d of snap.docs) await put(() => batch.delete(d.ref))
    await flush()
    const shards: Record<string, Record<string, CardState>> = {}
    for (const [k, s] of Object.entries(p.cards)) (shards[shardOf(k)] ??= {})[k] = s
    for (const [n, data] of Object.entries(shards)) await put(() => batch.set(this.ref('cards', n), data))
    const months: Record<string, Record<string, DayLog>> = {}
    for (const [d, log] of Object.entries(p.days)) (months[d.slice(0, 7)] ??= {})[d] = log
    for (const [m, data] of Object.entries(months)) await put(() => batch.set(this.ref('days', m), data))
    for (const e of Object.values(p.custom)) await put(() => batch.set(this.ref('custom', e.id), e))
    await put(() => batch.set(this.ref('meta', 'settings'), p.settings))
    await put(() => batch.set(this.ref('meta', 'known'), p.known))
    await put(() => batch.set(this.ref('meta', 'edits'), p.edits))
    await flush()
  }
}
