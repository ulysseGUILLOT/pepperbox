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
    <div className="device__row">
      <span className="reading__label">{label}</span>
      <span className="device__value">{children}</span>
    </div>
  )
}

function Device({ name, active, state, children }) {
  return (
    <section className="device" aria-label={name}>
      <h3 className="device__name">{name}</h3>
      <p className="presence__state" data-active={active ? 'true' : 'false'}>
        <span className="presence__dot" aria-hidden="true" />
        {state}
      </p>
      {children}
    </section>
  )
}

// L'etat de la prise vient du sondage de la lampe, fait par App.
function Plug({ status, error, loading }) {
  return (
    <Device
      name="Prise Shelly"
      active={!loading && !error}
      state={loading ? 'Lecture de l’état' : error ? 'Injoignable' : 'Connectée'}
    >
      <div className="device__details">
        <Row label="Adresse">{status?.host ?? '—'}</Row>
      </div>
      {error && (
        <p className="program__hint">
          Vérifie qu’elle est alimentée et connectée au Wi-Fi.
        </p>
      )}
    </Device>
  )
}

function Board({ state, error }) {
  const seen = state?.seen_seconds_ago != null
  const label = error
    ? 'État inconnu'
    : !state
      ? 'Lecture de l’état'
      : state.online
        ? 'En ligne'
        : seen
          ? 'Hors ligne'
          : 'Pas encore vue depuis le démarrage du serveur'

  return (
    <Device
      name="Carte ESP32"
      active={state?.online}
      state={seen ? `${label}, vue ${ago(state.seen_seconds_ago)}` : label}
    >
      {seen && state.online && (
        <div className="device__details">
          <Row label="Signal Wi-Fi">
            {state.rssi_dbm}
            <span className="reading__unit">dBm</span>
            <span className="device__hint">{signal(state.rssi_dbm)}</span>
          </Row>
          <Row label="Adresse">{state.ip}</Row>
          <Row label="En marche depuis">{uptime(state.uptime_s)}</Row>
          <Row label="Firmware">{state.firmware ?? '—'}</Row>
        </div>
      )}
      {state && !state.online && (
        <p className="program__hint">
          La carte se signale une fois par minute. Vérifie qu’elle est
          alimentée et à portée du Wi-Fi 2,4 GHz.
        </p>
      )}
    </Device>
  )
}

// L'etat de la carte est interroge par le tableau de bord, qui le partage
// avec le panneau du climat.
export default function Devices({ status, error, loading, box, boxError }) {
  return (
    <section className="panel program program--wide" aria-labelledby="devices-title">
      <h2 id="devices-title" className="program__title">
        Périphériques
      </h2>
      <div className="devices">
        <Plug status={status} error={error} loading={loading} />
        <Board state={box} error={boxError} />
      </div>
    </section>
  )
}
