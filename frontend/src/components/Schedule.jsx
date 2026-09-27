import { useEffect, useState } from 'react'
import { getSchedule, saveSchedule } from '../api.js'

export default function Schedule({ onApplied }) {
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getSchedule(controller.signal)
      .then((s) => {
        setForm(s)
        setSaved(s)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [])

  const dirty =
    form && saved && JSON.stringify(form) !== JSON.stringify(saved)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const next = await saveSchedule(form)
      setForm(next)
      setSaved(next)
      setError(null)
      onApplied?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!form) {
    return (
      <section className="panel program">
        <h2 className="program__title">Programme</h2>
        <p className="program__hint">
          {error ?? 'Lecture du programme'}
        </p>
      </section>
    )
  }

  const update = (field) => (event) =>
    setForm({
      ...form,
      [field]:
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value,
    })

  return (
    <section className="panel program">
      <h2 className="program__title">Programme</h2>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="on_time">Allumage</label>
          <input
            id="on_time"
            type="time"
            value={form.on_time}
            onChange={update('on_time')}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="off_time">Extinction</label>
          <input
            id="off_time"
            type="time"
            value={form.off_time}
            onChange={update('off_time')}
            required
          />
        </div>

        <div className="field field--check">
          <input
            id="enabled"
            type="checkbox"
            checked={form.enabled}
            onChange={update('enabled')}
          />
          <label htmlFor="enabled">Allumage automatique</label>
        </div>

        <button type="submit" className="program__save" disabled={saving || !dirty}>
          {saving ? 'Enregistrement' : dirty ? 'Enregistrer' : 'Enregistré'}
        </button>

        <p className="program__hint">
          {error ? (
            error
          ) : form.enabled ? (
            `La prise applique ce cycle elle-même, même serveur éteint.`
          ) : (
            'Aucun cycle actif. La lampe ne répond qu’au bouton.'
          )}
        </p>
      </form>
    </section>
  )
}
