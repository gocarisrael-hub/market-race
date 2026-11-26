// Hand-drawn doodles per occasion (birthday, kids, love, anniversary, family, friends, company,
// generic), shared by
// the site and the player. Inline SVG strokes in two colors taken from CSS variables:
// --decor-ink (lines) and --decor-accent (color and light fills). A shared turbulence filter
// makes the strokes slightly wobbly, like a pen on paper.
import type { CSSProperties, ReactNode } from 'react'
import type { Decor } from '../../server/domain/types.ts'
import { MORE_DRAWINGS, type MoreDoodle } from './drawings.tsx'

type BaseDoodle =
  | 'balloons'
  | 'cake'
  | 'partyHat'
  | 'confetti'
  | 'heart'
  | 'ring'
  | 'lips'
  | 'flower'
  | 'house'
  | 'family'
  | 'highFive'
  | 'flag'
  | 'star'
  | 'briefcase'
  | 'rocket'
  | 'coffee'
  | 'sparkle'

export type DoodleName = BaseDoodle | MoreDoodle

/** The doodles of each set, in the order screens place them. */
export const DECOR_SETS: Record<Decor, DoodleName[]> = {
  birthday: [
    'balloons',
    'cake',
    'partyHat',
    'confetti',
    'gift',
    'cupcake',
    'garland',
    'partyHorn',
    'star',
    'crown',
    'sparkle',
  ],
  kids: [
    'balloons',
    'cake',
    'crown',
    'star',
    'partyHat',
    'gift',
    'cupcake',
    'kite',
    'confetti',
    'dice',
    'sparkle',
  ],
  love: [
    'heart',
    'ring',
    'lips',
    'flower',
    'loveLetter',
    'twoHearts',
    'toast',
    'heartArrow',
    'moon',
    'sparkle',
  ],
  anniversary: [
    'ring',
    'twoHearts',
    'toast',
    'heart',
    'loveLetter',
    'flower',
    'heartArrow',
    'frame',
    'moon',
    'sparkle',
  ],
  family: ['house', 'family', 'heart', 'flower', 'tree', 'sun', 'kite', 'basket', 'frame', 'coffee'],
  friends: [
    'highFive',
    'flag',
    'star',
    'sparkle',
    'toast',
    'music',
    'sunglasses',
    'ticket',
    'camera',
    'pizza',
    'cocktail',
  ],
  company: [
    'briefcase',
    'rocket',
    'coffee',
    'star',
    'trophy',
    'bulb',
    'target',
    'chart',
    'flagStart',
    'sparkle',
  ],
  generic: [
    'star',
    'sparkle',
    'confetti',
    'sun',
    'flag',
    'music',
    'kite',
    'crown',
    'ticket',
    'gift',
    'basket',
  ],
}

export const decorSet = (d: string | null | undefined): DoodleName[] =>
  DECOR_SETS[(d ?? 'generic') as Decor] ?? DECOR_SETS.generic

// i: ink line, a: accent line, f: accent shape (light fill, ink outline), d: accent dot (solid).
const I = (d: string) => <path className="i" d={d} />
const A = (d: string) => <path className="a" d={d} />
const F = (d: string) => <path className="f" d={d} />
const D = (cx: number, cy: number, r = 2) => <circle className="d" cx={cx} cy={cy} r={r} />

const HEART =
  'M32 54 C 18 45, 8 35, 10 23 C 12 13, 25 10, 32 21 C 39 10, 52 13, 54 23 C 56 35, 46 45, 32 54 Z'
const HAND =
  'M18 58 L 19 38 C 16 33, 11 26, 9 21 C 8 17, 12 16, 14 19 L 19 27 L 19 11 C 19 7, 24 7, 24 11 L 24 25 L 25 8 C 25 4, 30 4, 30 8 L 30 25 L 32 12 C 32 8, 37 9, 36 13 L 35 31 C 35 42, 32 50, 31 58'
const STAR = 'M32 7 L 38 24 L 56 25 L 42 36 L 47 54 L 32 44 L 17 54 L 22 36 L 8 25 L 26 24 Z'

