/* Schemas du guide. Traits gris, rouge reserve a ce qui agit : la lumiere,
   la coupe, le pollen, le fruit. Les reperes chiffres renvoient a une legende
   en HTML, pour rester lisibles quelle que soit la largeur. */

const r = (n) => Math.round(n * 10) / 10

/** Feuille en amande partant de (x, y). Angle en degres, 0 a droite, 90 en haut. */
function leaf(x, y, angle, len, width = len * 0.4) {
  const a = (angle * Math.PI) / 180
  const dx = Math.cos(a)
  const dy = -Math.sin(a)
  const mx = x + dx * len * 0.45
  const my = y + dy * len * 0.45
  const nx = -dy * width
  const ny = dx * width
  return (
    `M${r(x)} ${r(y)}` +
    `Q${r(mx + nx)} ${r(my + ny)} ${r(x + dx * len)} ${r(y + dy * len)}` +
    `Q${r(mx - nx)} ${r(my - ny)} ${r(x)} ${r(y)}Z`
  )
}

function pepper(x, y, len) {
  return (
    `M${r(x - 4)} ${r(y)}` +
    `Q${r(x - 5)} ${r(y + len * 0.6)} ${r(x)} ${r(y + len)}` +
    `Q${r(x + 6)} ${r(y + len * 0.5)} ${r(x + 4)} ${r(y)}Z`
  )
}

function Callout({ x, y, n, to }) {
  return (
    <g className="fig__callout">
      {to && <line x1={x} y1={y} x2={to[0]} y2={to[1]} />}
      <circle cx={x} cy={y} r="10" />
      <text x={x} y={y + 4} textAnchor="middle">
        {n}
      </text>
    </g>
  )
}

function Pot({ cx, base, w, h }) {
  const top = base - h
  const t = w / 2
  const b = w * 0.36
  return (
    <>
      <path
        className="pot"
        d={`M${cx - t} ${top}H${cx + t}L${r(cx + b)} ${base}H${r(cx - b)}Z`}
      />
      <path className="ln-soft" d={`M${cx - t + 4} ${top + 6}H${cx + t - 4}`} />
    </>
  )
}

/** Plant a tige unique. Les feuilles au-dessus de cutY sont dessinees en
    fantome : c'est ce que l'etetage retire. */
function Shoot({ x, y, h, n, size, cotyledons = false, cutY = null }) {
  const kept = []
  const removed = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    const ly = y - h * (0.25 + 0.7 * t)
    const d = leaf(x, ly, i % 2 ? 152 : 28, size * (1 - 0.4 * t))
    ;(cutY !== null && ly < cutY ? removed : kept).push(d)
  }
  const tuft = [leaf(x, y - h, 68, size * 0.45), leaf(x, y - h, 112, size * 0.45)]
  ;(cutY !== null ? removed : kept).push(...tuft)

  const split = cutY ?? y - h
  return (
    <>
      <path className="ln" d={`M${x} ${y}V${r(split)}`} />
      {cotyledons && (
        <path
          className="leaf"
          d={leaf(x, y - h * 0.12, 12, size * 0.5, 2.5) + leaf(x, y - h * 0.12, 168, size * 0.5, 2.5)}
        />
      )}
      {kept.map((d) => (
        <path className="leaf" d={d} key={d} />
      ))}
      {cutY !== null && (
        <g className="ghost">
          <path className="ln" d={`M${x} ${r(split)}V${r(y - h)}`} />
          {removed.map((d) => (
            <path className="leaf" d={d} key={d} />
          ))}
        </g>
      )}
    </>
  )
}

/** Plant adulte : un tronc, la fourche en Y, quatre rameaux. (x, y) est la
    fourche. Avec `cut`, les rameaux sont rabattus a cette fraction. */
