import { useEffect, useState } from 'react'
import { getPresence, issuePresenceToken } from '../api.js'

export default function Presence({ state, onChange }) {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getPresence(controller.signal)
      .then(() => setReady(true))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [])

  async function handleToken() {
    setBusy(true)
    try {
      const res = await issuePresenceToken()
      setToken(res.token)
      setError(null)
      onChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <section className="panel program">
        <h2 className="program__title">Présence</h2>
        <p className="program__hint">{error ?? 'Lecture des réglages'}</p>
      </section>
    )
  }

  return (
    <section className="panel program">
      <h2 className="program__title">Présence</h2>

      <p className="presence__state" data-home={state?.home ? 'true' : 'false'}>
        <span className="presence__dot" aria-hidden="true" />
        {state?.home ? 'Vous êtes là' : 'Absent'}
        {state?.overriding && ' — lampe en veille'}
      </p>

      <div className="token">
        <button
          type="button"
          className="program__save token__button"
          onClick={handleToken}
          disabled={busy}
        >
          {state?.token_set ? 'Remplacer le jeton du raccourci' : 'Créer le jeton du raccourci'}
        </button>

        {token && (
          <>
            <code className="token__value">{token}</code>
            <p className="program__hint">
              Copiez-le maintenant dans votre raccourci&nbsp;: il ne sera plus
              jamais affiché. Le serveur n’en garde qu’une empreinte.
            </p>
          </>
        )}
      </div>

      {error && <p className="program__hint">{error}</p>}
    </section>
  )
}
