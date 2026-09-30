import { useEffect, useState } from 'react'
import {
  CleaningFigure,
  CutbackFigure,
  FinalStage,
  FlowerFigure,
  MiddleStage,
  SetupFigure,
  StarterStage,
  ToppingFigure,
  TrayStage,
} from '../components/GuideFigures.jsx'

/* Reperes en semaines depuis le semis, pour un Capsicum annuum. */
const WEEKS = 36
const TICKS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36]

const PHASES = [
  { id: 'semis', name: 'Semis', from: 0, to: 3 },
  { id: 'repiquage', name: 'Repiquage', from: 3, to: 7 },
  { id: 'pot-final', name: 'Pot final', from: 7, to: 9 },
  { id: 'croissance', name: 'Croissance', from: 9, to: 13 },
  { id: 'floraison', name: 'Floraison', from: 12, to: 17 },
  { id: 'fruits', name: 'Fruits et récolte', from: 15, to: 30, kind: 'harvest' },
  { id: 'cycles', name: 'Cycles suivants', from: 30, to: 36, kind: 'rest' },
]

const TOC = [
  {
    title: 'Avant de commencer',
    items: [
      { id: 'installation', label: 'Installation' },
      { id: 'varietes', label: 'Variétés' },
    ],
  },
  {
    title: 'Les phases',
    items: PHASES.map((phase, i) => ({ id: phase.id, label: phase.name, num: i + 1 })),
  },
  {
    title: 'Les gestes',
    items: [
      { id: 'lumiere', label: 'Lumière' },
      { id: 'arrosage', label: 'Arrosage' },
      { id: 'engrais', label: 'Engrais' },
      { id: 'tailles', label: 'Tailles' },
    ],
  },
  {
    title: 'Au besoin',
    items: [
      { id: 'problemes', label: 'Quand ça va mal' },
      { id: 'memo', label: 'Mémo par phase' },
    ],
  },
]

const SECTION_IDS = TOC.flatMap((group) => group.items.map((item) => item.id))

/** Section en cours de lecture : celle qui traverse le haut de l'ecran. */
function useActiveSection(ids) {
  const [active, setActive] = useState(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-15% 0px -75% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])

  return active
}

function Cycle() {
  return (
    <section className="panel cycle" aria-labelledby="cycle-title">
      <h3 className="program__title" id="cycle-title">
        Le cycle, en semaines depuis le semis
      </h3>

      <div className="cycle__axis" aria-hidden="true">
        <div className="cycle__scale">
          {TICKS.map((week) => (
            <span key={week} style={{ left: `${(week / WEEKS) * 100}%` }}>
              {week}
            </span>
          ))}
        </div>
      </div>

      <ol className="cycle__rows">
        {PHASES.map((phase, i) => (
          <li key={phase.id}>
            <a className="cycle__row" href={`#${phase.id}`}>
              <span className="cycle__name">
                <span className="cycle__num">{i + 1}</span>
                {phase.name}
              </span>
              <span className="cycle__track">
                <span
                  className="cycle__bar"
                  data-kind={phase.kind}
                  style={{
                    left: `${(phase.from / WEEKS) * 100}%`,
                    width: `${((phase.to - phase.from) / WEEKS) * 100}%`,
                  }}
                />
              </span>
              <span className="cycle__range">
                {phase.from} à {phase.to}
              </span>
            </a>
          </li>
        ))}
      </ol>

      <p className="program__hint">
        Repères pour un Capsicum annuum (jalapeño, cayenne, Espelette). Comptez
        quatre à huit semaines de plus pour un Capsicum chinense (habanero,
        Scotch bonnet). Après la première récolte, le plant se taille et repart&nbsp;:
        il vit plusieurs années.
      </p>
    </section>
  )
}