const BASE_DRAWINGS: Record<BaseDoodle, ReactNode> = {
  balloons: (
    <>
      {F('M24 8 C 14 8, 10 18, 12 26 C 14 33, 20 38, 24 38 C 29 38, 35 32, 36 24 C 37 15, 32 8, 24 8 Z')}
      {I('M22 38 L 24 41.5 L 26.5 38')}
      {I('M24 41 C 19 47, 28 51, 22 59')}
      {F('M45 15 C 38 15, 35 21, 36 27 C 37 32, 41 35, 44 35 C 48 35, 52 31, 53 26 C 54 19, 50 15, 45 15 Z')}
      {I('M43 35 L 44.5 38 L 46.5 35')}
      {I('M44.5 38 C 48 44, 40 49, 45 57')}
      {A('M18 15 C 16 18, 15.5 21, 16.5 24')}
    </>
  ),
  cake: (
    <>
      {F('M12 40 C 20 38, 44 38, 52 40 L 51 55 C 40 57.5, 24 57.5, 13 55 Z')}
      {A(
        'M12.5 45 C 16 49, 19 43, 22.5 47 C 26 51, 28 43, 32 47 C 36 51, 39 43, 43 47 C 46.5 50, 49 44, 51.5 45',
      )}
      {I('M22 38.5 L 22.5 28 M32 38 L 31.5 26 M42 38.5 L 42 28')}
      {A('M22.4 24.5 C 19.5 21.5, 22 18.5, 22.6 17 C 23.6 19.5, 25.6 21.8, 22.4 24.5 Z')}
      {A('M31.6 22.5 C 28.7 19.5, 31.2 16.5, 31.8 15 C 32.8 17.5, 34.8 19.8, 31.6 22.5 Z')}
      {A('M42 24.5 C 39.1 21.5, 41.6 18.5, 42.2 17 C 43.2 19.5, 45.2 21.8, 42 24.5 Z')}
      {I('M7 57.5 C 22 61, 42 61, 57 57')}
    </>
  ),
  partyHat: (
    <>
      {F('M32 10 L 48 53 C 38 56, 26 56, 16 53 Z')}
      {I('M25.5 26 C 29.5 28, 35 28, 38.5 25.5 M20.5 40 C 28 43, 37 43, 44 39.5')}
      {D(32, 7, 3.6)}
      {D(28, 34, 1.6)}
      {D(37, 33, 1.6)}
      {D(30, 48, 1.6)}
      {A('M50 18 L 55 14 M52 26 L 58 26 M46 11 L 48 5')}
    </>
  ),
  confetti: (
    <>
      {A('M8 14 c 3 -4 5 3 8 -1 s 5 3 8 -1')}
      {I('M38 10 l 7 2 l -2 6 l -7 -2 z')}
      {D(52, 22, 2.4)}
      {A('M14 34 l 6 -6 M17 37 l 6 -6')}
      {F('M34 30 l 9 -2 l -3 8 z')}
      {D(26, 48, 2.2)}
      {A('M40 50 c 3 -4 5 3 8 -1 s 5 3 8 -1')}
      {I('M10 52 l 5 5 M15 52 l -5 5')}
      {D(50, 38, 1.8)}
    </>
  ),
  heart: (
    <>
      {F(HEART)}
      {I('M15 22 C 15.5 17, 20 15, 24 16.5')}
      {A('M48 8 L 51 4 M53 12 L 58 11')}
    </>
  ),
  ring: (
    <>
      {I(
        'M32 25 C 20 24.5, 15 32, 16.5 39.5 C 18 47, 26 51, 33 50.5 C 41 50, 48 44, 47.5 37 C 47 30, 41 25, 32 25 Z',
      )}
      {I(
        'M32 29.5 C 24 29, 21 34, 21.8 39 C 22.6 44, 27 46.5, 32.5 46.2 C 38 46, 43 42, 42.6 37.5 C 42.2 33, 38 29.6, 32 29.5',
      )}
      {F('M25.5 17.5 L 29 11 L 35 11 L 38.5 17.5 L 32 25 Z')}
      {I('M25.5 17.5 L 38.5 17.5')}
      {A('M44 9 L 47 5.5 M46.5 15 L 51.5 14 M18 10 L 15 7')}
    </>
  ),
  lips: (
    <>
      {F('M9 32 C 15 23.5, 24 21.5, 32 27.5 C 40 21.5, 49 23.5, 55 32 C 46 46.5, 18 46.5, 9 32 Z')}
      {I('M11 32 C 21 35.5, 43 35.5, 53 32')}
      {A('M47 12 C 49 9, 53 10, 52 13.5 C 55 13, 56 17, 52 18.5 L 49 19.5 C 47.5 17, 45.5 14.5, 47 12 Z')}
    </>
  ),
  flower: (
    <>
      {[0, 72, 144, 216, 288].map((r) => (
        <path
          key={r}
          className="f"
          d="M32 26 C 25.5 17, 28.5 9, 32 9 C 35.5 9, 38.5 17, 32 26 Z"
          transform={`rotate(${r} 32 26)`}
        />
      ))}
      {D(32, 26, 3.8)}
      {I('M32 31 C 30.5 41, 33.5 49, 31.5 60')}
      {I('M32 50 C 37 43, 44 43.5, 47 45.5 C 43.5 50.5, 37 51.5, 32 50 Z')}
    </>
  ),
  house: (
    <>
      {I('M10 31 L 32 12 L 54 31')}
      {F('M16 27 L 16.5 54 L 48 54.5 L 47.5 27 L 32 14 Z')}
      {I('M27.5 54 L 27.5 42 C 27.5 37.5, 36.5 37.5, 36.5 42 L 36.5 54')}
      {I('M20 33.5 L 27 33 L 27.2 39.8 L 20.3 40 Z')}
      {I('M40 21 L 40 11.5 L 45 11.5 L 45 25')}
      {A('M44 7.5 C 45 5.5, 47.5 6, 47 8 C 49 7.5, 50 10, 48 11 L 46 12 C 45 10.5, 43.5 9, 44 7.5 Z')}
      {I('M6 55 C 24 56.5, 40 56.5, 58 55')}
    </>
  ),
  family: (
    <>
      {I(
        'M17.5 9.5 C 14 9.5, 12.5 12.5, 13 15 C 13.5 18, 16 19.5, 18.5 19 C 21.5 18.5, 23 16, 22.5 13.5 C 22 11, 20 9.5, 17.5 9.5 Z',
      )}
      {F('M18 21 C 12.5 28, 11.5 35, 11 41 L 25 41 C 24.5 35, 23.5 28, 18 21 Z')}
      {I('M15 41 L 14.5 53 M21 41 L 21.5 53')}
      {I(
        'M46.5 9.5 C 43 9.5, 41.5 12.5, 42 15 C 42.5 18, 45 19.5, 47.5 19 C 50.5 18.5, 52 16, 51.5 13.5 C 51 11, 49 9.5, 46.5 9.5 Z',
      )}
      {I('M46.5 20 L 46.5 39 M46.5 39 L 42 53 M46.5 39 L 51 53 M46.5 26 L 53.5 33')}
      {I(
        'M32 27 C 29.5 27, 28.5 29, 28.8 31 C 29 33, 30.8 34, 32.5 33.8 C 34.5 33.5, 35.5 31.5, 35.2 30 C 35 28.2, 33.6 27, 32 27 Z',
      )}
      {I('M32 34 L 32 44 M32 44 L 28.5 53 M32 44 L 35.5 53')}
      {A('M23 31 C 26 35, 28.5 37, 32 37.5 C 35.5 37, 38.5 34, 46.5 26')}
    </>
  ),
  highFive: (
    <>
      <path className="f" d={HAND} transform="rotate(-14 20 40) translate(-2 2)" />
      <path
        className="f"
        d={HAND}
        transform="translate(64 0) scale(-1 1) rotate(-14 20 40) translate(-2 2)"
      />
      {A('M32 2 L 32 -3 M24 4 L 21 0 M40 4 L 43 0')}
    </>
  ),
  flag: (
    <>
      {I('M16 59 L 16.5 7')}
      {F('M16.5 10 C 26 5.5, 34 16, 50 10 L 45.5 21.5 L 50 32.5 C 36 38, 26 28, 16.5 32.5 Z')}
      {D(16.5, 6, 2.6)}
      {I('M9 59.5 C 16 58, 22 58.5, 26 60')}
    </>
  ),
  star: (
    <>
      {F(STAR)}
      {A('M50 8 L 53 4 M54 14 L 59 13 M12 48 L 7 50')}
    </>
  ),
  briefcase: (
    <>
      {F(
        'M10 24 C 10 21, 12 20, 14 20 L 50 20.5 C 53 20.5, 54 22, 54 24.5 L 53.5 50 C 53.5 53, 52 54, 49.5 54 L 14 53.5 C 11 53.5, 10 52, 10 49.5 Z',
      )}
      {I('M25 20 L 25 14.5 C 25 12.5, 26.5 11, 29 11 L 35 11 C 37.5 11, 39 12.5, 39 14.5 L 39 20.5')}
      {I('M10 34 C 24 37.5, 40 37.5, 54 34')}
      {I('M29.5 32.5 L 34.5 32.5 L 34.5 39.5 L 29.5 39.5 Z')}
    </>
  ),
  rocket: (
    <>
      {F('M32 5 C 42.5 13, 44.5 30, 40.5 44 L 23.5 44 C 19.5 30, 21.5 13, 32 5 Z')}
      {I(
        'M32 17.5 C 29.5 17.5, 28 19.5, 28.2 22 C 28.4 24.5, 30.2 26, 32.3 25.8 C 34.6 25.6, 36 23.8, 35.8 21.5 C 35.6 19.2, 34 17.5, 32 17.5 Z',
      )}
      {I('M23.5 35 L 15.5 48.5 L 24 46 M40.5 35 L 48.5 48.5 L 40 46')}
      {A('M27 47 C 28 54, 32 57, 32 61 C 32 57, 36 54, 37 47')}
      {A('M8 20 L 12 20 M10 18 L 10 22 M54 28 L 58 28 M56 26 L 56 30')}
    </>
  ),
  coffee: (
    <>
      {F('M14 29 L 46 28.5 L 42.5 53 C 36 56.5, 24 56.5, 17.5 53.5 Z')}
      {I('M45 33.5 C 54 32, 55 44, 43.5 46')}
      {I('M8 56 C 22 60.5, 42 60.5, 56 56')}
      {A('M24 23 C 20 18, 28 15, 24 8 M34 23 C 30 18, 38 15, 34 8')}
    </>
  ),
  sparkle: (
    <>
      {F('M32 6 C 34 24, 40 30, 58 32 C 40 34, 34 40, 32 58 C 30 40, 24 34, 6 32 C 24 30, 30 24, 32 6 Z')}
      {A(
        'M50 8 C 50.6 12, 52 13.4, 56 14 C 52 14.6, 50.6 16, 50 20 C 49.4 16, 48 14.6, 44 14 C 48 13.4, 49.4 12, 50 8 Z',
      )}
    </>
  ),
}

