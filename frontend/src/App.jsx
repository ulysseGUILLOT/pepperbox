import { useCallback, useEffect, useRef, useState } from 'react'
import { getLamp, setLamp } from './api.js'
import Fixture from './components/Fixture.jsx'
import Mark from './components/Mark.jsx'
import Presence from './components/Presence.jsx'
import Program from './components/Program.jsx'
import StatusDot from './components/StatusDot.jsx'
import Telemetry from './components/Telemetry.jsx'

const POLL_MS = 2000

function formatNumber(value, digits) {
  return value.toFixed(digits)
}

function formatDuration(seconds) {
  const s = Math.floor(seconds)
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return m ? `${h} h ${m}` : `${h} h`
}

export default function App() {
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

  const on = status?.on ?? false
  const loading = status === null && error === null
  const connection = loading ? 'loading' : error ? 'offline' : 'online'

  return (
    <div className={on ? 'app is-on' : 'app'}>
      <header className="masthead">
        <h1 className="wordmark">
          <Mark />
          Pepperbox
        </h1>
        <div className="masthead__meta">
          <StatusDot state={connection} />
          <span className="masthead__host">{status?.host ?? '—'}</span>
        </div>
      </header>

      <main className="console">
        <section className="lamp" aria-labelledby="lamp-title">
          <h2 id="lamp-title" className="lamp__title">
            Lampe de croissance
          </h2>

          <Fixture on={on} />

          <div className="lamp__readout">
            <p className="lamp__power">
              {status ? formatNumber(status.power_w, 1) : '—'}
              {status && <span className="lamp__unit">W</span>}
            </p>
            <p className="lamp__since">
              {!status
                ? loading
                  ? 'Lecture de la prise'
                  : 'Prise injoignable'
                : on
                  ? `Allumée depuis ${formatDuration(status.for_seconds)}`
                  : `Éteinte depuis ${formatDuration(status.for_seconds)}`}
            </p>
          </div>

          <button
            type="button"
            className="switch"
            onClick={handleToggle}
            aria-pressed={on}
            disabled={pending || !status}
          >
            {pending
              ? 'Commande en cours'
              : on
                ? 'Éteindre la lampe'
                : 'Allumer la lampe'}
          </button>

          <p className="visually-hidden" role="status">
            {on ? 'Lampe allumée' : 'Lampe éteinte'}
          </p>
        </section>

        <aside className="rail">
          <div className="panel">
            <Telemetry status={error ? null : status} />
          </div>
          <Presence state={status?.presence} onChange={() => refresh()} />
        </aside>
      </main>

      <Program onApplied={() => refresh()} />

      {error && (
        <p className="alert" role="alert">
          <strong>{error}</strong> Vérifie qu’elle est alimentée et connectée au
          Wi-Fi, puis réessaie.
        </p>
      )}
    </div>
  )
}
