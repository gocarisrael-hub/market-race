// The game being built, as the progress of the order: the market map in pencil until the colour is
// picked, then painted in the palette; the route drawn stop by stop, a tasting popping in at every
// stage passed; the name on the ribbon once it is written; the photos taped on as they arrive.
// Two sizes: a strip at the top of the stage on phones and tablets, a large panel beside the form
// on computers (with the occasion's doodles and the price).
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type DoodleName, Doodles, Icon } from '../../shared/decor.tsx'
import { loadThemeFont, lookVars } from '../../shared/look.ts'
import type { Photo, Shop } from '../api.ts'
import { copy } from '../copy.ts'
import {
  currentPalette,
  type Draft,
  decorFor,
  formatShekels,
  orderableThemes,
  priceAgorot,
  routeForTheme,
} from '../logic.ts'
import { type Stage, type StageKey, stopFractions } from '../stages.ts'
import { Ring, Underline } from '../ui.tsx'

/** A winding walk through the market: right to left (Hebrew reading order), three rows on the
 * panel, one wave on the strip. */
const ROUTES = {
  side: {
    w: 400,
    h: 300,
    d: 'M366 52 C 318 22, 270 78, 214 58 S 118 26, 64 62 C 22 92, 40 146, 112 146 S 254 124, 322 156 C 384 186, 366 246, 292 250 S 148 228, 36 252',
  },
  strip: {
    w: 400,
    h: 120,
    d: 'M378 84 C 356 60, 330 62, 306 82 S 254 108, 224 88 S 172 62, 142 80 S 90 108, 62 88 S 32 66, 22 80',
  },
}

/** Each stage's own doodle, shown at the stop where the build stands. */
const STAGE_ICON: Record<StageKey, DoodleName> = {
  occasion: 'gift',
  for: 'heart',
  name: 'pencil',
  look: 'palette',
  questions: 'question',
  photos: 'camera',
  notes: 'loveLetter',
  hints: 'key',
  people: 'people',
  diet: 'plate',
  details: 'ticket',
  pay: 'flag',
}

/** Food illustrations for the stops passed, when the route has none of its own. */
const FOOD = ['fruit', 'hummus', 'falafel', 'coffee', 'spices', 'tomatoes', 'flowers'].map(
  (n) => `/static/icons/${n}.png`,
)

const SIDE_SPOTS = [
  { top: -22, right: '6%', size: 56, rot: 12 },
  { top: '34%', left: -36, size: 48, rot: -10 },
  { top: '58%', right: -30, size: 44, rot: 8 },
]

const RIBBON_MAIN = 'M34 12 Q165 -4 296 12 L296 72 Q165 56 34 72 Z'
const RIBBON_TAIL_R = 'M8 26 L40 20 L34 46 L40 72 L8 66 L20 46 Z'
const RIBBON_TAIL_L = 'M322 26 L290 20 L296 46 L290 72 L322 66 L310 46 Z'