const DRAWINGS: Record<DoodleName, ReactNode> = { ...BASE_DRAWINGS, ...MORE_DRAWINGS }

/** Every doodle that has a drawing. */
export const DOODLES = Object.keys(DRAWINGS) as DoodleName[]

/** The shared wobble filter. Render once per page (both apps do it at the root). */
export function DecorDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <filter id="doodle-wobble" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="2.2" />
      </filter>
    </svg>
  )
}

export function Doodle(props: { name: DoodleName; className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={`doodle ${props.className ?? ''}`}
      viewBox="-2 -4 68 68"
      aria-hidden="true"
      focusable="false"
      data-doodle={props.name}
      style={props.style}
    >
      <g filter="url(#doodle-wobble)">{DRAWINGS[props.name]}</g>
    </svg>
  )
}

/**
 * A doodle used as an icon: inline, a fixed size, still (no bobbing). Decorative, so it is hidden
 * from screen readers; the text next to it carries the meaning.
 */
export function Icon(props: { name: DoodleName; size?: number; className?: string; tilt?: number }) {
  const size = props.size ?? 34
  return (
    <Doodle
      name={props.name}
      className={`icon ${props.className ?? ''}`}
      style={{ width: size, height: size, ['--r' as string]: `${props.tilt ?? 0}deg` }}
    />
  )
}

