// The desk behind the page on tablets and computers (desk.css, from 768px): the market map,
// faded, with the occasion's doodles scattered across the wide margins. On phones it is hidden
// and the map is never downloaded (it is a CSS background set only inside the media query).
import type { CSSProperties } from 'react'
import { Doodles, type Spot } from './decor.tsx'

// Down both margins. Horizontal places are fractions of the margin's width (the window less the
// sheet, halved), so the doodles stay off the page at every width.
const inMargin = (f: number) => `calc((50% - var(--sheet-w) / 2) * ${f})`
export const DESK_SPOTS: Spot[] = [
  { top: '9%', right: inMargin(0.32), size: 78, rot: 10 },
  { top: '14%', left: inMargin(0.22), size: 64, rot: -12 },
  { top: '36%', right: inMargin(0.18), size: 60, rot: -8 },
  { top: '44%', left: inMargin(0.42), size: 84, rot: 14 },
  { top: '63%', right: inMargin(0.46), size: 70, rot: 6 },
  { top: '70%', left: inMargin(0.16), size: 58, rot: -10 },
  { top: '86%', right: inMargin(0.24), size: 62, rot: -14 },
  { top: '88%', left: inMargin(0.5), size: 66, rot: 8 },
]

export function Desk({ map, decor }: { map?: string | null; decor?: string | null }) {
  const style = map ? ({ '--desk-map': `url("${map}")` } as CSSProperties) : undefined
  return (
    <div className="desk" aria-hidden="true" data-testid="desk" style={style}>
      {map && <div className="desk-map" />}
      <div className="desk-wash" />
      <Doodles key={decor ?? 'generic'} className="desk-doodles" decor={decor} spots={DESK_SPOTS} />
    </div>
  )
}
