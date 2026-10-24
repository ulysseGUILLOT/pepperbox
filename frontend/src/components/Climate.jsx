import { useEffect, useRef, useState } from 'react'
import { getClimate } from '../api.js'
import usePolling from '../usePolling.js'

// Un point par minute au plus cote serveur : inutile de relire plus souvent.
const POLL_MS = 60000

const RANGES = [
  { hours: 24, label: '24 h' },
  { hours: 24 * 7, label: '7 j' },
]

const HEIGHT = 132
const PAD = { top: 10, right: 10, bottom: 22, left: 38 }

function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return width
}

// Pas de graduation lisible : quatre intervalles au plus.
function niceRange(lo, hi) {
  const step = [0.5, 1, 2, 5, 10, 20].find((s) => (hi - lo) / s <= 4) ?? 50
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step }
}

function timeTicks(from, to, hours) {
  const ticks = []
  const d = new Date(from * 1000)
  d.setMinutes(0, 0, 0)
  if (hours <= 48) {
    d.setHours(Math.ceil(d.getHours() / 6) * 6)
    for (; d.getTime() / 1000 <= to; d.setHours(d.getHours() + 6)) {
      ticks.push({ t: d.getTime() / 1000, label: `${String(d.getHours()).padStart(2, '0')}:00` })
    }
  } else {
    d.setHours(24)
    for (; d.getTime() / 1000 <= to; d.setDate(d.getDate() + 1)) {
      ticks.push({
        t: d.getTime() / 1000,
        label: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
      })
    }
  }
  return ticks.filter((tick) => tick.t >= from)
}

function when(t, hours) {
  const d = new Date(t * 1000)
  const hhmm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return hours <= 48 ? hhmm : `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })} ${hhmm}`
}

// Une seule serie par graphique : temperature et humidite n'ont pas la meme
// echelle, elles ne partagent pas d'axe.
function Chart({ title, points, field, unit, digits, band, hours, bucket }) {
  const ref = useRef(null)
  const width = useWidth(ref)
  const [hover, setHover] = useState(null)

  const values = points.filter((p) => p[field] != null)
  if (!values.length) {
    return (
      <figure className="chart" ref={ref}>
        <figcaption className="chart__title">
          {title}
          {band && ` · plage visée ${band[0]} à ${band[1]} ${unit}`}
        </figcaption>
        <p className="program__hint">Aucune mesure sur la période.</p>
      </figure>
    )
  }

  const to = Date.now() / 1000
  const from = to - hours * 3600
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom

  let lo = Math.min(...values.map((p) => p[field]))
  let hi = Math.max(...values.map((p) => p[field]))
  if (band) {
    lo = Math.min(lo, band[0] - 1)
    hi = Math.max(hi, band[1] + 1)
  }
  if (hi - lo < 2) {
    lo -= 1
    hi += 1
  }
  const scale = niceRange(lo, hi)
  const x = (t) => PAD.left + ((t - from) / (to - from)) * innerW
  const y = (v) => PAD.top + ((scale.hi - v) / (scale.hi - scale.lo)) * innerH

  // Un trou de plus de deux tranches (carte eteinte, capteur debranche)
  // coupe la courbe plutot que de relier deux mesures eloignees.
  let d = ''
  values.forEach((p, i) => {
    const jump = i === 0 || p.t - values[i - 1].t > bucket * 2.5
    d += `${jump ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p[field]).toFixed(1)} `
  })

  const yTicks = []
  for (let v = scale.lo; v <= scale.hi + 1e-9; v += scale.step) yTicks.push(v)

  function onMove(event) {
    const rect = ref.current.getBoundingClientRect()
    const t = from + ((event.clientX - rect.left - PAD.left) / innerW) * (to - from)
    let best = null
    for (const p of values) {
      if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
    }
    setHover(best)
  }

  const last = values[values.length - 1]
  const summary = `${title} : de ${Math.min(...values.map((p) => p[field])).toFixed(digits)} à ${Math.max(
    ...values.map((p) => p[field]),
  ).toFixed(digits)} ${unit}, dernière moyenne ${last[field].toFixed(digits)} ${unit}`

  return (
    // La reference reste sur la figure, vide ou non : l'observateur de
    // largeur ne doit pas perdre son element.
    <figure className="chart" ref={ref}>
      <figcaption className="chart__title">
        {title}
        {band && ` · plage visée ${band[0]} à ${band[1]} ${unit}`}
      </figcaption>
      <div
        className="chart__plot"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={summary}>
            {band && (
              <rect
                className="chart__band"
                x={PAD.left}
                width={innerW}
                y={y(band[1])}
                height={y(band[0]) - y(band[1])}
              />
            )}
            <g className="chart__grid">
              {yTicks.map((v) => (
                <g key={v}>
                  <line x1={PAD.left} x2={PAD.left + innerW} y1={y(v)} y2={y(v)} />
                  <text x={PAD.left - 6} y={y(v) + 4}>
                    {v}
                  </text>
                </g>
              ))}
            </g>
            <g className="chart__axis">
              {timeTicks(from, to, hours).map((tick) => (
                <text key={tick.t} x={x(tick.t)} y={HEIGHT - 6}>
                  {tick.label}
                </text>
              ))}
            </g>
            <path className="chart__line" d={d} />
            {hover && (
              <g className="chart__hover">
                <line x1={x(hover.t)} x2={x(hover.t)} y1={PAD.top} y2={PAD.top + innerH} />
                <circle cx={x(hover.t)} cy={y(hover[field])} r="4" />
              </g>
            )}
          </svg>
        )}
        {hover && (
          <div
            className="chart__tip"
            style={{ left: Math.min(Math.max(x(hover.t), 60), width - 60) }}
          >
            <span className="chart__tip-value">
              {hover[field].toFixed(digits)} {unit}
            </span>
            <span className="chart__tip-time">{when(hover.t, hours)}</span>
          </div>
        )}
      </div>
    </figure>
  )
}

