import type { DataIndex, Entry } from './types'

const BASE = import.meta.env.BASE_URL + 'data/'

let indexPromise: Promise<DataIndex> | null = null
const shardPromises = new Map<number, Promise<Entry[]>>()
const loaded: (Entry | undefined)[] = []

export function loadIndex(): Promise<DataIndex> {
  if (!indexPromise) {
    indexPromise = fetch(BASE + 'index.json', { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error('Could not load word index')
      return r.json()
    })
  }
  return indexPromise
}

async function loadShard(n: number, index: DataIndex): Promise<Entry[]> {
  let p = shardPromises.get(n)
  if (!p) {
    // version busts the HTTP cache when new Thai content is published
    p = fetch(`${BASE}s${n}.json?v=${index.version}`).then((r) => {
      if (!r.ok) throw new Error(`Could not load word data (${n})`)
      return r.json() as Promise<Entry[]>
    })
    p.then((rows) => rows.forEach((e, i) => (loaded[n * index.shardSize + i] = e)))
    p.catch(() => shardPromises.delete(n))
    shardPromises.set(n, p)
  }
  return p
}

/** Load the shards that hold these global positions. */
export async function ensure(positions: number[]): Promise<void> {
  const index = await loadIndex()
  const need = new Set(positions.map((i) => Math.floor(i / index.shardSize)))
  await Promise.all([...need].map((n) => loadShard(n, index)))
}

export async function loadAll(): Promise<void> {
  const index = await loadIndex()
  await Promise.all(Array.from({ length: index.shards }, (_, n) => loadShard(n, index)))
}

export function entryAt(pos: number): Entry | undefined {
  return loaded[pos]
}

let idMap: Map<string, number> | null = null
let idMapSize = 0
/** Position of an entry id (only for shards already loaded). */
export function positionOf(id: string): number | undefined {
  const count = loaded.reduce((n, e) => (e ? n + 1 : n), 0)
  if (!idMap || idMapSize !== count) {
    idMap = new Map()
    loaded.forEach((e, i) => e && idMap!.set(e.id, i))
    idMapSize = count
  }
  return idMap.get(id)
}

export function allLoaded(): Entry[] {
  return loaded.filter((e): e is Entry => !!e)
}

export function translateUrl(text: string, from = 'en', to = 'th'): string {
  return `https://translate.google.com/?sl=${from}&tl=${to}&text=${encodeURIComponent(text)}&op=translate`
}
