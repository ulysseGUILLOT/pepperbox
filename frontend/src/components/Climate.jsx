import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  AriaComponent,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import langFR from 'echarts/i18n/langFR-obj.js'
import { getClimate } from '../api.js'

echarts.use([
  AriaComponent,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LineChart,
  MarkAreaComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
])
// Noms des mois et des jours tires d'Intl : le fichier de langue d'ECharts
// est un module UMD, dont l'empaquetage peut perdre le contenu ; l'axe du
// temps s'affichait alors en anglais. Le reste de sa traduction est garde.
const fr = (count, at, options) =>
  Array.from({ length: count }, (_, i) => at(i).toLocaleDateString('fr-FR', options))
const month = (i) => new Date(2024, i, 1)
const weekday = (i) => new Date(2024, 0, 7 + i) // le 7 janvier 2024 est un dimanche
echarts.registerLocale('FR', {
  ...langFR,
  time: {
    month: fr(12, month, { month: 'long' }),
    monthAbbr: fr(12, month, { month: 'short' }),
    dayOfWeek: fr(7, weekday, { weekday: 'long' }),
    dayOfWeekAbbr: fr(7, weekday, { weekday: 'short' }),
  },
})

const HOUR = 3600
const DAY = 24 * HOUR
// L'historique est conserve un an cote serveur (CLIMATE_RETENTION_DAYS),
// qui refuse toute fenetre plus longue que 366 jours.
const HISTORY = 365 * DAY

// Raccourcis de zoom : la fenetre se termine toujours maintenant.
const RANGES = [
  { span: DAY, label: '24 h' },
  { span: 7 * DAY, label: '7 j' },
  { span: 30 * DAY, label: '30 j' },
  { span: 365 * DAY, label: '1 an' },
]

// Apercu de tout l'historique, pour la barre de navigation et ce qui sort de
// la fenetre : un point par jour sur un an. La fenetre affichee est
// rechargee a raison d'un point pour deux pixels, comme un graphique de
// cours : plus fin, la courbe d'un an oscille jour et nuit en un mur de
// traits ; la mesure a la minute arrive des que la fenetre fait moins de
// quelques heures.
const OVERVIEW_POINTS = 400
const PIXELS_PER_POINT = 2
// La fenetre est chargee avec une marge de chaque cote : un leger
// deplacement ne declenche pas de nouvelle requete.
const DETAIL_MARGIN = 0.5
const OVERVIEW_POLL_MS = 5 * 60000
const DETAIL_POLL_MS = 60000
const ZOOM_DEBOUNCE_MS = 250
// En deca, on ne voit plus qu'une poignee de mesures a la minute.
const MIN_SPAN = HOUR
// Au-dela de cette largeur, temperature et humidite cote a cote ; en deca,
// l'une sous l'autre. Accorde avec la hauteur de .climate__chart.
const WIDE_PX = 640

// Couleurs des jetons de styles.css : le canevas ne lit pas les variables CSS.
const C = {
  text: '#e8eaec',
  muted: '#8b939c',
  line: '#31363d',
  raise: '#23272c',
  panel: '#1a1d21',
  neon: '#ff2340',
  band: 'rgba(232, 234, 236, 0.13)',
  target: 'rgba(232, 234, 236, 0.05)',
}
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"
const SANS = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

// Assemble l'apercu et la fenetre detaillee : le detail remplace l'apercu
// sur sa plage. Un trou de plus de deux tranches et demie (carte eteinte,
// capteur debranche) coupe la courbe au lieu de relier deux mesures
// eloignees.
function compose(overview, detail) {
  const points = []
  const take = (list, bucket) => list.forEach((p) => points.push({ ...p, bucket }))
  if (!detail) {
    take(overview.points, overview.bucket_s)
  } else {
    take(overview.points.filter((p) => p.t < detail.from), overview.bucket_s)
    take(detail.points, detail.bucket_s)
    take(overview.points.filter((p) => p.t >= detail.to), overview.bucket_s)
  }
  points.sort((a, b) => a.t - b.t)

  const out = []
  points.forEach((p, i) => {
    const prev = points[i - 1]
    if (prev && p.t - prev.t > 2.5 * Math.max(p.bucket, prev.bucket)) {
      out.push({ t: prev.t + prev.bucket, gap: true })
    }
    out.push(p)
  })
  return out
}

