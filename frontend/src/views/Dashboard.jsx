import Fixture from '../components/Fixture.jsx'
import Presence from '../components/Presence.jsx'
import Program from '../components/Program.jsx'
import Telemetry from '../components/Telemetry.jsx'

function formatDuration(seconds) {
  const s = Math.floor(seconds)
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return m ? `${h} h ${m}` : `${h} h`
}

export default function Dashboard({
  status,
  error,
  loading,
  pending,
  onToggle,
  onRefresh,
  onOpenSettings,
}) {
  const on = status?.on ?? false

  return (
    <>
      <main className="console">
        <section className="lamp" aria-labelledby="lamp-title">
          <h2 id="lamp-title" className="lamp__title">
            Lampe de croissance
          </h2>

          <Fixture on={on} />

          <div className="lamp__readout">
            <p className="lamp__power">
              {status ? status.power_w.toFixed(1) : '—'}
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
            onClick={onToggle}
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
          <Presence state={status?.presence} onOpenSettings={onOpenSettings} />
        </aside>
      </main>

      <Program onApplied={onRefresh} />
    </>
  )
}
