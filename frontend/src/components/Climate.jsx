import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  AriaComponent,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
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

function baseOption() {
  const axisLabel = { color: C.muted, fontFamily: MONO, fontSize: 10, hideOverlap: true }
  const splitLine = { lineStyle: { color: C.line } }
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
    grid: [
      { left: 46, right: 14, top: 26, height: '44%' },
      { left: 46, right: 14, top: '60%', height: '22%' },
    ],
    xAxis: [0, 1].map((i) => ({
      type: 'time',
      gridIndex: i,
      axisLine: { lineStyle: { color: C.line } },
      axisTick: { show: false },
      axisLabel: {
        ...axisLabel,
        show: i === 1,
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
      // Une seule etiquette de date sous le reticule, en bas : celle de
      // l'axe du haut tomberait sur le graphique de l'humidite.
      axisPointer: {
        label: {
          show: i === 1,
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
    // Echelles recalculees sur la seule partie visible (filterMode
    // 'weakFilter' du zoom) : en zoomant, un dixieme de degre se voit.
    yAxis: ['°C', '%'].map((name, i) => ({
      name,
      type: 'value',
      scale: true,
      gridIndex: i,
      nameTextStyle: { color: C.muted, fontSize: 10, align: 'right' },
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
      },
    ],
  }
}

function Chart({ overview, onWindow, range, request }) {
  const el = useRef(null)
  const chart = useRef(null)
  const points = useRef([])
  const view = useRef(null)
  const [detail, setDetail] = useState(null)

  const extent = () => {
    const first = overview.points[0]?.t ?? Date.now() / 1000 - DAY
    return [first, Date.now() / 1000]
  }

  // Fenetre affichee, en secondes, deduite des pourcentages du zoom.
  const readWindow = () => {
    const zoom = chart.current.getOption().dataZoom[0]
    const [min, max] = extent()
    return [min + ((max - min) * zoom.start) / 100, min + ((max - min) * zoom.end) / 100]
  }

  useEffect(() => {
    chart.current = echarts.init(el.current, null, { locale: 'FR' })
    const observer = new ResizeObserver(() => chart.current.resize())
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

  // Redessine : apercu et detail assembles, fenetre conservee.
  useEffect(() => {
    const [min, max] = extent()
    const detailUsable = detail && detail.to > min
    points.current = compose(overview, detailUsable ? detail : null)
    const option = baseOption()
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
    chart.current.setOption(option, { notMerge: true })
  }, [overview, detail])

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
        <>
          <Chart overview={overview} range={DAY} request={pending} onWindow={setView} />
          <p className="program__hint climate__help">
            Molette ou pincement pour zoomer, glisser pour se déplacer, ou la barre
            du bas pour choisir la période. La bande grise autour de la courbe va du minimum au
            maximum de chaque point ; la zone claire est la plage visée,{' '}
            {overview.cold_c} à {overview.hot_c} °C.
          </p>
        </>
      )}
    </section>
  )
}
