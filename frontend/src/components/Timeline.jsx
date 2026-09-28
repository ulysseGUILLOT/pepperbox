import { useCallback, useEffect, useRef, useState } from 'react'
import { DAY, STEP, formatDuration, duration, segments, snap, toHHMM } from '../timeutil.js'

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21]

/**
 * Frise de 24 h. Chaque bande porte deux poignees deplacables a la souris,
 * au doigt ou au clavier. Les evenements Pointer couvrent les trois entrees
 * avec un seul chemin de code.
 */
export default function Timeline({ bands, onChange, onCommit }) {
  const trackRefs = useRef({})
  const [drag, setDrag] = useState(null)
  const [now, setNow] = useState(() => currentMinutes())

  useEffect(() => {
    const id = setInterval(() => setNow(currentMinutes()), 60000)
    return () => clearInterval(id)
  }, [])

  const valueFromPointer = useCallback((bandId, clientX) => {
    const track = trackRefs.current[bandId]
    if (!track) return null
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return snap(ratio * DAY)
  }, [])

  function handlePointerDown(event, bandId, edge) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ bandId, edge, pointerId: event.pointerId })
  }

  function handlePointerMove(event) {
    if (!drag) return
    const value = valueFromPointer(drag.bandId, event.clientX)
    if (value === null) return
    const band = bands.find((b) => b.id === drag.bandId)
    const other = drag.edge === 'start' ? band.end : band.start
    // Debut et fin confondus n'ont pas de sens : le serveur le refuse aussi.
    if (value === other) return
    onChange(drag.bandId, drag.edge, value)
  }

  function handlePointerUp(event) {
    if (!drag) return
    event.currentTarget.releasePointerCapture?.(drag.pointerId)
    setDrag(null)
    onCommit?.()
  }

  function handleKeyDown(event, bandId, edge, value) {
    const delta =
      { ArrowLeft: -STEP, ArrowRight: STEP, ArrowDown: -STEP, ArrowUp: STEP }[
        event.key
      ]
    if (!delta) return
    event.preventDefault()
    onChange(bandId, edge, snap(value + delta))
    onCommit?.()
  }

  return (
    <div className="timeline">
      <div className="timeline__axis" aria-hidden="true">
        {TICKS.map((h) => (
          <span key={h} style={{ left: `${(h * 60 * 100) / DAY}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>

      {bands.map((band) => (
        <div className="timeline__row" key={band.id}>
          <div className="timeline__head">
            <span className="timeline__label">{band.label}</span>
            <span className="timeline__range">
              {toHHMM(band.start)} → {toHHMM(band.end)}
              <span className="timeline__length">
                {formatDuration(duration(band.start, band.end))}
              </span>
            </span>
          </div>

          <div
            className="timeline__track"
            data-kind={band.kind}
            data-idle={band.enabled ? 'false' : 'true'}
            ref={(el) => {
              trackRefs.current[band.id] = el
            }}
          >
            {segments(band.start, band.end).map(([from, to], i) => (
              <span
                className="timeline__segment"
                key={i}
                style={{
                  left: `${(from * 100) / DAY}%`,
                  width: `${((to - from) * 100) / DAY}%`,
                }}
              />
            ))}

            <span
              className="timeline__now"
              style={{ left: `${(now * 100) / DAY}%` }}
              aria-hidden="true"
            />

            {['start', 'end'].map((edge) => (
              <button
                type="button"
                key={edge}
                className="timeline__handle"
                style={{ left: `${(band[edge] * 100) / DAY}%` }}
                onPointerDown={(e) => handlePointerDown(e, band.id, edge)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={(e) => handleKeyDown(e, band.id, edge, band[edge])}
                role="slider"
                aria-label={`${band.label} — ${edge === 'start' ? 'début' : 'fin'}`}
                aria-valuemin={0}
                aria-valuemax={DAY - STEP}
                aria-valuenow={band[edge]}
                aria-valuetext={toHHMM(band[edge])}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function currentMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}
