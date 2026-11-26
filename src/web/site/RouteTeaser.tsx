// The landing page's hero: the illustrated market map, blurred, with the tasting route drawn on it.
// The stops are numbered, each with its food illustration; the stalls and the stop details stay a
// mystery. Hovering (or tapping) a stop reveals only its teaser line, from the route's tastings in
// the DB ("משהו מטוגן ופריך"). Never a stall name or location: the API never sends them, and the
// stops sit evenly along a drawn path, not where the stalls are.
import { type CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../shared/decor.tsx'
import type { Shop } from './api.ts'
import { copy } from './copy.ts'
import { listedStops, routeForTheme } from './logic.ts'
import { Arrow } from './ui.tsx'

/** A winding walk across the map, right to left (Hebrew reading order), in a 100 × 92 box. */
const W = 100
const H = 92
const PATH =
  'M86 13 C 74 4, 60 19, 47 14 S 16 9, 14 27 C 12 43, 33 47, 50 44 S 87 40, 86 58 C 85 74, 62 70, 47 73 S 20 82, 13 79'

/** Food illustrations for stops whose tasting has no icon of its own. */
const FOOD = ['fruit', 'hummus', 'falafel', 'coffee', 'spices', 'tomatoes', 'flowers'].map(
  (n) => `/static/icons/${n}.png`,
)

/** Where along the path each of n stops sits (a little in from both ends). */
export const stopAt = (n: number) =>
  n <= 1 ? [0.5] : Array.from({ length: n }, (_, i) => 0.04 + (0.92 * i) / (n - 1))

export function RouteTeaser({
  shop,
  themeId,
  className,
}: {
  shop: Shop
  themeId: number | null
  className?: string
}) {
  const c = copy.landing.route
  const theme = shop.themes.find((t) => t.id === themeId)
  const stops = listedStops(routeForTheme(shop, themeId))
  const n = stops.length
  const pathRef = useRef<SVGPathElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const [points, setPoints] = useState<{ x: number; y: number }[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)
  const hover = useHover()
  const ids = useId()

  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path?.getTotalLength) return
    const len = path.getTotalLength()
    setPoints(
      stopAt(n).map((f) => {
        const p = path.getPointAtLength(f * len)
        return { x: p.x, y: p.y }
      }),
    )
  }, [n])

  // A tap outside the map closes the open stop.
  useEffect(() => {
    if (open === null) return
    const away = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  if (!theme?.map) return null
  return (
    <figure
      ref={rootRef}
      className={`rt ${className ?? ''}`}
      data-testid="route-teaser"
      aria-labelledby={`${ids}-cap`}
    >
      <div className="rt-paper" style={{ aspectRatio: `${W} / ${H}` }}>
        <img className="rt-map" src={theme.map} alt="" decoding="async" fetchPriority="high" />
        <span className="rt-fog" aria-hidden="true" />
        <svg className="rt-route" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {/* The route draws itself in: a mask stroke grows along the dashed line. */}
          <mask id={`${ids}-draw`} maskUnits="userSpaceOnUse" x="-10" y="-10" width={W + 20} height={H + 20}>
            <path className="rt-reveal" d={PATH} pathLength={1} />
          </mask>
          <g mask={`url(#${ids}-draw)`}>
            <path className="rt-glow" d={PATH} />
            <path ref={pathRef} className="rt-line" d={PATH} pathLength={1} />
          </g>
        </svg>
        <ol className="rt-stops" aria-label={c.label}>
          {points.map((p, i) => {
            const s = stops[i]
            const isOpen = open === i
            const fx = p.x / W
            const fy = p.y / H
            const style = {
              left: `${fx * 100}%`,
              top: `${fy * 100}%`,
              // Labels lean inward near the edges, and sit above the stop near the bottom.
              '--tx': fx < 0.25 ? '-18%' : fx > 0.75 ? '-82%' : '-50%',
              '--d': `${0.5 + i * 0.16}s`,
            } as CSSProperties
            const tagId = `${ids}-t${i}`
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
                key={i}
                className={`rt-stop${isOpen ? ' open' : ''}${fy > 0.7 ? ' up' : ''}${s.finale ? ' finale' : ''}${
                  i === 0 && !touched ? ' cue' : ''
                }`}
                style={style}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={tagId}
                  onClick={() => {
                    setTouched(true)
                    setOpen(isOpen ? null : i)
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== 'mouse') return
                    setTouched(true)
                    setOpen(i)
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse') setOpen((o) => (o === i ? null : o))
                  }}
                >
                  <img className="rt-food" src={s.icon || FOOD[i % FOOD.length]} alt="" />
                  <span className="rt-no">{i + 1}</span>
                  <span className="sr-only">
                    {s.finale ? `${c.stop(i + 1)}, ${c.finale}` : c.stop(i + 1)}
                  </span>
                </button>
                <span className="rt-tag" id={tagId} aria-live="polite">
                  {isOpen ? (
                    <span className="rt-teaser" data-testid="route-teaser-line">
                      {s.finale && <strong>{c.finale}: </strong>}
                      {s.teaser || c.fallback}
                    </span>
                  ) : (
                    <Scribble seed={i} />
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      <figcaption id={`${ids}-cap`} className="rt-cap">
        <span className="rt-note">
          <Arrow />
          <span>
            {c.label}
            <br />
            <em>{c.note}</em>
          </span>
        </span>
        <span className="rt-hint">
          <Icon name="sparkle" size={18} />
          {hover ? c.hintHover : c.hintTouch}
        </span>
      </figcaption>
    </figure>
  )
}

/** A line of blurred handwriting: the stop's details, kept a mystery. */
function Scribble({ seed }: { seed: number }) {
  const w = [46, 58, 40, 52, 36, 50][seed % 6]
  return (
    <svg className="rt-scribble" viewBox="0 0 60 14" style={{ width: w }} aria-hidden="true">
      <path d={`M2 8 C 8 2, 12 12, 18 7 S 28 3, 32 8 S ${w - 8} 12, ${Math.min(58, w + 4)} 6`} />
      <path d="M4 12 C 14 10, 24 13, 34 11" />
    </svg>
  )
}

/** Whether the main pointer can hover (a computer): the hint says hover, else tap. */
function useHover() {
  const [hover, setHover] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.('(hover: hover) and (pointer: fine)')
    if (!mq) return
    setHover(mq.matches)
    const on = () => setHover(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return hover
}
