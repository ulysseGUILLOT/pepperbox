async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(body?.message ?? 'La prise ne répond pas.')
  }
  return body
}

export const getLamp = (signal) => request('/api/lamp', { signal })

export const setLamp = (on) =>
  request('/api/lamp', { method: 'POST', body: JSON.stringify({ on }) })

export const getSchedule = (signal) => request('/api/schedule', { signal })

export const saveSchedule = (schedule) =>
  request('/api/schedule', { method: 'PUT', body: JSON.stringify(schedule) })

export const getPresence = (signal) => request('/api/presence', { signal })

export const savePresence = (presence) =>
  request('/api/presence', { method: 'PUT', body: JSON.stringify(presence) })

export const issuePresenceToken = () =>
  request('/api/presence/token', { method: 'POST' })

export const getSettings = (signal) => request('/api/settings', { signal })

export const saveSettings = (changes) =>
  request('/api/settings', { method: 'PUT', body: JSON.stringify(changes) })
