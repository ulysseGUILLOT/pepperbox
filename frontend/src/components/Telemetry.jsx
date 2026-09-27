const PLACEHOLDER = '—'

function format(value, digits) {
  return value.toFixed(digits)
}

function Reading({ label, value, unit }) {
  return (
    <div className="reading">
      <span className="reading__label">{label}</span>
      <span className="reading__value">
        {value}
        {value !== PLACEHOLDER && <span className="reading__unit">{unit}</span>}
      </span>
    </div>
  )
}

export default function Telemetry({ status }) {
  const show = (key, digits) =>
    status ? format(status[key], digits) : PLACEHOLDER

  // Sous un euro, deux decimales afficheraient 0,00 : on montre le detail.
  const cost = status
    ? format(status.cost_eur, status.cost_eur < 1 ? 4 : 2)
    : PLACEHOLDER

  return (
    <section className="telemetry" aria-label="Mesures de la prise">
      <Reading label="Tension" value={show('voltage_v', 1)} unit="V" />
      <Reading label="Courant" value={show('current_a', 3)} unit="A" />
      <Reading label="Température" value={show('temperature_c', 1)} unit="°C" />
      <Reading label="Énergie cumulée" value={show('energy_wh', 3)} unit="Wh" />
      <Reading label="Coût estimé" value={cost} unit="€" />
      {status && (
        <p className="telemetry__note">
          au tarif de {format(status.price_per_kwh, 4)} €/kWh
        </p>
      )}
    </section>
  )
}