export function BuildMap(props: {
  shop: Shop
  draft: Draft
  stages: Stage[]
  index: number
  photos: Photo[]
  variant: 'strip' | 'side'
}) {
  const { shop, draft: d, stages, index, photos, variant } = props
  const route = ROUTES[variant]
  const pathRef = useRef<SVGPathElement>(null)
  const [points, setPoints] = useState<{ x: number; y: number }[]>([])
  const n = stages.length

  // The stops sit evenly along the drawn route.
  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path?.getTotalLength) return
    const len = path.getTotalLength()
    setPoints(
      stopFractions(n).map((f) => {
        const p = path.getPointAtLength(f * len)
        return { x: p.x, y: p.y }
      }),
    )
  }, [n])

  const themes = orderableThemes(shop)
  const theme = themes.find((t) => t.id === d.themeId) ?? themes[0]
  const pal = currentPalette(shop, d)
  const palette = pal?.palette ?? theme?.palette
  const at = (key: StageKey) => stages.findIndex((s) => s.key === key)
  // The colour paints the map from the look stage on; the name joins the ribbon once asked for.
  const painted = index >= at('look') && !!palette
  const name = index >= at('name') ? d.honoreeName.trim() : ''
  const ribbonShown = index >= at('name')
  const decor = index > 0 ? decorFor(shop, d.occasionKey) : null
  const food = (routeForTheme(shop, theme?.id)?.tastings ?? []).map((t) => t.icon).filter(Boolean) as string[]
  const icons = food.length ? food : FOOD
  const frac = n > 1 ? index / (n - 1) : 0
  const current = stages[index]

  // The chosen style paints the map: its colors (a chosen variant drops its fixed ones), font and
  // treatment, as the game will draw them.
  const look = pal ? { ...theme?.style, colors: undefined } : theme?.style
  const style = (painted && palette ? lookVars(palette, look, 'bm') : {}) as CSSProperties
  useEffect(() => {
    if (painted) loadThemeFont(look)
  }, [painted, look])

  const total = priceAgorot(shop, d.occasionKey, d.people)
  const per = d.occasionKey ? shop.prices[d.occasionKey] : undefined
  const shownPhotos = photos.slice(0, variant === 'side' ? 3 : 2)

  const map = (
    <div
      className={`build-map ${variant}`}
      data-testid="build-map"
      data-painted={painted || undefined}
      data-treat={painted ? (look?.treatment ?? 'brush') : undefined}
      data-stage={current?.key}
      style={style}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={index + 1}
      aria-valuetext={copy.build.progress(index + 1, n, copy.build.names[current?.key ?? 'occasion'])}
    >
      {variant === 'side' && decor && (
        <Doodles key={decor} className="bm-doodles" decor={decor} spots={SIDE_SPOTS} />
      )}
      <div className="bm-paper" style={{ aspectRatio: `${route.w} / ${route.h}` }}>
        {theme?.map && <img className="bm-img" src={theme.map} alt="" decoding="async" />}
        {painted && pal?.palette.mapTint && (
          <span className="map-tint" style={{ background: pal.palette.mapTint }} />
        )}
        <svg className="bm-route" viewBox={`0 0 ${route.w} ${route.h}`} aria-hidden="true">
          <path ref={pathRef} className="bm-pencil" d={route.d} />
          <path className="bm-ink" d={route.d} pathLength={1} style={{ strokeDashoffset: 1 - frac }} />
        </svg>
        {points.map((p, i) => {
          const state = i < index ? 'done' : i === index ? 'now' : 'later'
          const last = i === n - 1
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
              key={i}
              className={`bm-stop ${state}${last ? ' finish' : ''}`}
              style={{ left: `${(p.x / route.w) * 100}%`, top: `${(p.y / route.h) * 100}%` }}
              aria-hidden="true"
            >
              {state === 'done' && (
                <img key="food" className="bm-food" src={icons[i % icons.length]} alt="" />
              )}
              {state === 'now' && (
                <>
                  <Icon name={STAGE_ICON[stages[i].key]} size={variant === 'side' ? 30 : 20} />
                  <Ring />
                </>
              )}
              {state === 'later' && last && <Icon name="flag" size={variant === 'side' ? 26 : 18} />}
            </span>
          )
        })}
      </div>
      {shownPhotos.length > 0 && (
        <span className="bm-photos">
          {shownPhotos.map((p, i) => (
            <span className="bm-photo" key={p.id} style={{ ['--r' as string]: `${[-8, 6, -3][i]}deg` }}>
              <span className="washi" aria-hidden="true" />
              <img src={p.previewUrl} alt={copy.build.photoAlt(i + 1)} />
            </span>
          ))}
        </span>
      )}
      {ribbonShown && (
        <div className="bm-ribbon" data-testid="build-ribbon">
          <svg viewBox="0 0 330 92" preserveAspectRatio="none" aria-hidden="true">
            <path className="tail" d={RIBBON_TAIL_R} />
            <path className="tail" d={RIBBON_TAIL_L} />
            <path className="main" d={RIBBON_MAIN} />
          </svg>
          <span key={name ? 'name' : 'empty'} className={name ? 'named' : 'empty'}>
            {name ? copy.build.ribbon(name) : copy.build.ribbonEmpty}
          </span>
        </div>
      )}
    </div>
  )

  if (variant === 'strip') return map
  return (
    <aside className="order-side build-side">
      {map}
      {painted && theme && <p className="side-caption">{pal ? `${theme.name} · ${pal.name}` : theme.name}</p>}
      {total !== null && per && (
        <section className="section price" aria-live="polite" data-testid="price">
          <span className="hint">{copy.home.total}</span>
          <span className="total">
            {formatShekels(total)}
            <Underline />
          </span>
          {per.perPerson > 0 && (
            <span className="hint">
              {index >= at('people')
                ? `${copy.peopleCount(d.people)} · ${copy.home.perPerson(formatShekels(per.perPerson))}`
                : copy.home.perPerson(formatShekels(per.perPerson))}
            </span>
          )}
        </section>
      )}
    </aside>
  )
}
