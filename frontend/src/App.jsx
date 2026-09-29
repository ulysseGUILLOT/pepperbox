import { useCallback, useEffect, useRef, useState } from 'react'
import { getLamp, setLamp } from './api.js'
import Mark from './components/Mark.jsx'
import StatusDot from './components/StatusDot.jsx'
import { useRoute } from './router.js'
import Dashboard from './views/Dashboard.jsx'
import Settings from './views/Settings.jsx'

const POLL_MS = 2000

const PAGES = [
  { path: '/', label: 'Tableau de bord' },
  { path: '/parametres', label: 'Paramètres' },
]

export default function App() {
  const [path, navigate] = useRoute()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)

  const refresh = useCallback(async (signal) => {
    try {
      const next = await getLamp(signal)
      // Une commande en vol fait autorite sur le resultat du sondage.
      if (!pendingRef.current) setStatus(next)
      setError(null)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    const id = setInterval(() => refresh(controller.signal), POLL_MS)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [refresh])

  async function handleToggle() {
    if (pending) return
    const target = !status?.on
    setPending(true)
    pendingRef.current = true
    try {
      setStatus(await setLamp(target))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  const follow = (to) => (event) => {
    event.preventDefault()
    navigate(to)
  }

  const on = status?.on ?? false
  const loading = status === null && error === null
  const connection = loading ? 'loading' : error ? 'offline' : 'online'
  const onSettings = path.startsWith('/parametres')

  return (
    <div className={on ? 'app is-on' : 'app'}>
      <header className="masthead">
        <h1 className="wordmark">
          <a href="/" onClick={follow('/')} className="wordmark__link">
            <Mark />
            Pepperbox
          </a>
        </h1>

        <nav className="nav" aria-label="Pages">
          {PAGES.map((page) => {
            const active = page.path === '/' ? !onSettings : onSettings
            return (
              <a
                key={page.path}
                href={page.path}
                onClick={follow(page.path)}
                className={active ? 'nav__link is-active' : 'nav__link'}
                aria-current={active ? 'page' : undefined}
              >
                {page.label}
              </a>
            )
          })}
        </nav>

        <div className="masthead__meta">
          <StatusDot state={connection} />
          <span className="masthead__host">{status?.host ?? '—'}</span>
        </div>
      </header>

      {onSettings ? (
        <Settings presence={status?.presence} onChange={() => refresh()} />
      ) : (
        <Dashboard
          status={status}
          error={error}
          loading={loading}
          pending={pending}
          onToggle={handleToggle}
          onRefresh={() => refresh()}
          onOpenSettings={follow('/parametres')}
        />
      )}

      {error && (
        <p className="alert" role="alert">
          <strong>{error}</strong> Vérifie qu’elle est alimentée et connectée au
          Wi-Fi, puis réessaie.
        </p>
      )}
    </div>
  )
}