function Toc({ active }) {
  return (
    <nav className="toc" aria-label="Sommaire du guide">
      {TOC.map((group) => (
        <div className="toc__group" key={group.title}>
          <p className="toc__title">{group.title}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={item.id === active ? 'toc__link is-active' : 'toc__link'}
                  aria-current={item.id === active ? 'location' : undefined}
                >
                  {item.num && <span className="toc__num">{item.num}</span>}
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Topic({ id, num, title, children }) {
  return (
    <section className="topic" id={id} aria-labelledby={`${id}-title`}>
      <h4 className="topic__title" id={`${id}-title`}>
        {num && <span className="topic__num">{num}</span>}
        {title}
      </h4>
      {children}
    </section>
  )
}

function Facts({ items }) {
  return (
    <dl className="facts">
      {items.map(([label, value, note]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            <span className="facts__value">{value}</span>
            {note && <span className="facts__note">{note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Note({ title, warn = false, children }) {
  return (
    <p className={warn ? 'note note--warn' : 'note'}>
      <strong>{title}</strong> {children}
    </p>
  )
}

function Next({ children }) {
  return (
    <p className="next">
      <strong>Passez à la suite quand</strong> {children}
    </p>
  )
}

function Table({ label, head, rows }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table className="table">
        <thead>
          <tr>
            {head.map((cell) => (
              <th scope="col" key={cell}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([first, ...rest]) => (
            <tr key={first}>
              <th scope="row">{first}</th>
              {rest.map((cell, i) => (
                <td key={i} className={cell.length > 24 ? 'is-long' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Guide({ onOpenDashboard }) {
  const active = useActiveSection(SECTION_IDS)

  // Arrivee directe sur /guide#section : la cible n'existait pas au chargement.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  return (
    <main className="guide">
      <header className="guide__head">
        <h2 className="guide__title">Cultiver des piments en intérieur</h2>
        <p className="guide__lead">
          De la graine aux récoltes des années suivantes, sous une lampe de
          culture et sans chambre de culture&nbsp;: les plants vivent à l’air de la
          pièce. Le guide suit l’ordre des opérations, puis détaille les gestes
          qui reviennent à chaque phase.
        </p>
      </header>

      <Cycle />

      <div className="guide__layout">
        <Toc active={active} />

        <div className="guide__body">
          <section className="chapter">
            <h3 className="chapter__title">Avant de commencer</h3>

            <Topic id="installation" title="L’installation, sans chambre de culture">
              <p>
                Une chambre de culture rend trois services&nbsp;: elle renvoie la
                lumière vers les plants, elle tient un climat, elle cache la
                lampe. Sans elle, chacun se remplace simplement.
              </p>

              <figure className="panel figure">
                <div className="figure__art">
                  <SetupFigure />
                </div>
                <ol className="legend legend--columns">
                  <li>
                    <strong>La lampe, suspendue et réglable.</strong> Des
                    cordons à crémaillère permettent de la monter à mesure que
                    les plants grandissent. Elle reste à plat, centrée sur le
                    feuillage.
                  </li>
                  <li>
                    <strong>La distance au feuillage.</strong> Du bas de la
                    lampe au sommet des plants&nbsp;: c’est le réglage qui change à
                    chaque phase, de 60&nbsp;cm sur des semis à 30&nbsp;cm en floraison.
                  </li>
                  <li>
                    <strong>Un panneau blanc.</strong> La lumière qui part sur
                    les côtés est perdue. Un mur clair, un carton plume ou une
                    plaque de polystyrène à 10 ou 20&nbsp;cm des pots la renvoie
                    vers le bas du feuillage. Le blanc mat réfléchit presque
                    aussi bien qu’un film miroir.
                  </li>
                  <li>
                    <strong>Un petit ventilateur.</strong> Réglé pour que les
                    feuilles frémissent à peine. Il épaissit les tiges, sèche
                    la surface du terreau et secoue les fleurs.
                  </li>
                  <li>
                    <strong>Une soucoupe.</strong> À vider une demi-heure après
                    chaque arrosage&nbsp;: les racines ne doivent pas tremper.
                  </li>
                </ol>
              </figure>

              <Facts
                items={[
                  ['Température, lampe allumée', '22 à 28\u00a0°C'],
                  ['Température, lampe éteinte', '17 à 20\u00a0°C'],
                  ['Humidité de l’air', '40 à 60\u00a0%'],
                  [
                    'Surface éclairée',
                    '60\u00a0×\u00a060\u00a0cm',
                    'pour 100 à 150\u00a0W de LED horticole, soit deux ou trois plants adultes',
                  ],
                ]}
              />

              <p>
                L’air d’un logement convient presque toute l’année. L’hiver, le
                chauffage fait souvent tomber l’humidité sous 35&nbsp;%&nbsp;: c’est le
                terrain des acariens, surveillez le dessous des feuilles.
              </p>
              <p>
                Gardez la prise connectée et les multiprises plus haut que les
                pots, et laissez les câbles former une boucle sous la prise&nbsp;:
                l’eau qui ruisselle suit les fils.
              </p>

              <Note title="Dans Pepperbox.">
                Sans chambre, la lampe éclaire aussi la pièce. La priorité à la
                présence l’éteint pendant la plage de silence quand vous êtes
                là, mais ces heures sont perdues pour les plants. Placez plutôt
                le programme sur vos heures d’absence.{' '}
                <a href="/" onClick={onOpenDashboard}>
                  Régler le programme
                </a>
              </Note>
            </Topic>

            <Topic id="varietes" title="Choisir ses variétés">
              <p>
                L’espèce décide du calendrier, de la taille du pot et de la
                patience qu’il faudra. La hauteur sous la lampe est comptée&nbsp;:
                les variétés compactes sont les plus faciles.
              </p>

              <Table
                label="Les cinq espèces de piments cultivées"
                head={['Espèce', 'Exemples', 'Levée', 'De la fleur au fruit mûr', 'Pot final']}
                rows={[
                  ['C. annuum', 'jalapeño, cayenne, Espelette, padrón', '7 à 14\u00a0j', '6 à 10\u00a0sem.', '7 à 10\u00a0L'],
                  ['C. chinense', 'habanero, Scotch bonnet, Carolina Reaper', '14 à 28\u00a0j', '10 à 16\u00a0sem.', '10 à 15\u00a0L'],
                  ['C. baccatum', 'aji amarillo, Lemon Drop', '10 à 21\u00a0j', '9 à 13\u00a0sem.', '15 à 20\u00a0L'],
                  ['C. frutescens', 'tabasco, piment oiseau', '10 à 21\u00a0j', '9 à 12\u00a0sem.', '7 à 10\u00a0L'],
                  ['C. pubescens', 'rocoto, manzano', '14 à 28\u00a0j', '12 à 16\u00a0sem.', '15 à 20\u00a0L'],
                ]}
              />

              <p>
                Les annuum sont les plus rapides et les plus indulgents&nbsp;: un
                bon premier choix. Les chinense demandent plus de chaleur,
                surtout pour germer. Les baccatum deviennent grands et
                supportent bien la taille. Les pubescens préfèrent la fraîcheur,
                entre 15 et 22&nbsp;°C, et peinent dans une pièce chaude.
              </p>
              <p>
                Deux ou trois variétés suffisent pour un premier cycle&nbsp;: chaque
                plant adulte occupe environ 30&nbsp;cm de côté sous la lampe.
              </p>
            </Topic>
          </section>

          <section className="chapter">
            <h3 className="chapter__title">Les phases</h3>

            <Topic id="semis" num="1" title="Semis">
              <p>
                Le piment est tropical&nbsp;: la graine attend de la chaleur, pas de
                la lumière.
              </p>
              <ol className="steps">
                <li>
                  Remplissez des alvéoles d’un terreau à semis fin, humidifié à
                  l’avance&nbsp;: frais au toucher, pas détrempé.
                </li>
                <li>
                  Posez une graine par alvéole à 5&nbsp;mm de profondeur, recouvrez
                  sans tasser.
                </li>
                <li>
                  Couvrez d’un couvercle de mini-serre ou d’un film, et placez
                  au chaud, idéalement sur un tapis chauffant.
                </li>
                <li>
                  Aérez chaque jour. Dès qu’une crosse sort de terre, retirez
                  le couvercle et allumez la lampe.
                </li>
              </ol>

              <Facts
                items={[
                  ['Température du terreau', '26 à 30\u00a0°C', 'sous 20\u00a0°C, la levée traîne ou échoue'],
                  ['Levée', '7 à 14 jours', 'jusqu’à quatre semaines pour les chinense'],
                  ['Lumière après la levée', '14 à 16\u00a0h', 'lampe à 50 ou 60\u00a0cm, ou gradateur au tiers'],
                  ['Arrosage', 'par le bas', 'un fond d’eau dans le plateau un quart d’heure, puis on vide'],
                ]}
              />

              <p>
                Faire tremper les graines 12 à 24&nbsp;h dans de l’eau tiède accélère
                un peu la levée des variétés lentes. Ce n’est pas indispensable.
              </p>

              <Note title="Deux accidents de semis." warn>
                Une tige longue et fine qui se couche&nbsp;: la lampe est trop loin
                ou s’allume trop tard. Une tige pincée et noire au ras du sol&nbsp;:
                c’est la fonte des semis, due à un terreau trop mouillé dans un
                air confiné. Aérez, arrosez par le bas, ressemez les alvéoles
                touchées.
              </Note>

              <Next>
                le plant porte deux à quatre vraies feuilles, au-dessus des deux
                cotylédons lisses du départ.
              </Next>
            </Topic>

            <Topic id="repiquage" num="2" title="Repiquage">
              <p>
                Le plant quitte le terreau à semis, pauvre, pour un godet de
                terreau nourri où il va construire ses racines.
              </p>
              <ol className="steps">
                <li>Arrosez les semis la veille&nbsp;: la motte se tient mieux.</li>
                <li>
                  Remplissez un godet de 7 à 9&nbsp;cm d’un terreau léger, par
                  exemple un terreau de plantation coupé d’un quart de perlite.
                </li>
                <li>
                  Sortez le plant en poussant la motte par-dessous. Tenez-le
                  par une feuille, jamais par la tige&nbsp;: une feuille se
                  remplace.
                </li>
                <li>
                  Installez-le un peu plus bas qu’il n’était, jusque sous les
                  cotylédons si la tige s’est allongée. Tassez à peine, puis
                  arrosez pour plaquer le terreau contre les racines.
                </li>
              </ol>

              <figure className="panel figure">
                <div className="stages">
                  <div className="stage">
                    <TrayStage />
                    <p className="stage__label">Alvéole</p>
                    <p className="stage__note">jusqu’à 2 à 4 vraies feuilles</p>
                  </div>
                  <div className="stage">
                    <StarterStage />
                    <p className="stage__label">Godet de 7 à 9&nbsp;cm</p>
                    <p className="stage__note">trois à quatre semaines</p>
                  </div>
                  <div className="stage">
                    <MiddleStage />
                    <p className="stage__label">Pot de 2 à 3&nbsp;L</p>
                    <p className="stage__note">facultatif, deux à trois semaines</p>
                  </div>
                  <div className="stage">
                    <FinalStage />
                    <p className="stage__label">Pot final de 7 à 20&nbsp;L</p>
                    <p className="stage__note">pour le reste de sa vie</p>
                  </div>
                </div>
                <figcaption className="figure__caption">
                  On change de contenant quand les racines tapissent la motte,
                  avant qu’elles ne tournent en rond au fond.
                </figcaption>
              </figure>

              <p>
                Les jours suivants, le plant semble à l’arrêt&nbsp;: il fait des
                racines. Laissez la lampe à la même hauteur et n’apportez pas
                d’engrais pendant deux semaines, le terreau neuf en contient.
              </p>

              <Next>
                les racines sortent par les trous du godet et la motte se tient
                d’un bloc au dépotage.
              </Next>
            </Topic>

            <Topic id="pot-final" num="3" title="Pot final">
              <p>
                Un pot trop grand d’emblée reste mouillé en profondeur et
                asphyxie un jeune plant&nbsp;: on monte par étapes. Le volume final
                fixe la taille du plant, et donc la récolte.
              </p>

              <Facts
                items={[
                  ['Volume', '7 à 20\u00a0L', 'selon l’espèce, voir le tableau des variétés'],
                  ['Substrat', 'terreau + 20 à 30\u00a0% de perlite', 'il doit s’égoutter vite et rester aéré'],
                  ['Contenant', 'percé, sur soucoupe', 'un pot en géotextile sèche plus vite et évite le chignon de racines'],
                ]}
              />

              <ol className="steps">
                <li>
                  Remplissez le pot aux deux tiers et creusez un trou à la
                  taille de la motte.
                </li>
                <li>
                  Dépotez sans défaire la motte. Si les racines tournent en
                  rond, griffez-les légèrement sur les côtés.
                </li>
                <li>
                  Gardez le collet au même niveau qu’avant, à 2 ou 3&nbsp;cm sous le
                  bord du pot&nbsp;: cette marge sert de cuvette d’arrosage.
                </li>
                <li>
                  Comblez, tassez du bout des doigts, arrosez lentement jusqu’à
                  ce que l’eau sorte par le fond.
                </li>
              </ol>

              <p>
                Pas besoin de graviers ni de billes d’argile au fond&nbsp;: un
                terreau aéré dans un pot percé draine mieux sans.
              </p>
              <p>
                Remontez la lampe d’une dizaine de centimètres pendant trois ou
                quatre jours. Un plant qui vient d’être rempoté boit mal et
                supporte moins la pleine lumière.
              </p>
              <p>
                Supprimez les boutons floraux qui apparaissent avant que le
                plant soit installé dans ce pot&nbsp;: à ce stade, chaque fruit se
                paie en feuilles et en racines.
              </p>

              <Next>
                de nouvelles feuilles apparaissent, en général une à deux
                semaines après le rempotage.
              </Next>
            </Topic>

            <Topic id="croissance" num="4" title="Croissance">
              <p>
                Le plant fabrique la charpente qui portera les fruits. Il lui
                faut des journées longues, de l’azote, et un pot qu’on laisse
                sécher entre deux arrosages.
              </p>

              <Facts
                items={[
                  ['Lumière', '14 à 16\u00a0h', 'lampe à 40 ou 50\u00a0cm'],
                  ['Engrais', 'NPK 3-1-3', 'engrais de croissance, à demi-dose, un arrosage sur deux'],
                  ['Température', '22 à 28\u00a0°C'],
                ]}
              />

              <p>
                Le piment se divise de lui-même&nbsp;: arrivée à une dizaine de
                feuilles, la tige se sépare en deux ou trois branches et porte
                sa première fleur à la fourche. Cette fourche en Y est le
                squelette du plant.
              </p>
              <p>
                Pour un plant plus bas et plus large, mieux adapté à une lampe
                fixe, on peut l’étêter avant qu’il ne fourche&nbsp;: voir{' '}
                <a href="#tailles">Tailles</a>.
              </p>
              <ul>
                <li>
                  Tournez les pots d’un quart de tour chaque semaine&nbsp;: sans
                  parois réfléchissantes, le côté du mur reçoit moins de
                  lumière.
                </li>
                <li>
                  Tuteurez dès que le plant dépasse 30&nbsp;cm, avant qu’il ne porte
                  des fruits.
                </li>
                <li>
                  Remontez la lampe à mesure que le plant grandit, pour garder
                  la distance.
                </li>
              </ul>

              <Next>
                les boutons floraux se multiplient aux fourches et le plant
                occupe sa place sous la lampe.
              </Next>
            </Topic>

            <Topic id="floraison" num="5" title="Floraison et pollinisation">
              <p>
                Le piment fleurit quand il est assez développé, quelle que soit
                la durée du jour. Raccourcir les journées ne déclenche rien&nbsp;:
                on rapproche la lampe et on change d’engrais.
              </p>

              <Facts
                items={[
                  ['Lumière', '12 à 14\u00a0h', 'lampe à 30 ou 40\u00a0cm, plus proche, elle compense des journées plus courtes'],
                  ['Engrais', 'NPK 2-2-4', 'engrais de floraison, dès les premiers boutons'],
                  ['Température', '20 à 30\u00a0°C', 'au-delà de 32\u00a0°C le pollen devient stérile'],
                  ['Humidité de l’air', '40 à 70\u00a0%'],
                ]}
              />

              <h5 className="topic__sub">Polliniser à la main</h5>
              <p>
                La fleur de piment se féconde elle-même&nbsp;: elle porte à la fois
                le pollen et le pistil. Dehors, le vent et les insectes la
                secouent. En intérieur, c’est à vous de le faire.
              </p>

              <figure className="panel figure figure--split">
                <div className="figure__art">
                  <FlowerFigure />
                </div>
                <ol className="legend">
                  <li>
                    <strong>Les anthères</strong> portent le pollen. Elles
                    s’ouvrent un à deux jours après la fleur, quand l’air est
                    sec.
                  </li>
                  <li>
                    <strong>Le stigmate</strong>, au bout du pistil, doit
                    recevoir ce pollen.
                  </li>
                  <li>
                    <strong>L’ovaire</strong> devient le fruit. S’il n’est pas
                    fécondé, la fleur jaunit au pédoncule et tombe.
                  </li>
                  <li>
                    <strong>Le pinceau</strong> tourne doucement au cœur de
                    chaque fleur ouverte, puis passe à la suivante.
                  </li>
                </ol>
              </figure>

              <p>Trois méthodes, de la plus simple à la plus sûre&nbsp;:</p>
              <ul>
                <li>
                  le ventilateur et une pichenette sur les tiges, chaque jour&nbsp;:
                  souvent suffisant&nbsp;;
                </li>
                <li>un pinceau fin ou un coton-tige, de fleur en fleur&nbsp;;</li>
                <li>
                  une brosse à dents électrique appuyée une seconde contre le
                  pédoncule&nbsp;: la vibration libère le pollen comme le ferait un
                  bourdon.
                </li>
              </ul>
              <p>
                Le meilleur moment est le milieu de la période éclairée, quand
                le pollen est sec et poudreux. Une fleur fécondée perd ses
                pétales en quelques jours et laisse un petit fruit vert. Une
                fleur qui tombe entière, avec son pédoncule, n’a pas pris.
              </p>

              <Note title="Les fleurs tombent." warn>
                Les causes habituelles&nbsp;: plus de 32&nbsp;°C le jour, moins de 15&nbsp;°C
                la nuit, trop d’azote, un terreau détrempé ou trop sec, pas de
                pollinisation. Les toutes premières fleurs tombent souvent sans
                raison&nbsp;: attendez la vague suivante avant de vous inquiéter.
              </Note>
              <Note title="Pour garder vos graines.">
                Deux variétés qui fleurissent côte à côte se croisent. Le fruit
                reste fidèle, pas ses graines. Enfermez un rameau en boutons
                dans un sachet d’organza et pollinisez-le à part.
              </Note>

              <Next>les premiers fruits sont noués.</Next>
            </Topic>

            <Topic id="fruits" num="6" title="Fruits et récolte">
              <p>
                Le fruit grossit d’abord, vert, jusqu’à sa taille finale, puis
                change de couleur. C’est cette seconde étape qui est longue.
              </p>

              <Facts
                items={[
                  ['De la fleur au fruit mûr', '6 à 10 semaines', '10 à 16 pour les chinense'],
                  ['Lumière', '12 à 14\u00a0h', 'lampe à 30 ou 40\u00a0cm'],
                  ['Engrais', 'NPK 2-2-4', 'engrais de floraison, à la dose de l’étiquette'],
                  ['Arrosage', 'régulier', 'les à-coups provoquent la nécrose apicale'],
                ]}
              />

              <p>
                Un plant chargé boit beaucoup plus&nbsp;: soupesez le pot tous les
                jours et tuteurez les branches qui ploient.
              </p>
              <p>
                Récoltez au sécateur en gardant le pédoncule&nbsp;: tirer à la main
                casse les branches. Un fruit vert se mange, moins sucré et
                souvent moins piquant. Un fruit cueilli quand il commence à
                tourner finit de mûrir à température ambiante.
              </p>
              <p>
                Cueillez souvent. Tant que des fruits mûrissent sur le plant,
                il fait moins de fleurs.
              </p>
              <p>
                Le piquant vient de la capsaïcine, concentrée dans le tissu
                blanc qui porte les graines. Mettez des gants pour couper les
                variétés fortes, et ne vous frottez pas les yeux.
              </p>
              <p>
                Pour conserver la récolte&nbsp;: séchage à l’air pour les fruits à
                chair fine, au déshydrateur à 50&nbsp;°C pour les autres&nbsp;;
                congélation des fruits entiers&nbsp;; fermentation en sauce.
              </p>

              <Next>
                la grosse vague de fruits est récoltée et le plant se dégarnit.
              </Next>
            </Topic>

            <Topic id="cycles" num="7" title="Cycles suivants">
              <p>
                Le piment est une plante vivace. Dehors, c’est le gel qui le
                tue&nbsp;; sous une lampe, il n’a pas d’hiver et produit plusieurs
                années. La deuxième est souvent la meilleure&nbsp;: la charpente et
                les racines sont déjà là, les fruits arrivent en deux ou trois
                mois au lieu de cinq.
              </p>

              <h5 className="topic__sub">Enchaîner sans pause</h5>
              <ol className="steps">
                <li>
                  Raccourcissez chaque branche d’un tiers, au-dessus d’un
                  nœud. Retirez le bois mort et les feuilles abîmées.
                </li>
                <li>
                  Surfacez&nbsp;: remplacez les 3 à 5&nbsp;cm de terreau du dessus par du
                  terreau neuf.
                </li>
                <li>
                  Repassez à l’engrais de croissance trois semaines, puis à
                  l’engrais de floraison aux premiers boutons.
                </li>
              </ol>

              <h5 className="topic__sub">Accorder un repos</h5>
              <p>
                Utile pour un plant fatigué, avant une longue absence, ou pour
                alléger la facture d’électricité quelques semaines.
              </p>
              <ol className="steps">
                <li>
                  Rabattez sévèrement&nbsp;: gardez la fourche et 5 à 10&nbsp;cm de
                  chaque branche, avec deux ou trois nœuds. Le schéma est dans{' '}
                  <a href="#tailles">Tailles</a>.
                </li>
                <li>
                  Inspectez et douchez le plant&nbsp;: pucerons et acariens
                  profitent d’un plant affaibli.
                </li>
                <li>
                  Placez-le au frais si possible, entre 15 et 18&nbsp;°C, avec 8 à
                  10&nbsp;h de lumière ou près d’une fenêtre. Un verre d’eau toutes
                  les deux ou trois semaines, pas d’engrais.
                </li>
                <li>
                  Après six à huit semaines, relancez&nbsp;: rempotage, 14 à 16&nbsp;h de
                  lumière, chaleur, engrais de croissance dès les premières
                  feuilles.
                </li>
              </ol>

              <h5 className="topic__sub">Rempoter un plant adulte</h5>
              <p>
                Une fois par an, à la relance. Dépotez, retirez un quart à un
                tiers de la motte en coupant le bas et le tour au couteau, puis
                replantez dans le même pot avec du terreau neuf. Le plant garde
                sa taille, les racines retrouvent de la place.
              </p>
              <p>
                Tous ne vieillissent pas pareil&nbsp;: les chinense, baccatum et
                pubescens tiennent cinq ans et plus, les annuum s’épuisent en
                deux ou trois saisons. Quand les récoltes baissent malgré la
                taille et le rempotage, ressemez.
              </p>
            </Topic>
          </section>

          <section className="chapter">
            <h3 className="chapter__title">Les gestes</h3>

            <Topic id="lumiere" title="Lumière">
              <p>
                Trois réglages comptent&nbsp;: combien de temps la lampe éclaire, à
                quelle distance, et ce qui arrive réellement sur les feuilles.
              </p>

              <Table
                label="Réglages de la lampe par phase"
                head={['Phase', 'Durée', 'Distance', 'PPFD', 'DLI']}
                rows={[
                  ['Semis', '14 à 16\u00a0h', '50 à 60\u00a0cm', '100 à 250', '6 à 12'],
                  ['Croissance', '14 à 16\u00a0h', '40 à 50\u00a0cm', '250 à 450', '15 à 25'],
                  ['Floraison, fruits', '12 à 14\u00a0h', '30 à 40\u00a0cm', '450 à 700', '20 à 30'],
                  ['Repos', '8 à 10\u00a0h', '60\u00a0cm et plus', '100 à 200', '3 à 6'],
                ]}
              />
              <p className="caption">
                PPFD en µmol/m²/s, DLI en mol/m²/jour. Distances pour un panneau
                LED de 100 à 150&nbsp;W à pleine puissance&nbsp;: si le fabricant fournit
                une carte d’éclairement, elle fait foi.
              </p>

              <p>
                Le PPFD mesure la lumière utile qui touche la feuille à un
                instant donné. Le DLI est le total reçu dans la journée, et
                c’est lui qui fait la récolte&nbsp;:
              </p>
              <p className="formula">DLI = PPFD × heures × 0,0036</p>
              <p>
                Ainsi 400&nbsp;µmol pendant 14&nbsp;h donnent 20&nbsp;mol. Une lampe un peu
                loin se compense par des journées plus longues, jusqu’à 16&nbsp;h&nbsp;:
                au-delà, le gain est nul, le plant a besoin de sa nuit. Gardez
                surtout des horaires réguliers.
              </p>

              <h5 className="topic__sub">Lire le plant</h5>
              <ul>
                <li>
                  <strong>Lampe trop loin&nbsp;:</strong> tiges qui s’allongent,
                  grands espaces entre les feuilles, plant qui penche vers la
                  lumière.
                </li>
                <li>
                  <strong>Lampe trop près&nbsp;:</strong> feuilles du haut qui se
                  dressent, se replient en gouttière ou blanchissent alors que
                  le bas reste vert.
                </li>
              </ul>
              <p>
                Sans capteur, l’application luxmètre d’un téléphone donne un
                ordre de grandeur&nbsp;: sous une LED blanche, divisez les lux par
                70 pour approcher le PPFD. La mesure ne vaut rien sous une
                lampe rose.
              </p>

              <Note title="Dans Pepperbox.">
                Le programme se règle sur la frise du tableau de bord&nbsp;; la
                prise l’exécute elle-même, même si le serveur est arrêté. Une
                lampe de 130&nbsp;W allumée 14&nbsp;h consomme 1,82&nbsp;kWh par jour&nbsp;: le
                tableau de bord affiche l’énergie cumulée et son coût.{' '}
                <a href="/" onClick={onOpenDashboard}>
                  Ouvrir le tableau de bord
                </a>
              </Note>
            </Topic>

            <Topic id="arrosage" title="Arrosage">
              <p>
                L’excès d’eau tue plus de piments en pot que la soif. Les
                racines respirent&nbsp;: un terreau gorgé en permanence les
                asphyxie. La règle tient en deux temps, arroser à fond puis
                attendre.
              </p>
              <ol className="steps">
                <li>
                  Arrosez lentement, en plusieurs passages, jusqu’à ce qu’un
                  peu d’eau sorte par le fond.
                </li>
                <li>Videz la soucoupe au bout d’une demi-heure.</li>
                <li>
                  N’arrosez de nouveau que lorsque le pot est nettement plus
                  léger et le terreau sec sur 3 à 4&nbsp;cm, un doigt enfoncé
                  jusqu’à la deuxième phalange.
                </li>
              </ol>
              <p>
                Soupesez le pot juste après un arrosage, puis quand le plant
                commence à fléchir&nbsp;: vous avez vos deux repères. Après quelques
                jours, la main suffit.
              </p>

              <Facts
                items={[
                  ['Eau', 'à température ambiante', 'celle du robinet convient, tirée à l’avance'],
                  ['pH', '6 à 6,8', 'une eau très calcaire finit par bloquer le fer'],
                  ['Rythme', 'tous les 2 à 5 jours', 'selon le plant, le pot et la saison, jamais au calendrier'],
                ]}
              />

              <h5 className="topic__sub">Lire le plant</h5>
              <ul>
                <li>
                  <strong>Il a soif&nbsp;:</strong> feuilles molles, terreau sec,
                  pot léger. Il se redresse dans l’heure qui suit l’arrosage.
                </li>
                <li>
                  <strong>Il est noyé&nbsp;:</strong> feuilles molles ou
                  jaunissantes, terreau humide, pot lourd. N’arrosez pas,
                  laissez sécher, griffez la surface pour l’aérer.
                </li>
              </ul>
              <p>
                Un léger manque d’eau pendant la maturation passe pour
                renforcer le piquant. Un vrai coup de sec fait tomber les
                fleurs et les jeunes fruits.
              </p>
              <p>
                Pour une absence d’une dizaine de jours, une réserve d’eau à
                mèche ou un goutte-à-goutte sur minuterie fait l’affaire.
                Essayez-le une semaine avant de partir.
              </p>
            </Topic>

            <Topic id="engrais" title="Engrais">
              <p>
                Un pot contient peu de terre&nbsp;: passé le premier mois, tout ce
                que mange le plant vient de l’arrosoir. L’étiquette donne trois
                chiffres, N-P-K. L’azote (N) fait les feuilles, le phosphore
                (P) les racines et les fleurs, le potassium (K) les fruits.
              </p>

              <Table
                label="Engrais par phase"
                head={['Phase', 'Engrais', 'NPK visé', 'Dose', 'Rythme']}
                rows={[
                  ['Semis', 'aucun', '—', '—', 'le terreau suffit'],
                  ['Repiquage', 'croissance, après deux semaines', '3-1-3', 'un quart', 'une fois par semaine'],
                  ['Croissance', 'croissance', '3-1-3', 'la moitié, puis la dose', 'un arrosage sur deux'],
                  ['Floraison, fruits', 'floraison ou «\u00a0tomates\u00a0»', '2-2-4', 'la dose', 'un arrosage sur deux'],
                  ['Repos', 'aucun', '—', '—', '—'],
                ]}
              />

              <p>
                Ces chiffres sont des proportions à approcher, pas des valeurs
                exactes&nbsp;: un 4-3-6 fait le travail d’un 3-1-3. En croissance,
                l’azote et le potassium dominent. En floraison, l’azote passe
                derrière le phosphore et le potassium.
              </p>
              <p>
                La dose est celle de l’étiquette. Commencez toujours plus bas,
                montez si le plant le demande, et arrosez à l’eau claire entre
                deux apports.
              </p>

              <h5 className="topic__sub">Des références</h5>
              <p>
                Trois gammes liquides courantes, à diluer dans l’eau
                d’arrosage.
              </p>
              <Table
                label="Engrais de référence"
                head={['Gamme', 'Type', 'Croissance', 'Floraison', 'Dose']}
                rows={[
                  ['Chilli Focus', 'minéral', 'Chilli Focus, 3-1-4,4', 'le même flacon', '5\u00a0ml/L'],
                  ['Plagron Terra', 'minéral', 'Terra Grow, 3-1-3', 'Terra Bloom, 2-2-4', '5\u00a0ml/L'],
                  ['BioBizz', 'organique', 'Bio-Grow, 4-3-6', 'Bio-Bloom, 2-7-4', '2 à 4\u00a0ml/L'],
                ]}
              />
              <p className="caption">
                NPK et doses relevés chez les fabricants et les revendeurs en
                septembre 2026. L’étiquette du flacon fait foi.
              </p>
              <p>
                Chilli Focus, formulé pour le piment, est le plus simple pour
                débuter&nbsp;: le même flacon sert du repiquage à la récolte. Les
                gammes en deux flacons collent de plus près aux besoins de
                chaque phase. À défaut, un engrais liquide «&nbsp;tomates&nbsp;» de
                jardinerie convient en floraison&nbsp;: les formules varient d’une
                gamme à l’autre, vérifiez que le potassium est le plus grand
                des trois chiffres.
              </p>

              <p>
                Le magnésium manque souvent en pot&nbsp;: les vieilles feuilles
                jaunissent entre des nervures restées vertes. Un gramme de sel
                d’Epsom par litre d’eau, une fois par mois, suffit. Le calcium
                vient de l’eau du robinet si elle est calcaire&nbsp;; avec une eau
                douce ou filtrée, prenez un engrais qui en contient.
              </p>

              <h5 className="topic__sub">Lire le plant</h5>
              <ul>
                <li>
                  <strong>Trop d’azote&nbsp;:</strong> feuillage sombre et
                  luxuriant, peu de fleurs, fleurs qui tombent.
                </li>
                <li>
                  <strong>Trop d’engrais&nbsp;:</strong> pointes des feuilles
                  brûlées, croûte blanche sur le terreau. Rincez le pot avec
                  deux à trois fois son volume d’eau claire, puis reprenez à
                  demi-dose.
                </li>
                <li>
                  <strong>Pas assez&nbsp;:</strong> feuilles du bas qui jaunissent
                  uniformément, croissance à l’arrêt.
                </li>
              </ul>
              <p>
                Minéral ou organique, les deux fonctionnent. En intérieur, les
                engrais organiques sentent parfois et attirent les
                moucherons&nbsp;; les minéraux agissent plus vite et se dosent plus
                précisément.
              </p>
            </Topic>

            <Topic id="tailles" title="Tailles">
              <p>
                Aucune taille n’est obligatoire&nbsp;: un piment produit sans qu’on
                y touche. Mais sous une lampe fixe, un plant large et bas
                reçoit plus de lumière qu’un plant haut, et un plant aéré tombe
                moins malade.
              </p>

              <figure className="panel figure">
                <div className="stages stages--wide">
                  <div className="stage">
                    <ToppingFigure />
                    <p className="stage__label">Étêtage</p>
                    <p className="stage__note">
                      À 8 ou 10 feuilles, coupez la tête juste au-dessus de la
                      cinquième ou sixième. Des branches partent des
                      aisselles&nbsp;: le plant sera plus trapu, la récolte recule
                      de deux semaines.
                    </p>
                  </div>
                  <div className="stage">
                    <CleaningFigure />
                    <p className="stage__label">Entretien</p>
                    <p className="stage__note">
                      Sous la fourche, retirez les feuilles qui touchent le
                      terreau et les pousses restées à l’ombre. Supprimez la
                      première fleur tant que le plant n’est pas établi.
                    </p>
                  </div>
                  <div className="stage">
                    <CutbackFigure />
                    <p className="stage__label">Taille de repos</p>
                    <p className="stage__note">
                      Après la récolte, rabattez chaque branche à deux ou trois
                      nœuds au-dessus de la fourche. Le plant repart de ces
                      nœuds.
                    </p>
                  </div>
                </div>
                <figcaption className="figure__caption">
                  En rouge, ce qu’on coupe. En grisé, ce qui disparaît.
                </figcaption>
              </figure>

              <ul>
                <li>
                  Coupez 5&nbsp;mm au-dessus d’un nœud, avec une lame propre passée
                  à l’alcool entre deux plants&nbsp;: les virus voyagent sur les
                  outils.
                </li>
                <li>
                  Ne retirez jamais plus d’un tiers du feuillage d’un plant en
                  pleine végétation, et ne taillez pas un plant déjà mal en
                  point.
                </li>
                <li>
                  Pendant la fructification, ôtez quelques feuilles au cœur du
                  plant pour que l’air et la lumière y passent.
                </li>
                <li>
                  Les chinense se ramifient seuls et se passent souvent
                  d’étêtage.
                </li>
              </ul>
            </Topic>
          </section>

          <section className="chapter">
            <h3 className="chapter__title">Au besoin</h3>

            <Topic id="problemes" title="Quand ça va mal">
              <p>
                Regardez le dessous des feuilles chaque semaine et isolez toute
                plante qui arrive de l’extérieur&nbsp;: en intérieur, aucun
                prédateur ne viendra vous aider.
              </p>

              <dl className="troubles">
                <div>
                  <dt>Feuilles du bas qui jaunissent</dt>
                  <dd>
                    Manque d’azote si le plant est pâle partout, excès d’eau si
                    le pot reste lourd. Quelques vieilles feuilles qui tombent
                    sur un plant vigoureux sont normales.
                  </dd>
                </div>
                <div>
                  <dt>Jaune entre les nervures</dt>
                  <dd>
                    Sur les vieilles feuilles, c’est le magnésium. Sur les
                    jeunes, le fer, bloqué par une eau trop calcaire&nbsp;: ramenez
                    le pH de l’eau d’arrosage vers 6,5 avec un correcteur ou
                    quelques gouttes de vinaigre blanc.
                  </dd>
                </div>
                <div>
                  <dt>Feuilles du haut repliées ou blanchies</dt>
                  <dd>Lampe trop proche. Remontez-la de 10&nbsp;cm.</dd>
                </div>
                <div>
                  <dt>Cloques liégeuses sous les feuilles</dt>
                  <dd>
                    Œdème&nbsp;: le plant absorbe plus d’eau qu’il n’en transpire.
                    Espacez les arrosages et ventilez. Sans gravité.
                  </dd>
                </div>
                <div>
                  <dt>Fleurs qui tombent</dt>
                  <dd>
                    Chaleur, nuit froide, excès d’azote, à-coups d’arrosage ou
                    pollinisation manquée&nbsp;: voir{' '}
                    <a href="#floraison">Floraison</a>.
                  </dd>
                </div>
                <div>
                  <dt>Tache brune et sèche au bout du fruit</dt>
                  <dd>
                    Nécrose apicale&nbsp;: le calcium n’arrive pas jusqu’au fruit,
                    presque toujours à cause d’arrosages irréguliers.
                    Régularisez et retirez les fruits touchés.
                  </dd>
                </div>
                <div>
                  <dt>Stries beiges sur les jalapeños</dt>
                  <dd>
                    Un liège naturel, signe de maturité. Ce n’est pas une
                    maladie.
                  </dd>
                </div>
                <div>
                  <dt>Moucherons noirs autour du pot</dt>
                  <dd>
                    Sciarides&nbsp;: leurs larves vivent dans le terreau humide.
                    Laissez sécher la surface et posez des pièges jaunes
                    englués. En cas d’invasion, des nématodes Steinernema
                    feltiae dans l’eau d’arrosage.
                  </dd>
                </div>
                <div>
                  <dt>Colonies d’insectes sur les jeunes pousses</dt>
                  <dd>
                    Pucerons. Douchez le plant, puis pulvérisez du savon noir
                    dilué, une cuillère à soupe par litre, lampe éteinte et en
                    insistant sous les feuilles. Trois passages à cinq jours
                    d’intervalle.
                  </dd>
                </div>
                <div>
                  <dt>Feuilles piquetées de points clairs, fines toiles</dt>
                  <dd>
                    Acariens, favorisés par l’air sec. Douchez le dessous des
                    feuilles et remontez l’humidité. Les acariens prédateurs
                    Phytoseiulus persimilis viennent à bout d’une attaque
                    installée.
                  </dd>
                </div>
                <div>
                  <dt>Feuilles déformées, traînées argentées</dt>
                  <dd>
                    Thrips. Pièges bleus englués, savon noir, acariens
                    prédateurs Amblyseius cucumeris.
                  </dd>
                </div>
                <div>
                  <dt>Petites mouches blanches qui s’envolent</dt>
                  <dd>
                    Aleurodes. Pièges jaunes et savon noir sous les feuilles,
                    tôt et souvent.
                  </dd>
                </div>
              </dl>
            </Topic>

            <Topic id="memo" title="Mémo par phase">
              <Table
                label="Mémo des réglages par phase"
                head={['Phase', 'Lumière', 'Lampe', 'Arrosage', 'Engrais', 'À faire']}
                rows={[
                  ['Semis', '14 à 16\u00a0h', '50 à 60\u00a0cm', 'par le bas', 'aucun', 'chaleur, couvercle, puis aération'],
                  ['Repiquage', '14 à 16\u00a0h', '50\u00a0cm', 'léger', 'NPK 3-1-3, un quart de dose après deux semaines', 'enterrer jusqu’aux cotylédons'],
                  ['Pot final', '14 à 16\u00a0h', '50 puis 40\u00a0cm', 'à fond, puis attendre', 'NPK 3-1-3, reprise après deux semaines', 'ôter les premiers boutons'],
                  ['Croissance', '14 à 16\u00a0h', '40 à 50\u00a0cm', 'à fond, puis attendre', 'NPK 3-1-3', 'étêter, tuteurer, tourner les pots'],
                  ['Floraison', '12 à 14\u00a0h', '30 à 40\u00a0cm', 'régulier', 'NPK 2-2-4', 'polliniser chaque jour'],
                  ['Fruits', '12 à 14\u00a0h', '30 à 40\u00a0cm', 'régulier, plus fréquent', 'NPK 2-2-4', 'récolter souvent'],
                  ['Repos', '8 à 10\u00a0h', '60\u00a0cm et plus', 'très peu', 'aucun', 'rabattre, inspecter'],
                  ['Relance', '14 à 16\u00a0h', '40 à 50\u00a0cm', 'reprise progressive', 'NPK 3-1-3', 'rempoter, tailler les racines'],
                ]}
              />
            </Topic>
          </section>
        </div>
      </div>
    </main>
  )
}
