import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { Browse } from './pages/Browse'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'
import { Stats } from './pages/Stats'
import { Study } from './pages/Study'
import { AppProvider, useApp } from './state'
import { firebaseEnabled, FirestoreStore, isOwner, LocalStore, signIn, signOutUser, watchUser, type Store } from './store'

const TABS = [
  { id: 'home', label: 'Decks', icon: 'M4 5h16v4H4zM4 11h16v4H4zM4 17h10v3H4z' },
  { id: 'browse', label: 'Words', icon: 'M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z' },
  { id: 'stats', label: 'Stats', icon: 'M5 20V11h3v9H5zm5.5 0V4h3v16h-3zM16 20v-6h3v6h-3z' },
  { id: 'settings', label: 'Settings', icon: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 4.6-.1-2.2 2-1.6-2-3.4-2.4.9a8 8 0 0 0-1.9-1.1L15.6 3h-4l-.4 2.6a8 8 0 0 0-1.9 1.1l-2.4-.9-2 3.4 2 1.6a8 8 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-.9c.6.5 1.2.8 1.9 1.1l.4 2.6h4l.4-2.6c.7-.3 1.3-.6 1.9-1.1l2.4.9 2-3.4-2-1.6z' },
]

function useHashTab(): [string, (t: string) => void] {
  const read = () => location.hash.replace('#', '') || 'home'
  const [tab, setTab] = useState(read)
  useEffect(() => {
    const on = () => setTab(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [tab, (t) => { location.hash = t === 'home' ? '' : t; setTab(t); window.scrollTo(0, 0) }]
}

function Shell({ email }: { email?: string | null }) {
  const [tab, go] = useHashTab()
  const { error, clearError, storeKind } = useApp()
  return (
    <div className={`app tab-${tab}`}>
      {tab !== 'study' && (
        <header className="topbar">
          <span className="brand">Vocab</span>
          {storeKind === 'local' && <span className="chip muted">local mode</span>}
        </header>
      )}
      {error && <div className="error-bar" role="alert" onClick={clearError}>{error} <u>Dismiss</u></div>}
      <main>
        {tab === 'home' && <Home go={go} />}
        {tab === 'study' && <Study go={go} />}
        {tab === 'browse' && <Browse />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <Settings email={email} />}
      </main>
      {tab !== 'study' && (
        <nav className="tabbar" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={t.icon} fill="currentColor" /></svg>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

function SignIn({ user }: { user: User | null }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true); setErr(null)
    try { await signIn() } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      setErr(code.includes('popup-blocked') ? 'The sign-in window was blocked. Allow pop-ups for this site and try again.'
        : code.includes('popup-closed') || code.includes('cancelled') ? null : (e as Error).message)
    } finally { setBusy(false) }
  }
  return (
    <div className="center-screen signin">
      <img src={import.meta.env.BASE_URL + 'icon.svg'} width={72} height={72} alt="" />
      <h1>Vocab</h1>
      {user && !isOwner(user) ? (
        <>
          <p>This app is private. <b>{user.email}</b> does not have access.</p>
          <button className="btn outline" onClick={() => signOutUser()}>Use another account</button>
        </>
      ) : (
        <>
          <p>Sign in to sync your progress between devices.</p>
          <button className="btn primary big" onClick={go} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>
        </>
      )}
      {err && <p className="error-text">{err}</p>}
    </div>
  )
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(firebaseEnabled ? undefined : null)
  useEffect(() => (firebaseEnabled ? watchUser(setUser) : undefined), [])
  const store = useMemo<Store | null>(() => {
    if (!firebaseEnabled) return new LocalStore()
    return user && isOwner(user) ? new FirestoreStore(user.uid) : null
  }, [user])

  if (user === undefined) return <div className="center-screen"><div className="spinner" aria-label="Loading" /></div>
  if (!store) return <SignIn user={user} />
  return (
    <AppProvider key={user?.uid ?? 'local'} store={store}>
      <Shell email={user?.email} />
    </AppProvider>
  )
}