function Bush({ x, y, s = 1, trunk = 30, fruits = false, cut = null }) {
  const p = (dx, dy) => [r(x + dx * s), r(y - dy * s)]
  const left = p(-24, 30)
  const right = p(24, 30)
  const tips = [p(-46, 58), p(-14, 66), p(14, 66), p(46, 58)]
  const from = [left, left, right, right]
  const heading = [128, 72, 108, 52]

  const frame = `M${x} ${y + trunk}V${y}L${left}M${x} ${y}L${right}`

  if (cut !== null) {
    const stubs = tips.map((tip, i) => {
      const [ax, ay] = from[i]
      const cx = ax + (tip[0] - ax) * cut
      const cy = ay + (tip[1] - ay) * cut
      const len = Math.hypot(tip[0] - ax, tip[1] - ay)
      const nx = (-(tip[1] - ay) / len) * 7
      const ny = ((tip[0] - ax) / len) * 7
      return { a: from[i], c: [r(cx), r(cy)], tip, mark: [r(cx - nx), r(cy - ny), r(cx + nx), r(cy + ny)] }
    })
    return (
      <>
        <g className="ghost">
          {stubs.map(({ c, tip }) => (
            <path className="ln" d={`M${c}L${tip}`} key={`${tip}`} />
          ))}
          {tips.flatMap((tip, i) =>
            [-45, 0, 45].map((o) => (
              <path className="leaf" d={leaf(tip[0], tip[1], heading[i] + o, 20 * s)} key={`${i}${o}`} />
            )),
          )}
        </g>
        <path className="ln" d={frame + stubs.map(({ a, c }) => `M${a}L${c}`).join('')} />
        {stubs.map(({ mark }) => (
          <path className="snip" d={`M${mark[0]} ${mark[1]}L${mark[2]} ${mark[3]}`} key={`${mark}`} />
        ))}
        <path
          className="leaf"
          d={leaf(left[0], left[1], 190, 8 * s) + leaf(right[0], right[1], -10, 8 * s)}
        />
      </>
    )
  }

  return (
    <>
      <path
        className="ln"
        d={frame + tips.map((tip, i) => `M${from[i]}L${tip}`).join('')}
      />
      <path className="leaf" d={leaf(left[0], left[1], 200, 19 * s) + leaf(right[0], right[1], -20, 19 * s)} />
      {tips.flatMap((tip, i) =>
        [-45, 45, 0].map((o) => (
          <path className="leaf" d={leaf(tip[0], tip[1], heading[i] + o, 21 * s)} key={`${i}${o}`} />
        )),
      )}
      {fruits &&
        [
          [left[0] + 7 * s, left[1] + 6 * s],
          [right[0] - 7 * s, right[1] + 8 * s],
          [tips[1][0] + 2 * s, tips[1][1] + 12 * s],
        ].map(([fx, fy]) => (
          <g key={`${fx}`}>
            <path className="ln" d={`M${r(fx)} ${r(fy - 5)}V${r(fy)}`} />
            <path className="hot" d={pepper(fx, fy, 17 * s)} />
          </g>
        ))}
    </>
  )
}

export function SetupFigure() {
  return (
    <svg
      className="fig"
      viewBox="0 0 360 300"
      role="img"
      aria-label="Un plant en pot sous une lampe suspendue, entre un mur clair et un panneau blanc, avec un ventilateur. Les cinq repères sont détaillés dans la légende."
    >
      <defs>
        <linearGradient id="fig-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff2340" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ff2340" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* plafond, mur, sol */}
      <path className="ln-soft" d="M346 14H26V274H346" />
      <path className="ln-faint" d="M26 50l-12 12M26 100l-12 12M26 150l-12 12M26 200l-12 12M26 250l-12 12" />

      {/* lampe */}
      <path fill="url(#fig-cone)" d="M114 58H256L316 274H54Z" />
      <path className="ln-soft" d="M130 14V42M240 14V42" />
      <rect className="pot" x="108" y="42" width="154" height="16" rx="4" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect className="hot" x={117 + i * 16} y="53" width="9" height="3" rx="1" key={i} />
      ))}

      {/* rayon perdu, renvoye par le panneau */}
      <path className="ray" d="M254 60L335 150L228 172" />
      <path className="ln-panel" d="M338 118V274" />

      {/* plant */}
      <path className="ln" d="M140 264L146 274H224L230 264" />
      <Pot cx={185} base={270} w={84} h={60} />
      <Bush x={185} y={178} s={0.95} trunk={34} fruits />

      {/* distance lampe-feuillage */}
      <path className="ln-ghost" d="M142 100H96" />
      <path className="ln-soft" d="M96 60V100M90 60H102M90 100H102" />

      {/* ventilateur */}
      <circle className="ln" cx="74" cy="236" r="20" />
      {[0, 120, 240].map((a) => (
        <ellipse className="ln-soft" cx="74" cy="226" rx="4.5" ry="9" transform={`rotate(${a} 74 236)`} key={a} />
      ))}
      <path className="ln" d="M74 256V274M60 274H88" />
      <path className="ln-ghost" d="M102 228H124M102 238H128M102 248H124" />

      <Callout x={282} y={44} n="1" />
      <Callout x={74} y={80} n="2" />
      <Callout x={338} y={102} n="3" />
      <Callout x={74} y={200} n="4" />
      <Callout x={250} y={262} n="5" />
    </svg>
  )
}

function Stage({ label, children }) {
  return (
    <svg className="fig" viewBox="0 0 150 200" role="img" aria-label={label}>
      <path className="ln-faint" d="M6 190H144" />
      {children}
    </svg>
  )
}

export function TrayStage() {
  return (
    <Stage label="Trois alvéoles : une crosse qui sort de terre, deux cotylédons, puis les premières vraies feuilles.">
      {[45, 75, 105].map((cx) => (
        <Pot cx={cx} base={190} w={26} h={22} key={cx} />
      ))}
      <path className="ln" d="M45 168v-5q0-6 6-5" />
      <path className="ln" d="M75 168V153" />
      <path className="leaf" d={leaf(75, 153, 18, 12, 3) + leaf(75, 153, 162, 12, 3)} />
      <path className="ln" d="M105 168V146" />
      <path
        className="leaf"
        d={leaf(105, 154, 14, 11, 2.5) + leaf(105, 154, 166, 11, 2.5) + leaf(105, 146, 55, 10) + leaf(105, 146, 125, 10)}
      />
    </Stage>
  )
}