// Moyenne, et enveloppe minimum-maximum en deux series empilees : le bas,
// invisible, puis l'ecart, qui seul est colore.
function seriesFor(points, key, axis, extra = {}) {
  const at = (p) => p.t * 1000
  const value = (p, field) => (p.gap ? null : p[field])
  const spread = (p) =>
    p.gap || p[`${key}_max`] == null ? null : p[`${key}_max`] - p[`${key}_min`]
  const common = {
    type: 'line',
    xAxisIndex: axis,
    yAxisIndex: axis,
    symbol: 'none',
    connectNulls: false,
    silent: true,
  }
  return [
    {
      ...common,
      name: `${key}-bas`,
      stack: key,
      lineStyle: { opacity: 0 },
      data: points.map((p) => [at(p), value(p, `${key}_min`)]),
    },
    {
      ...common,
      name: `${key}-ecart`,
      stack: key,
      lineStyle: { opacity: 0 },
      areaStyle: { color: C.band },
      data: points.map((p) => [at(p), spread(p)]),
    },
    {
      ...common,
      ...extra,
      silent: false,
      name: key,
      lineStyle: { color: C.text, width: 1.5 },
      itemStyle: { color: C.neon },
      emphasis: { disabled: true },
      data: points.map((p) => [at(p), value(p, key === 'temperature' ? 'temperature_c' : 'humidity_pct')]),
    },
  ]
}

