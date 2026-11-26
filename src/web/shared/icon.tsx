// Library icons on the site and in the player: one <img> per icon, lazy, decoded off the main
// thread, sized up front so nothing jumps. The original map illustrations have recolored copies
// per theme (scripts/themes/process.py); every other icon gets the theme's look from an SVG
// gradient-map filter built from the same color ramps (see IconTreatDefs and decor.css), so the
// 500 icons need no per-theme files.
import { type CSSProperties, createContext, useContext } from 'react'
import { decorIcons, iconUrl, isRecolored } from '../../server/domain/icons.ts'

// The theme's recolored folder (ThemeStyle.icons), set by the app while it renders.
let iconSet = ''

/** Sets the illustration set of the theme in play (only simple folder names are taken). */
export function setIconSet(set: string | null | undefined) {
  iconSet = set && /^[a-z0-9-]+$/.test(set) ? set : ''
}

/** URL of an icon in the theme in play (recolored for the classics). */
export const themedIconUrl = (key: string) => iconUrl(key, iconSet)

export function LibIcon(props: {
  icon: string
  size?: number
  className?: string
  tilt?: number
  /** Meaningful icons name themselves; decorative ones (the default) are hidden. */
  alt?: string
  style?: CSSProperties
  /** Above the fold: load now. */
  eager?: boolean
}) {
  const size = props.size ?? 40
  const recolored = isRecolored(props.icon, iconSet)
  return (
    <img
      className={`lib-icon${recolored ? ' recolored' : ''} ${props.className ?? ''}`}
      src={iconUrl(props.icon, iconSet)}
      alt={props.alt ?? ''}
      aria-hidden={props.alt ? undefined : true}
      width={size}
      height={size}
      loading={props.eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      style={{ width: size, height: size, ['--r' as string]: `${props.tilt ?? 0}deg`, ...props.style }}
    />
  )
}

// ---------- The occasion's icons (drawn with its doodles) ----------

const DecorIcons = createContext<readonly string[] | null>(null)

/** The occasion's own icons for the doodles below (none: the doodle set's defaults). */
export const DecorIconsProvider = DecorIcons.Provider

/** The icons to draw with a doodle set: the provided occasion's, else the set's defaults. */
export function useDecorIcons(decor: string | null | undefined): string[] {
  return decorIcons(decor, useContext(DecorIcons))
}

// ---------- Theme treatment ----------

type Stop = [number, string]

/** Luminance ramps of the recolored styles, as in scripts/themes/process.py. */
const RAMPS: Record<string, Stop[]> = {
  blush: [
    [0, '#4E1430'],
    [0.45, '#B84A72'],
    [0.75, '#EBA9BC'],
    [0.92, '#FBE5E9'],
    [1, '#FFF4F3'],
  ],
  ink: [
    [0, '#17130F'],
    [0.5, '#5E4630'],
    [0.8, '#C3A57C'],
    [1, '#DCC39C'],
  ],
  cobalt: [
    [0, '#0B1F55'],
    [0.45, '#1F4FB0'],
    [0.75, '#8FAEE0'],
    [0.9, '#E6EDF8'],
    [1, '#FBF9F4'],
  ],
  gold: [
    [0, '#7E5818'],
    [0.3, '#8E6420'],
    [0.55, '#C59A45'],
    [0.8, '#EBD08C'],
    [1, '#FFFAF0'],
  ],
}

const hex = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)

/** A ramp sampled at even steps, per channel, for feComponentTransfer's tableValues. */
export function rampTables(stops: Stop[], steps = 16): [string, string, string] {
  const out: number[][] = [[], [], []]
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const j = Math.max(0, stops.findIndex((s) => s[0] >= t) - 1)
    const [p0, c0] = stops[j]
    const [p1, c1] = stops[Math.min(j + 1, stops.length - 1)]
    const k = p1 > p0 ? Math.min(1, Math.max(0, (t - p0) / (p1 - p0))) : 0
    const a = hex(c0)
    const b = hex(c1)
    for (let c = 0; c < 3; c++) out[c].push(+(a[c] * (1 - k) + b[c] * k).toFixed(3))
  }
  return out.map((v) => v.join(' ')) as [string, string, string]
}

const LUMA = '0.299 0.587 0.114 0 0'

/**
 * The filters the themed games draw library icons through (decor.css picks one by the root's
 * data-icons). Render once per page.
 */
export function IconTreatDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      {Object.entries(RAMPS).map(([name, stops]) => {
        const [r, g, b] = rampTables(stops)
        return (
          <filter key={name} id={`icons-${name}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={`${LUMA} ${LUMA} ${LUMA} 0 0 0 1 0`} />
            <feComponentTransfer>
              <feFuncR type="table" tableValues={r} />
              <feFuncG type="table" tableValues={g} />
              <feFuncB type="table" tableValues={b} />
            </feComponentTransfer>
          </filter>
        )
      })}
      {/* Neon: the lines and colors lit on the dark page, the paper white gone, a soft glow. */}
      <filter id="icons-neon" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="saturate" values="2.2" result="vivid" />
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.42 -0.82 -0.16 0 1.32"
          result="strength"
        />
        <feComposite in="strength" in2="SourceAlpha" operator="in" result="mask" />
        <feComponentTransfer in="vivid" result="lit">
          <feFuncR type="linear" slope="1.25" intercept="0.12" />
          <feFuncG type="linear" slope="1.25" intercept="0.16" />
          <feFuncB type="linear" slope="1.25" intercept="0.2" />
        </feComponentTransfer>
        <feComposite in="lit" in2="mask" operator="in" result="lines" />
        <feGaussianBlur in="lines" stdDeviation="2.5" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="lines" />
        </feMerge>
      </filter>
    </svg>
  )
}