export function StarterStage() {
  return (
    <Stage label="Un godet et un jeune plant de quatre feuilles.">
      <Pot cx={75} base={190} w={46} h={40} />
      <Shoot x={75} y={150} h={44} n={4} size={19} cotyledons />
    </Stage>
  )
}

export function MiddleStage() {
  return (
    <Stage label="Un pot intermédiaire et un plant d’une dizaine de feuilles.">
      <Pot cx={75} base={190} w={76} h={60} />
      <Shoot x={75} y={130} h={76} n={7} size={25} />
    </Stage>
  )
}

export function FinalStage() {
  return (
    <Stage label="Le pot final et un plant adulte, ramifié en Y, qui porte des fruits.">
      <Pot cx={75} base={190} w={112} h={84} />
      <Bush x={75} y={80} s={0.75} trunk={26} fruits />
    </Stage>
  )
}

function Pruning({ label, children }) {
  return (
    <svg className="fig" viewBox="0 0 170 210" role="img" aria-label={label}>
      <path className="ln-faint" d="M6 200H164" />
      {children}
    </svg>
  )
}

export function ToppingFigure() {
  return (
    <Pruning label="Étêtage : la tige est coupée au-dessus de la cinquième feuille, la tête est retirée.">
      <Pot cx={85} base={200} w={64} h={44} />
      <Shoot x={85} y={156} h={112} n={8} size={26} cutY={84} />
      <path className="cut" d="M66 83H98" />
    </Pruning>
  )
}

export function CleaningFigure() {
  return (
    <Pruning label="Entretien : sous la fourche, les feuilles basses et la première fleur sont à retirer.">
      <Pot cx={85} base={200} w={84} h={52} />
      <Bush x={85} y={104} s={0.8} trunk={44} />
      <path className="cut" d={leaf(85, 138, 205, 24) + leaf(85, 128, -18, 22) + leaf(85, 118, 160, 15)} />
      <circle className="cut" cx="85" cy="97" r="5" />
    </Pruning>
  )
}

export function CutbackFigure() {
  return (
    <Pruning label="Taille de repos : chaque rameau est rabattu à quelques centimètres au-dessus de la fourche.">
      <Pot cx={85} base={200} w={84} h={52} />
      <Bush x={85} y={104} s={0.8} trunk={44} cut={0.42} />
    </Pruning>
  )
}

export function FlowerFigure() {
  return (
    <svg
      className="fig"
      viewBox="0 0 300 250"
      role="img"
      aria-label="Coupe d’une fleur de piment, tournée vers le bas, avec un pinceau. Les quatre repères sont détaillés dans la légende."
    >
      {/* pedoncule, calice, ovaire */}
      <path className="ln" d="M118 6C118 30 150 22 150 46" />
      <path className="leaf" d="M132 51Q150 40 168 51L164 63Q150 57 136 63Z" />
      <ellipse className="leaf" cx="150" cy="76" rx="13" ry="14" />
      {[[145, 72], [155, 72], [146, 81], [154, 81]].map(([x, y]) => (
        <circle className="dot" cx={x} cy={y} r="1.6" key={`${x}${y}`} />
      ))}

      {/* petales : deux au fond, deux de profil */}
      <path className="ln-soft" d={leaf(146, 88, 245, 96, 22) + leaf(154, 88, 295, 96, 22)} />
      <path className="petal" d={leaf(143, 84, 212, 94, 26) + leaf(157, 84, -32, 94, 26)} />

      {/* pistil et etamines */}
      <path className="ln" d="M150 90V158" />
      <circle className="pot" cx="150" cy="162" r="4.5" />
      <path className="ln-soft" d="M145 90L132 114M155 90L168 114" />
      <ellipse className="leaf" cx="141" cy="132" rx="4" ry="13" />
      <ellipse className="leaf" cx="159" cy="132" rx="4" ry="13" />
      <ellipse className="leaf" cx="130" cy="128" rx="5" ry="15" transform="rotate(-6 130 128)" />
      <ellipse className="leaf" cx="170" cy="128" rx="5" ry="15" transform="rotate(6 170 128)" />

      {/* pollen */}
      {[[121, 142], [125, 152], [135, 150], [178, 146], [168, 152]].map(([x, y]) => (
        <circle className="hot" cx={x} cy={y} r="1.7" key={`${x}${y}`} />
      ))}
      <path className="cut" d="M174 148Q174 162 158 163" />

      {/* pinceau */}
      <path className="ln-brush" d="M266 240L212 192" />
      <path className="leaf" d="M219 185Q201 167 180 163Q184 184 205 199Z" />
      <path className="ln-soft" d="M211 191L189 171" />

      <Callout x={70} y={178} n="1" to={[127, 141]} />
      <Callout x={150} y={214} n="2" to={[150, 168]} />
      <Callout x={238} y={60} n="3" to={[164, 75]} />
      <Callout x={274} y={200} n="4" to={[250, 225]} />
    </svg>
  )
}