function when(ms, bucket) {
  const d = new Date(ms)
  const date = d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: bucket >= DAY ? 'numeric' : undefined,
  })
  // Un point qui moyenne une journee n'a pas d'heure.
  if (bucket >= DAY) return date
  return `${date} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

function resolution(bucket) {
  if (bucket < HOUR) return `${bucket / 60} min`
  if (bucket < DAY) return `${bucket / HOUR} h`
  return `${bucket / DAY} j`
}

function line(label, p, key, unit, digits) {
  const avg = p[key === 'temperature' ? 'temperature_c' : 'humidity_pct']
  if (avg == null) return ''
  const min = p[`${key}_min`]
  const max = p[`${key}_max`]
  const range =
    min != null && max != null && max - min > 10 ** -digits
      ? ` <span style="color:${C.muted}">${min.toFixed(digits)} à ${max.toFixed(digits)}</span>`
      : ''
  return `<div>${label} <b style="font-family:${MONO}">${avg.toFixed(digits)} ${unit}</b>${range}</div>`
}

// Emplacement des deux graphiques dans le canevas. Large : cote a cote, la
// temperature en grand a gauche. Etroit : l'un sous l'autre, chacun avec son
// titre. La barre de navigation court toujours sur toute la largeur, en bas.
function layout(wide, width) {
  const left = 40
  const right = 12
  const titles = (a, b) => [
    { text: 'Température (°C)', left: a.left - 32, top: a.top },
    { text: 'Humidité (%)', left: b.left - 32, top: b.top },
  ]
  if (wide) {
    // L'ecart accueille les graduations de l'humidite, a gauche de son axe.
    const gap = 72
    const inner = width - left - right - gap
    const temperature = { left, top: 34, bottom: 82, width: Math.round(inner * 0.62) }
    const humidity = { left: left + temperature.width + gap, top: 34, bottom: 82, right }
    return {
      grids: [temperature, humidity],
      titles: titles({ ...temperature, top: 4 }, { ...humidity, top: 4 }),
      timeLabels: [true, true],
    }
  }
  const temperature = { left, right, top: 34, height: '40%' }
  const humidity = { left, right, top: '66%', height: '18%' }
  return {
    grids: [temperature, humidity],
    titles: titles({ ...temperature, top: 4 }, { ...humidity, top: '59%' }),
    timeLabels: [false, true],
  }
}

function baseOption(wide, width) {
  const axisLabel = { color: C.muted, fontFamily: MONO, fontSize: 10, hideOverlap: true }
  const splitLine = { lineStyle: { color: C.line } }
  const place = layout(wide, width)
  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { fontFamily: SANS },
    aria: { enabled: true },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      lineStyle: { color: C.muted },
      label: { backgroundColor: C.raise, color: C.text, fontFamily: MONO, fontSize: 10 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: C.muted } },
      backgroundColor: C.raise,
      borderColor: C.line,
      textStyle: { color: C.text, fontSize: 12 },
      extraCssText: 'box-shadow: none; border-radius: 7px;',
    },
    title: place.titles.map((t) => ({
      ...t,
      textStyle: { color: C.muted, fontSize: 13, fontWeight: 500, fontFamily: SANS },
    })),
    grid: place.grids,
    xAxis: [0, 1].map((i) => ({
      type: 'time',
      gridIndex: i,
      axisLine: { lineStyle: { color: C.line } },
      axisTick: { show: false },
      axisLabel: {
        ...axisLabel,
        show: place.timeLabels[i],
        // Chaque niveau du calendrier a son format : l'annee en janvier,
        // le mois au premier, le jour a minuit, l'heure sinon.
        formatter: {
          year: '{yyyy}',
          month: '{MMM}',
          day: '{d} {MMM}',
          hour: '{HH}:{mm}',
          minute: '{HH}:{mm}',
          second: '{HH}:{mm}:{ss}',
          none: '{d} {MMM} {HH}:{mm}',
        },
      },
      splitLine: { show: false },
      // Empiles, une seule etiquette de date sous le reticule, en bas : celle
      // de l'axe du haut tomberait sur le graphique de l'humidite.
      axisPointer: {
        label: {
          show: place.timeLabels[i],
          formatter: ({ value }) =>
            new Date(value).toLocaleString('fr-FR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
        },
      },
    })),
    // Humidite : echelle recalculee sur la seule partie visible (filterMode
    // 'weakFilter' du zoom). Temperature : bornes posees par tempScale().
    // L'unite est dans le titre de chaque graphique.
    yAxis: ['temperature', 'humidity'].map((id, i) => ({
      id,
      type: 'value',
      scale: true,
      gridIndex: i,
      axisLabel,
      splitLine,
      splitNumber: i === 0 ? 4 : 2,
      // La precision du capteur : le dixieme de degre, le pour cent.
      axisPointer: { label: { formatter: ({ value }) => value.toFixed(i === 0 ? 1 : 0) } },
    })),
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        filterMode: 'weakFilter',
        minValueSpan: MIN_SPAN * 1000,
      },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        filterMode: 'weakFilter',
        minValueSpan: MIN_SPAN * 1000,
        bottom: 6,
        height: 26,
        borderColor: C.line,
        backgroundColor: 'transparent',
        fillerColor: 'rgba(255, 35, 64, 0.10)',
        handleStyle: { color: C.raise, borderColor: C.muted },
        moveHandleStyle: { color: C.line },
        dataBackground: {
          lineStyle: { color: C.muted, width: 1 },
          areaStyle: { color: 'rgba(139, 147, 156, 0.15)' },
        },
        selectedDataBackground: {
          lineStyle: { color: C.text, width: 1 },
          areaStyle: { color: 'rgba(232, 234, 236, 0.15)' },
        },
        textStyle: { color: C.muted, fontFamily: MONO, fontSize: 10 },
        labelFormatter: (ms) =>
          new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        brushSelect: false,
        left: 40,
        right: 12,
      },
    ],
  }
}

// Echelle de temperature : toujours toute la plage visee, un degre de marge
// de chaque cote ; elargie seulement si la partie visible en sort, enveloppe
// minimum-maximum comprise. Bornes et pas arrondis ensemble, pour que les
// graduations tombent juste : sinon ECharts ajoute les bornes brutes et les
// etiquettes se chevauchent.
function tempScale(points, start, end, cold, hot) {
  let lo = cold - 1
  let hi = hot + 1
  for (const p of points) {
    if (p.gap || p.t < start - p.bucket || p.t > end) continue
    for (const v of [p.temperature_c, p.temperature_min, p.temperature_max]) {
      if (v == null) continue
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }
  // Huit intervalles au plus : de 21 a 29 °C, une graduation par degre.
  const step = [0.5, 1, 2, 5, 10].find((s) => (Math.ceil(hi / s) - Math.floor(lo / s)) <= 8) ?? 20
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, interval: step }
}

function Chart({ overview, onWindow, range, request }) {
  const el = useRef(null)
  const chart = useRef(null)
  const points = useRef([])
  const view = useRef(null)
  const [detail, setDetail] = useState(null)
  // Largeur du canevas : decide de la disposition, cote a cote ou empilee.
  const [width, setWidth] = useState(0)
  const wide = width >= WIDE_PX

  // Pose l'echelle de temperature de la fenetre [start, end].
  const scaleTemperature = (start, end) => {
    chart.current.setOption({
      yAxis: [{ id: 'temperature', ...tempScale(points.current, start, end, overview.cold_c, overview.hot_c) }],
    })
  }

  const extent = () => {
    const first = overview.points[0]?.t ?? Date.now() / 1000 - DAY
    return [first, Date.now() / 1000]
  }

  // Fenetre affichee, en secondes, deduite des pourcentages du zoom. Avant
  // le premier dessin, qui attend la largeur du canevas : la fenetre par
  // defaut.
  const readWindow = () => {
    const [min, max] = extent()
    const zoom = chart.current.getOption()?.dataZoom?.[0]
    if (!zoom) return [max - range, max]
    return [min + ((max - min) * zoom.start) / 100, min + ((max - min) * zoom.end) / 100]
  }

  useEffect(() => {
    chart.current = echarts.init(el.current, null, { locale: 'FR' })
    const observer = new ResizeObserver(([entry]) => {
      chart.current.resize()
      setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(el.current)
    return () => {
      observer.disconnect()
      chart.current.dispose()
    }
  }, [])

  // Recharge la fenetre affichee a sa propre resolution, apres un zoom ou
  // un deplacement, puis chaque minute pour les nouvelles mesures.
  useEffect(() => {
    let timer = null
    let controller = null
    const load = () => {
      const [start, end] = view.current ?? readWindow()
      const margin = (end - start) * DETAIL_MARGIN
      controller?.abort()
      controller = new AbortController()
      const visible = Math.max(50, Math.round(el.current.clientWidth / PIXELS_PER_POINT))
      const points = Math.min(3000, Math.round(visible * (1 + 2 * DETAIL_MARGIN)))
      getClimate(start - margin, end + margin, points, controller.signal)
        .then(setDetail)
        .catch((err) => {
          if (err.name !== 'AbortError') setDetail(null)
        })
    }
    const onZoom = () => {
      view.current = readWindow()
      onWindow(view.current)
      scaleTemperature(...view.current)
      clearTimeout(timer)
      timer = setTimeout(load, ZOOM_DEBOUNCE_MS)
    }
    chart.current.on('datazoom', onZoom)
    // Premier chargement du detail, une fois l'option posee par l'effet
    // de dessin, qui s'execute apres celui-ci.
    timer = setTimeout(load, 0)
    const poll = setInterval(load, DETAIL_POLL_MS)
    return () => {
      chart.current.off('datazoom', onZoom)
      clearTimeout(timer)
      clearInterval(poll)
      controller?.abort()
    }
    // overview fixe l'etendue de l'axe que readWindow() lit.
  }, [overview])

  // Raccourci de zoom demande par un bouton : la fenetre se termine
  // maintenant. Le 'datazoom' qui suit recharge le detail.
  useEffect(() => {
    if (!request) return
    const end = Date.now() / 1000
    chart.current.dispatchAction({
      type: 'dataZoom',
      startValue: (end - request.span) * 1000,
      endValue: end * 1000,
    })
  }, [request])

  // Redessine : apercu et detail assembles, fenetre conservee, disposition
  // selon la largeur.
  useEffect(() => {
    if (!width) return
    const [min, max] = extent()
    const detailUsable = detail && detail.to > min
    points.current = compose(overview, detailUsable ? detail : null)
    const option = baseOption(wide, width)
    option.xAxis.forEach((x) => Object.assign(x, { min: min * 1000, max: max * 1000 }))
    option.tooltip.formatter = (params) => {
      const p = points.current[params[0]?.dataIndex]
      if (!p || p.gap) return ''
      return (
        `<div style="color:${C.muted};margin-bottom:4px">${when(p.t * 1000, p.bucket)}` +
        ` · ${resolution(p.bucket)}</div>` +
        line('Température', p, 'temperature', '°C', 1) +
        line('Humidité', p, 'humidity', '%', 0)
      )
    }
    option.series = [
      ...seriesFor(points.current, 'temperature', 0, {
        markArea: {
          silent: true,
          itemStyle: { color: C.target },
          label: { show: false },
          data: [[{ yAxis: overview.cold_c }, { yAxis: overview.hot_c }]],
        },
      }),
      ...seriesFor(points.current, 'humidity', 1),
    ]
    // Fenetre a reprendre : celle de l'utilisateur, ou les dernieres 24 h.
    // Collee a maintenant, elle avance avec les nouvelles mesures.
    const [start, end] = view.current ?? [max - range, max]
    const live = max - end < (end - start) * 0.02 + 120
    const span = end - start
    const [s, e] = live ? [max - span, max] : [start, end]
    option.dataZoom.forEach((z) =>
      Object.assign(z, { startValue: s * 1000, endValue: e * 1000 }),
    )
    Object.assign(option.yAxis[0], tempScale(points.current, s, e, overview.cold_c, overview.hot_c))
    chart.current.setOption(option, { notMerge: true })
  }, [overview, detail, width])

  return <div className="climate__chart" ref={el} />
}

function zone(celsius, data) {
  if (celsius < data.cold_c) return 'trop froid'
  if (celsius > data.hot_c) return 'trop chaud'
  return 'dans la plage'
}

export default function Climate({ box }) {
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState(null)
  // Fenetre affichee, pour allumer le bouton qui lui correspond.
  const [view, setView] = useState(null)
  const [pending, setPending] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = () => {
      const now = Date.now() / 1000
      getClimate(now - HISTORY, now, OVERVIEW_POINTS, controller.signal)
        .then((next) => {
          setOverview(next)
          setError(null)
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setError(err.message)
        })
    }
    load()
    const id = setInterval(load, OVERVIEW_POLL_MS)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [])

  // Mesure du dernier battement, si la carte est en ligne : une valeur
  // vieille d'une heure n'est plus la temperature de la box.
  const live = box?.online ? box : null
  const hasHistory = overview?.points.some(
    (p) => p.temperature_c != null || p.humidity_pct != null,
  )
  const now = Date.now() / 1000
  const active = view
    ? RANGES.find(
        (r) => now - view[1] < r.span * 0.02 + 120 && Math.abs(view[1] - view[0] - r.span) < r.span * 0.02,
      )?.span
    : DAY

  return (
    <section className="panel program program--wide climate" aria-labelledby="climate-title">
      <div className="climate__head">
        <h2 id="climate-title" className="program__title">
          Climat de la box
        </h2>
        <div className="range" role="group" aria-label="Période affichée">
          {RANGES.map((range) => (
            <button
              key={range.span}
              type="button"
              className={range.span === active ? 'range__button is-active' : 'range__button'}
              aria-pressed={range.span === active}
              // Un nouvel objet a chaque clic : le meme bouton rejoue le zoom.
              onClick={() => setPending({ span: range.span })}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="climate__now">
        <div className="reading">
          <span className="reading__label">Température</span>
          <span className="reading__value">
            {live?.temperature_c != null ? live.temperature_c.toFixed(1) : '—'}
            {live?.temperature_c != null && <span className="reading__unit">°C</span>}
            {live?.temperature_c != null && overview && (
              <span className="device__hint">{zone(live.temperature_c, overview)}</span>
            )}
          </span>
        </div>
        <div className="reading">
          <span className="reading__label">Humidité</span>
          <span className="reading__value">
            {live?.humidity_pct != null ? live.humidity_pct.toFixed(0) : '—'}
            {live?.humidity_pct != null && <span className="reading__unit">%</span>}
          </span>
        </div>
      </div>

      {error && !overview ? (
        <p className="program__hint">{error}</p>
      ) : !overview ? (
        <p className="program__hint">Lecture de l’historique</p>
      ) : !hasHistory ? (
        <p className="program__hint">
          Aucune mesure enregistrée : le capteur SHT n’est pas encore branché sur la
          carte, ou la carte est éteinte.
        </p>
      ) : (
        <Chart overview={overview} range={DAY} request={pending} onWindow={setView} />
      )}
    </section>
  )
}
