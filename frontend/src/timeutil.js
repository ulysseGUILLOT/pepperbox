export const DAY = 1440
export const STEP = 30          // crenelage : la demi-heure
export const SLOTS = DAY / STEP

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

export function toHHMM(minutes) {
  const value = ((minutes % DAY) + DAY) % DAY
  const h = String(Math.floor(value / 60)).padStart(2, '0')
  const m = String(value % 60).padStart(2, '0')
  return `${h}:${m}`
}

export function snap(minutes) {
  return (Math.round(minutes / STEP) * STEP) % DAY
}

/** Une periode peut franchir minuit : elle se dessine alors en deux morceaux. */
export function segments(start, end) {
  if (start === end) return []
  if (start < end) return [[start, end]]
  return [
    [start, DAY],
    [0, end],
  ]
}

export function duration(start, end) {
  return start < end ? end - start : DAY - start + end
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}
