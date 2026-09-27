const LABELS = {
  loading: 'connexion…',
  online: 'prise connectée',
  offline: 'prise injoignable',
}

export default function StatusDot({ state }) {
  return (
    <span className={`link link--${state}`}>
      <span className="link__dot" aria-hidden="true" />
      {LABELS[state]}
    </span>
  )
}
