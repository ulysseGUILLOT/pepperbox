import { useEffect, useState } from 'react'
import { getPresence, getSchedule, savePresence, saveSchedule } from '../api.js'
import { toHHMM, toMinutes } from '../timeutil.js'
import Timeline from './Timeline.jsx'

export default function Program({ onApplied }) {
  const [schedule, setSchedule] = useState(null)
  const [presence, setPresence] = useState(null)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getSchedule(controller.signal),
      getPresence(controller.signal),
    ])
      .then(([s, p]) => {
        const sched = {
          enabled: s.enabled,
          start: toMinutes(s.on_time),
          end: toMinutes(s.off_time),
        }
        const pres = {
          enabled: p.enabled,
          start: toMinutes(p.quiet_start),
          end: toMinutes(p.quiet_end),
        }
        setSchedule(sched)
        setPresence(pres)
        setSaved(JSON.stringify({ sched, pres }))
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [])

  if (!schedule || !presence) {
    return (
      <section className="panel program program--wide">
        <h2 className="program__title">Programme</h2>
        <p className="program__hint">{error ?? 'Lecture du programme'}</p>
      </section>
    )
  }

  const dirty = saved !== JSON.stringify({ sched: schedule, pres: presence })

  function move(bandId, edge, value) {
    const set = bandId === 'light' ? setSchedule : setPresence
    set((prev) => ({ ...prev, [edge]: value }))
  }

  async function persist() {
    setSaving(true)
    try {
      await Promise.all([
        saveSchedule({
          enabled: schedule.enabled,
          on_time: toHHMM(schedule.start),
          off_time: toHHMM(schedule.end),
        }),
        savePresence({
          enabled: presence.enabled,
          quiet_start: toHHMM(presence.start),
          quiet_end: toHHMM(presence.end),
        }),
      ])
      setSaved(JSON.stringify({ sched: schedule, pres: presence }))
      setError(null)
      onApplied?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const bands = [
    {
      id: 'light',
      kind: 'light',
      label: 'Éclairage',
      start: schedule.start,
      end: schedule.end,
      enabled: schedule.enabled,
    },
    {
      id: 'quiet',
      kind: 'quiet',
      label: 'Silence si présent',
      start: presence.start,
      end: presence.end,
      enabled: presence.enabled,
    },
  ]

  return (
    <section className="panel program program--wide">
      <h2 className="program__title">Programme</h2>

      <Timeline bands={bands} onChange={move} />

      <div className="program__controls">
        <div className="field field--check">
          <input
            id="sched_enabled"
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) =>
              setSchedule({ ...schedule, enabled: e.target.checked })
            }
          />
          <label htmlFor="sched_enabled">Allumage automatique</label>
        </div>

        <div className="field field--check">
          <input
            id="pres_enabled"
            type="checkbox"
            checked={presence.enabled}
            onChange={(e) =>
              setPresence({ ...presence, enabled: e.target.checked })
            }
          />
          <label htmlFor="pres_enabled">Priorité à la présence</label>
        </div>

        <button
          type="button"
          className="program__save program__save--inline"
          onClick={persist}
          disabled={saving || !dirty}
        >
          {saving ? 'Enregistrement' : dirty ? 'Enregistrer' : 'Enregistré'}
        </button>
      </div>

      <p className="program__hint">
        {error ??
          'Faites glisser les bornes, au doigt ou à la souris. Les flèches du clavier fonctionnent aussi. Crantage à la demi-heure.'}
      </p>
    </section>
  )
}
