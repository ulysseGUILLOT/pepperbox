const SEGMENTS = 14

export default function Fixture({ on }) {
  return (
    <div className={on ? 'fixture is-on' : 'fixture'} aria-hidden="true">
      <div className="fixture__bar">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span className="fixture__led" key={i} />
        ))}
      </div>
      <div className="fixture__cast" />
    </div>
  )
}
