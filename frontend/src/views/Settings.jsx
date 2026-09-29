import { useEffect, useState } from 'react'
import { getSettings, issuePresenceToken, saveSettings } from '../api.js'

const EVENT_URL = `${window.location.origin}/api/presence/event`

/** Accepte la virgule comme le point : le clavier francais propose la virgule. */
function parseDecimal(text) {
  const value = Number(String(text).trim().replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

function Section({ title, intro, children }) {
  return (
    <section className="panel setting">
      <div className="setting__head">
        <h3 className="setting__title">{title}</h3>
        {intro && <p className="setting__intro">{intro}</p>}
      </div>
      <div className="setting__body">{children}</div>
    </section>
  )
}

function Energy() {
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getSettings(controller.signal)
      .then((s) => {
        setSaved(s.price_per_kwh)
        setDraft(String(s.price_per_kwh))
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [])

  const value = parseDecimal(draft)
  const dirty = saved !== null && value !== saved

  async function handleSubmit(event) {
    event.preventDefault()
    if (value === null) {
      setError('Saisissez un nombre, par exemple 0.2016.')
      return
    }
    setBusy(true)
    try {
      const next = await saveSettings({ price_per_kwh: value })
      setSaved(next.price_per_kwh)
      setDraft(String(next.price_per_kwh))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Énergie"
      intro="Sert à estimer le coût de la consommation. Relevez le prix TTC sur votre facture : le tarif réglementé change deux fois par an."
    >
      <form onSubmit={handleSubmit} className="setting__form">
        <label htmlFor="price" className="setting__label">
          Tarif du kWh
        </label>
        <div className="input-unit">
          <input
            id="price"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saved === null}
            aria-describedby="price-note"
          />
          <span className="input-unit__unit">€/kWh</span>
        </div>
        <button type="submit" className="program__save setting__save" disabled={busy || !dirty}>
          {busy ? 'Enregistrement' : dirty ? 'Enregistrer' : 'Enregistré'}
        </button>
      </form>
      <p className="program__hint" id="price-note">
        {error ?? 'Appliqué immédiatement au coût affiché sur le tableau de bord.'}
      </p>
    </Section>
  )
}

function Shortcut({ presence, onChange }) {
  const [token, setToken] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const exists = Boolean(presence?.token_set)

  async function create() {
    setBusy(true)
    try {
      const res = await issuePresenceToken()
      setToken(res.token)
      setConfirming(false)
      setError(null)
      onChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Raccourci iOS"
      intro="Le jeton autorise votre iPhone à déclarer votre arrivée et votre départ. Il ne permet rien d’autre : ni commander la lampe, ni lire les mesures."
    >
      <p className="presence__state" data-home={exists ? 'true' : 'false'}>
        <span className="presence__dot" aria-hidden="true" />
        {!presence
          ? 'Lecture de l’état'
          : exists
            ? 'Un jeton est actif'
            : 'Aucun jeton'}
      </p>

      {!confirming ? (
        <button
          type="button"
          className="program__save setting__save"
          onClick={() => (exists ? setConfirming(true) : create())}
          disabled={busy || !presence}
        >
          {exists ? 'Remplacer le jeton' : 'Créer le jeton'}
        </button>
      ) : (
        <div className="confirm">
          <p className="confirm__text">
            Le jeton actuel cessera de fonctionner. Vos automatisations Arrivée
            et Départ échoueront tant que vous n’y aurez pas collé le nouveau.
          </p>
          <div className="confirm__actions">
            <button type="button" className="program__save confirm__danger" onClick={create} disabled={busy}>
              {busy ? 'Remplacement' : 'Remplacer quand même'}
            </button>
            <button type="button" className="program__save" onClick={() => setConfirming(false)} disabled={busy}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {token && (
        <div className="token">
          <p className="setting__label">Votre nouveau jeton</p>
          <code className="token__value">{token}</code>
          <p className="program__hint">
            Copiez-le maintenant : il ne sera plus jamais affiché. Le serveur
            n’en conserve qu’une empreinte.
          </p>
        </div>
      )}

      <dl className="recipe">
        <div>
          <dt>URL</dt>
          <dd><code>{EVENT_URL}</code></dd>
        </div>
        <div>
          <dt>Méthode</dt>
          <dd><code>POST</code></dd>
        </div>
        <div>
          <dt>En-tête</dt>
          <dd><code>Authorization</code> : <code>Bearer {token ?? 'votre-jeton'}</code></dd>
        </div>
        <div>
          <dt>Corps JSON</dt>
          <dd>
            <code>state</code> : <code>home</code> ou <code>away</code>
            <br />
            <code>at</code> : la date formatée en ISO 8601, avec l’heure
          </dd>
        </div>
      </dl>

      {error && <p className="program__hint">{error}</p>}
    </Section>
  )
}

export default function Settings({ presence, onChange }) {
  return (
    <main className="settings">
      <h2 className="settings__title">Paramètres</h2>
      <Energy />
      <Shortcut presence={presence} onChange={onChange} />
    </main>
  )
}
