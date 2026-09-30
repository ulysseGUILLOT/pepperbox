const $ = (id) => document.getElementById(id)

async function call(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return res.json()
}

function text(node, value) {
  if (node.textContent !== value) node.textContent = value
}

function renderList(node, items, build, emptyLabel) {
  node.replaceChildren(
    ...(items.length
      ? items.map(build)
      : [Object.assign(document.createElement('li'), {
          className: 'list__empty',
          textContent: emptyLabel,
        })]),
  )
}

function render(state) {
  const { lamp } = state
  text($('clock'), state.time)

  $('box').dataset.on = lamp.on ? 'true' : 'false'
  text($('box-title'), `Box de culture : lampe ${lamp.on ? 'allumée' : 'éteinte'}`)
  text($('lamp-state'), lamp.on ? 'Lampe allumée' : 'Lampe éteinte')
  text($('lamp-figures'), `${lamp.power_w.toFixed(0)} W`)
  text($('source'), `${lamp.source_label} (${lamp.source})`)
  text($('energy'), `${(lamp.energy_wh / 1000).toFixed(3)} kWh`)

  $('chk-offline').checked = state.offline

  renderList($('jobs'), state.jobs, (job) => {
    const li = document.createElement('li')
    li.textContent = job.text + (job.enabled ? '' : ' (désactivé)')
    return li
  }, 'Aucun programme.')

  renderList($('log'), state.events, (event) => {
    const li = document.createElement('li')
    const time = document.createElement('time')
    time.textContent = event.at
    const kind = document.createElement('span')
    kind.className = 'kind'
    kind.textContent = event.kind
    const label = document.createElement('span')
    label.textContent = event.text
    li.append(time, kind, label)
    return li
  }, 'Rien pour l’instant.')

  if (state.phone) {
    const sent = state.phone.state === 'home' ? '« J’arrive »' : '« Je pars »'
    text($('phone-result'), state.phone.ok
      ? `${sent} reçu. Le serveur vous considère ${state.phone.detail.home ? 'présent' : 'absent'}`
        + (state.phone.detail.overriding ? ', lampe en veille.' : '.')
      : `${sent} refusé : ${state.phone.detail.error ?? state.phone.detail.message ?? 'erreur'}`)
  }
}

async function refresh() {
  try {
    render(await (await fetch('/sim/state')).json())
  } catch {
    text($('clock'), 'simulateur injoignable')
  }
}

function bind(id, action) {
  $(id).addEventListener('click', async (event) => {
    const button = event.currentTarget
    button.disabled = true
    try { await action() } finally {
      button.disabled = false
      refresh()
    }
  })
}

bind('btn-button', () => call('/sim/button'))
bind('btn-home', () => call('/sim/presence', { state: 'home' }))
bind('btn-away', () => call('/sim/presence', { state: 'away' }))

$('chk-offline').addEventListener('change', async (event) => {
  await call('/sim/offline', { offline: event.target.checked })
  refresh()
})

refresh()
setInterval(refresh, 1000)
