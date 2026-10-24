import { useEffect, useState } from 'react'
import { getBox } from '../api.js'

// La carte bat une fois par minute : inutile de suivre la lampe a 2 s.
const POLL_MS = 5000

function ago(seconds) {
  if (seconds < 60) return `il y a ${seconds} s`
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`
  return `il y a ${Math.floor(seconds / 3600)} h`
}

function uptime(seconds) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  const h = Math.floor(seconds / 3600)
  if (h < 48) return `${h} h ${Math.floor((seconds % 3600) / 60)}`
  return `${Math.floor(h / 24)} j`
}

// Repere usuel du Wi-Fi : au-dela de -67 dBm, la liaison reste fiable.
function signal(dbm) {
  if (dbm >= -67) return 'bon'
  if (dbm >= -80) return 'faible'
  return 'très faible'
}

function Row({ label, children }) {
  return (
    <div className="box__row">
      <span className="reading__label">{label}</span>
      <span className="box__value">{children}</span>
    </div>
  )
}

// Etat interroge ici et non dans App : /api/lamp echoue quand la prise ne
// repond pas, la carte doit rester visible dans ce cas.
export default function Box() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () =>
      getBox(controller.signal)
        .then((next) => {
          setState(next)
          setError(null)
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setError(err.message)
        })
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [])

  const seen = state?.seen_seconds_ago != null

  return (
    <section className="panel program">
      <h2 className="program__title">Capteur de la box</h2>

      <p className="presence__state" data-active={state?.online ? 'true' : 'false'}>
        <span className="presence__dot" aria-hidden="true" />
        {error
          ? 'État inconnu'
          : !state
            ? 'Lecture de l’état'
            : state.online
              ? 'En ligne'
              : seen
                ? 'Hors ligne'
                : 'Pas encore vu depuis le démarrage du serveur'}
        {seen && `, vu ${ago(state.seen_seconds_ago)}`}
      </p>

      {seen && state.online && (
        <div className="box__details">
          <Row label="Signal Wi-Fi">
            {state.rssi_dbm}
            <span className="reading__unit">dBm</span>
            <span className="box__hint">{signal(state.rssi_dbm)}</span>
          </Row>
          <Row label="Adresse">{state.ip}</Row>
          <Row label="En marche depuis">{uptime(state.uptime_s)}</Row>
        </div>
      )}

      {state && !state.online && (
        <p className="program__hint">
          Le capteur se signale une fois par minute. Vérifie qu’il est
          alimenté et à portée du Wi-Fi 2,4 GHz.
        </p>
      )}
    </section>
  )
}
