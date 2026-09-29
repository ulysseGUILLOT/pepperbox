export default function Presence({ state, onOpenSettings }) {
  return (
    <section className="panel program">
      <h2 className="program__title">Présence</h2>

      <p className="presence__state" data-home={state?.home ? 'true' : 'false'}>
        <span className="presence__dot" aria-hidden="true" />
        {!state
          ? 'Lecture de l’état'
          : state.home
            ? 'Vous êtes là'
            : 'Absent'}
        {state?.overriding && ', lampe en veille'}
      </p>

      {state && !state.token_set && (
        <p className="program__hint">
          Aucun raccourci n’est relié.{' '}
          <a href="/parametres" onClick={onOpenSettings}>
            Créer le jeton dans les paramètres
          </a>
        </p>
      )}
    </section>
  )
}