// A rough rectangle drawn twice over, for secondary buttons (an outline, not a filled brush).
const SKETCH = 'M6 9 C 60 5, 140 8, 194 6 C 196 20, 193 34, 195 45 C 140 48, 60 45, 5 47 C 3 34, 7 20, 6 9 Z'
const SKETCH_2 = 'M9 6 C 70 9, 130 4, 191 9 M192 42 C 130 46, 70 43, 8 44'

/** The hand-drawn outline of a secondary button (put it inside an element with class `sketch`). */
export function SketchShape() {
  return (
    <svg className="sketch-shape" viewBox="0 0 200 52" preserveAspectRatio="none" aria-hidden="true">
      <path d={SKETCH} vectorEffect="non-scaling-stroke" />
      <path className="again" d={SKETCH_2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export type Spot = {
  top?: number | string
  bottom?: number | string
  left?: number | string
  right?: number | string
  size: number
  rot?: number
  delay?: number
}

/**
 * A few doodles of a set at absolute spots inside a positioned parent; each spot takes the next
 * doodle of the set. They bob gently (none with reduced motion) and never catch taps.
 */
export function Doodles(props: { decor: string | null | undefined; spots: Spot[]; className?: string }) {
  const set = decorSet(props.decor)
  return (
    <div
      className={`doodles ${props.className ?? ''}`}
      aria-hidden="true"
      data-decor={props.decor ?? 'generic'}
    >
      {props.spots.map((s, i) => (
        <Doodle
          // biome-ignore lint/suspicious/noArrayIndexKey: spots are positional
          key={i}
          name={set[i % set.length]}
          className="doodle-bob"
          style={{
            top: s.top,
            bottom: s.bottom,
            left: s.left,
            right: s.right,
            width: s.size,
            height: s.size,
            ['--r' as string]: `${s.rot ?? 0}deg`,
            animationDelay: `${s.delay ?? -i * 1.3}s`,
          }}
        />
      ))}
    </div>
  )
}

// Where the burst's doodles land around a heading (percent of its box), and how they turn.
const BURST_SPOTS = [
  { left: '-12%', top: '6%', size: 34, rot: -16 },
  { right: '-12%', top: '2%', size: 30, rot: 14 },
  { left: '-4%', top: '70%', size: 24, rot: 8 },
  { right: '-6%', top: '72%', size: 26, rot: -10 },
  { left: '22%', top: '-22%', size: 22, rot: 20 },
  { right: '22%', top: '-20%', size: 22, rot: -18 },
]

/**
 * A one-time pop of small doodles around a heading: stars and sparkles mixed with the occasion's
 * set. Used on a correct answer.
 */
export function Burst(props: { decor: string | null | undefined }) {
  const set = decorSet(props.decor)
  const names: DoodleName[] = ['sparkle', set[0], 'star', set[1], set[2] ?? 'sparkle', 'sparkle']
  return (
    <div className="burst" aria-hidden="true" data-decor={props.decor ?? 'generic'}>
      {BURST_SPOTS.map((s, i) => (
        <Doodle
          key={`${names[i]}-${s.rot}`}
          name={names[i]}
          style={{
            left: s.left,
            right: s.right,
            top: s.top,
            width: s.size,
            height: s.size,
            ['--r' as string]: `${s.rot}deg`,
            animationDelay: `${0.15 + i * 0.08}s`,
          }}
        />
      ))}
    </div>
  )
}

const BITS: ('dot' | 'squiggle' | 'bar' | 'tri')[] = ['dot', 'squiggle', 'bar', 'tri']

/**
 * A one-time burst of confetti: small drawn bits plus a couple of the set's doodles, falling
 * once from the top. With reduced motion it is a few still bits.
 */
// Deterministic spread, so screenshots and re-renders are stable.
const PIECES = Array.from({ length: 16 }, (_, i) => ({
  id: `p${i}`,
  big: i % 5 === 2,
  setIndex: Math.floor(i / 5),
  bit: BITS[i % BITS.length],
  tone: i % 2 ? 'ink' : 'acc',
  style: {
    left: `${(i * 37 + 11) % 96}%`,
    animationDelay: `${((i * 13) % 9) / 10}s`,
    ['--r' as string]: `${((i * 47) % 70) - 35}deg`,
    ['--drift' as string]: `${((i * 29) % 40) - 20}px`,
  } as CSSProperties,
}))

export function Confetti(props: { decor: string | null | undefined }) {
  const set = decorSet(props.decor)
  return (
    <div className="confetti" aria-hidden="true" data-decor={props.decor ?? 'generic'}>
      {PIECES.map((p) =>
        p.big ? (
          <Doodle
            key={p.id}
            name={set[p.setIndex % set.length]}
            className="confetti-piece big"
            style={p.style}
          />
        ) : (
          <svg
            key={p.id}
            className={`confetti-piece bit ${p.tone}`}
            viewBox="0 0 20 20"
            style={p.style}
            aria-hidden="true"
          >
            {p.bit === 'dot' && <circle cx="10" cy="10" r="4" />}
            {p.bit === 'squiggle' && <path d="M2 12 C 5 6, 8 16, 11 10 S 16 6, 18 10" />}
            {p.bit === 'bar' && <path d="M5 4 L 15 16" />}
            {p.bit === 'tri' && <path d="M4 15 L 10 4 L 16 15 Z" />}
          </svg>
        ),
      )}
    </div>
  )
}
