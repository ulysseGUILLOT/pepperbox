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

  renderBoard(state.board, state.offline)

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

const LED_LABELS = {
  off: 'LED éteinte',
  cold: 'LED bleue : trop froid',
  good: 'LED verte : température bonne',
  hot: 'LED rouge : trop chaud',
}

const fmtTemp = (value) => `${value.toFixed(1)} °C`
const fmtHumidity = (value) => `${value.toFixed(0)} %HR`

// Un curseur que l'on fait glisser garde sa position : le sondage ne doit
// pas le ramener a la valeur d'il y a une seconde.
function setSlider(input, output, value, format) {
  if (input.dataset.dragging) return
  input.value = value
  text(output, format(value))
}

function renderBoard(board, plugOffline) {
  const { sensor, bounds } = board
  const box = $('box')
  box.dataset.offline = plugOffline ? 'true' : 'false'
  box.dataset.board = board.plugged ? 'true' : 'false'
  box.dataset.sensor = sensor.connected ? 'true' : 'false'
  box.dataset.led = board.led

  text($('led-state'), board.plugged ? LED_LABELS[board.led] : 'Carte débranchée')
  text($('climate-figures'), sensor.connected
    ? `${fmtTemp(sensor.temperature_c)}  ${fmtHumidity(sensor.humidity_pct)}`
    : 'capteur débranché')

  const span = bounds.max - bounds.min
  const slider = $('slider-temp')
  slider.style.setProperty('--cold', `${((bounds.cold - bounds.min) / span) * 100}%`)
  slider.style.setProperty('--hot', `${((bounds.hot - bounds.min) / span) * 100}%`)
  text($('mark-cold'), `${bounds.cold} °C`)
  text($('mark-hot'), `${bounds.hot} °C`)

  setSlider($('rng-temp'), $('out-temp'), sensor.temperature_c, fmtTemp)
  setSlider($('rng-humidity'), $('out-humidity'), sensor.humidity_pct, fmtHumidity)
  $('rng-temp').disabled = !sensor.connected
  $('rng-humidity').disabled = !sensor.connected

  $('chk-sensor').checked = !sensor.connected
  $('chk-board').checked = !board.plugged
  if (!board.plugged) {
    text($('board-result'), 'Carte débranchée : aucun battement envoyé.')
  } else if (board.last) {
    text($('board-result'), board.last.ok
      ? `Dernier battement à ${board.last.at} : reçu par le serveur.`
      : `Dernier battement à ${board.last.at} : refusé (${board.last.detail}).`)
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

$('chk-board').addEventListener('change', async (event) => {
  await call('/sim/board', { plugged: !event.target.checked })
  refresh()
})

$('chk-sensor').addEventListener('change', async (event) => {
  await call('/sim/sensor', { connected: !event.target.checked })
  refresh()
})

// La LED suit le curseur pendant le glissement, comme la vraie suivrait la
// temperature.
function bindSlider(id, outputId, field, format) {
  const input = $(id)
  input.addEventListener('pointerdown', () => { input.dataset.dragging = 'true' })
  input.addEventListener('change', () => { delete input.dataset.dragging })
  input.addEventListener('input', async () => {
    const value = Number(input.value)
    text($(outputId), format(value))
    const board = await call('/sim/sensor', { [field]: value })
    renderBoard(board, $('box').dataset.offline === 'true')
  })
}

bindSlider('rng-temp', 'out-temp', 'temperature_c', fmtTemp)
bindSlider('rng-humidity', 'out-humidity', 'humidity_pct', fmtHumidity)

refresh()
setInterval(refresh, 1000)