function zone(celsius, data) {
  if (celsius < data.cold_c) return 'trop froid'
  if (celsius > data.hot_c) return 'trop chaud'
  return 'dans la plage'
}

export default function Climate({ box }) {
  const [hours, setHours] = useState(24)
  const [data, error] = usePolling((signal) => getClimate(hours, signal), POLL_MS, [hours])

  // Mesure du dernier battement, si la carte est en ligne : une valeur
  // vieille d'une heure n'est plus la temperature de la box.
  const live = box?.online ? box : null
  const hasHistory = data?.points.some((p) => p.temperature_c != null || p.humidity_pct != null)

  return (
    <section className="panel program program--wide climate" aria-labelledby="climate-title">
      <div className="climate__head">
        <h2 id="climate-title" className="program__title">
          Climat de la box
        </h2>
        <div className="range" role="group" aria-label="Période">
          {RANGES.map((range) => (
            <button
              key={range.hours}
              type="button"
              className={range.hours === hours ? 'range__button is-active' : 'range__button'}
              aria-pressed={range.hours === hours}
              onClick={() => setHours(range.hours)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="climate__now">
        <div className="reading">
          <span className="reading__label">Température</span>
          <span className="reading__value">
            {live?.temperature_c != null ? live.temperature_c.toFixed(1) : '—'}
            {live?.temperature_c != null && <span className="reading__unit">°C</span>}
            {live?.temperature_c != null && data && (
              <span className="device__hint">{zone(live.temperature_c, data)}</span>
            )}
          </span>
        </div>
        <div className="reading">
          <span className="reading__label">Humidité</span>
          <span className="reading__value">
            {live?.humidity_pct != null ? live.humidity_pct.toFixed(0) : '—'}
            {live?.humidity_pct != null && <span className="reading__unit">%</span>}
          </span>
        </div>
      </div>

      {error && !data ? (
        <p className="program__hint">{error}</p>
      ) : !data ? (
        <p className="program__hint">Lecture de l’historique</p>
      ) : !hasHistory ? (
        <p className="program__hint">
          Aucune mesure sur la période : le capteur SHT n’est pas encore branché sur la
          carte, ou la carte est éteinte.
        </p>
      ) : (
        <div className="climate__charts">
          <Chart
            title="Température (°C)"
            points={data.points}
            field="temperature_c"
            unit="°C"
            digits={1}
            band={[data.cold_c, data.hot_c]}
            hours={data.hours}
            bucket={data.bucket_s}
          />
          <Chart
            title="Humidité (%)"
            points={data.points}
            field="humidity_pct"
            unit="%"
            digits={0}
            hours={data.hours}
            bucket={data.bucket_s}
          />
        </div>
      )}
    </section>
  )
}
