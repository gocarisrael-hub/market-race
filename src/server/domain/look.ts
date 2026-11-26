// Turns a palette into the CSS variables the player (and the site preview) use, and checks it.
// The palette only names a few colors; everything else (text on the background, button text,
// the slot color on paper) is derived here so every theme stays readable.
import type { Palette, StyleColor, ThemeFont, ThemeStyle } from './types.ts'

type RGB = [number, number, number]

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.replace(/./g, (c) => c + c)
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as RGB
}

export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function luminance([r, g, b]: RGB) {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrast(a: string, b: string): number {
  const ra = parseHex(a)
  const rb = parseHex(b)
  if (!ra || !rb) return 1
  const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Darkens (factor < 1) or lightens toward white (factor > 1). */
export function shade(hex: string, factor: number): string {
  const c = parseHex(hex)
  if (!c) return hex
  if (factor <= 1) return toHex(c.map((v) => v * factor) as RGB)
  const t = factor - 1
  return toHex(c.map((v) => v + (255 - v) * t) as RGB)
}

/** The color of the two candidates that reads better on `bg`. */
export function bestOn(bg: string, a: string, b: string) {
  return contrast(bg, a) >= contrast(bg, b) ? a : b
}

/** Darkens `color` step by step until it reaches `min` contrast against `bg`. */
export function readableOn(color: string, bg: string, min = 3.2): string {
  let c = color
  for (let i = 0; i < 12 && contrast(c, bg) < min; i++) c = shade(c, 0.86)
  return c
}

export interface ThemeVars {
  '--bg': string
  '--ink': string
  '--paper': string
  '--ink-soft': string
  '--accent': string
  '--on-bg': string
  '--muted': string
  '--button': string
  '--on-accent': string
  '--button-line': string
  '--slot': string
  '--line': string
  '--ribbon': string
  '--ribbon-tail': string
  '--ribbon-line': string
  '--on-ribbon': string
  '--mark': string
  '--paper-line': string
  '--sheet-line': string
  '--kicker': string
  '--hint': string
  '--label': string
  '--brand': string
  '--on-brand': string
  '--hand': string
  '--hand-weight': string
  '--hs': string
  '--riddle-font': string
}

const LIGHT = '#FFFFFF'

/**
 * The display fonts a theme can pick. `scale` sizes the font to the room Amatic SC (a narrow
 * hand) was designed for; `css` is the Google Fonts family parameter, loaded only for the theme in
 * use.
 */
export const FONTS: Record<
  ThemeFont,
  { family: string; css: string; weight: number; scale: number; label: string }
> = {
  amatic: { family: "'Amatic SC'", css: 'Amatic+SC:wght@700', weight: 700, scale: 1, label: 'Amatic SC' },
  suez: { family: "'Suez One'", css: 'Suez+One', weight: 400, scale: 0.66, label: 'Suez One' },
  frank: {
    family: "'Frank Ruhl Libre'",
    css: 'Frank+Ruhl+Libre:wght@500;700',
    weight: 500,
    scale: 0.64,
    label: 'Frank Ruhl Libre',
  },
}

export const fontOf = (style?: ThemeStyle | null) => FONTS[style?.font ?? 'amatic'] ?? FONTS.amatic

/** The Google Fonts stylesheet for a theme's display font (Heebo is always loaded). */
export const fontHref = (style?: ThemeStyle | null) =>
  `https://fonts.googleapis.com/css2?family=${fontOf(style).css}&display=swap`

const isHex = (v: unknown): v is string => typeof v === 'string' && parseHex(v) !== null

/**
 * The CSS variables of a game look. The palette names a few colors and everything else is derived
 * so it stays readable; a theme's style can fix any derived color (`style.colors`) and sets the
 * display font.
 */
export function themeVars(p: Palette, style: ThemeStyle = {}): ThemeVars {
  const dark = p.dark ?? luminance(parseHex(p.background) ?? [255, 255, 255]) < 0.18
  const c = style.colors ?? {}
  const pick = (k: StyleColor, fallback: string) => {
    const v = c[k]
    return isHex(v) ? v : fallback
  }
  // Text straight on the background: the ink, or the paper color on a dark/mid background.
  const onBg = pick('onBg', dark ? p.paper : bestOn(p.background, p.ink, LIGHT))
  const muted = mix(onBg, p.background, 0.72)
  const button = pick('button', p.accent)
  const ribbon = pick('ribbon', p.accent2 ?? p.accent)
  const ribbonTail = pick('ribbonTail', p.accent2 ? p.accent : shade(p.accent, 0.77))
  // Marks drawn on the background (circles, the X on the map, underlines) use the accent if it
  // reads, the second accent otherwise.
  const mark = pick(
    'mark',
    contrast(p.accent, p.background) >= 2.2 ? p.accent : (p.accent2 ?? readableOn(p.accent, p.background)),
  )
  const font = fontOf(style)
  // Small labels on the background: a little softer than the text when that still reads.
  const softLabel = mix(onBg, p.background, 0.85)
  const label = contrast(softLabel, p.background) >= 4.5 ? softLabel : onBg
  return {
    '--bg': p.background,
    '--ink': p.ink,
    '--paper': p.paper,
    '--ink-soft': mix(p.ink, p.paper, 0.72),
    '--accent': p.accent,
    '--on-bg': onBg,
    '--muted': muted,
    '--button': button,
    '--on-accent': pick('onButton', bestOn(button, LIGHT, p.ink)),
    '--button-line': pick('buttonLine', p.ink),
    '--slot': pick('slot', readableOn(p.accent, p.paper)),
    '--line': onBg,
    '--ribbon': ribbon,
    '--ribbon-tail': ribbonTail,
    '--ribbon-line': pick('ribbonLine', p.ink),
    '--on-ribbon': pick('onRibbon', bestOn(ribbon, LIGHT, p.ink)),
    '--mark': mark,
    '--paper-line': pick('paperLine', p.ink),
    '--sheet-line': pick('sheetLine', p.ink),
    '--kicker': pick('kicker', mix(p.ink, p.paper, 0.72)),
    '--hint': pick('hint', onBg),
    '--label': pick('label', label),
    '--brand': pick('brand', p.paper),
    '--on-brand': pick('onBrand', p.ink),
    '--hand': `${font.family}, Heebo, sans-serif`,
    '--hand-weight': String(font.weight),
    '--hs': String(font.scale),
    '--riddle-font': style.serifBody ? `${font.family}, Heebo, serif` : 'var(--sans)',
  }
}

/** Colors for the drawn frame round the game photos: the theme's ink, accent and personal color. */
export function frameColors(p: Palette, style: ThemeStyle = {}) {
  const v = themeVars(p, style)
  return { paper: p.paper, ink: v['--paper-line'], accent: v['--mark'], accent2: v['--slot'] }
}

/** Linear mix: weight 1 = a, 0 = b. */
export function mix(a: string, b: string, weight: number): string {
  const ra = parseHex(a)
  const rb = parseHex(b)
  if (!ra || !rb) return a
  return toHex(ra.map((v, i) => v * weight + rb[i] * (1 - weight)) as RGB)
}

export const DEFAULT_PALETTE: Palette = {
  background: '#EADBC8',
  accent: '#B4161B',
  ink: '#2B2420',
  paper: '#FFFBF4',
}

type Rule = {
  check: string
  fg: (p: Palette, v: ThemeVars) => string
  bg: (p: Palette, v: ThemeVars) => string
  min: number
}

/** Minimum contrasts every look must reach once the player has derived its colors. */
export const CONTRAST_RULES: Rule[] = [
  { check: 'riddle text on paper', fg: (p) => p.ink, bg: (p) => p.paper, min: 4.5 },
  { check: 'text on background', fg: (_, v) => v['--on-bg'], bg: (p) => p.background, min: 4.5 },
  { check: 'button text', fg: (_, v) => v['--on-accent'], bg: (_, v) => v['--button'], min: 3 },
  { check: 'ribbon text', fg: (_, v) => v['--on-ribbon'], bg: (_, v) => v['--ribbon'], min: 3 },
  { check: 'personal text on paper', fg: (_, v) => v['--slot'], bg: (p) => p.paper, min: 3 },
  { check: 'drawn marks on background', fg: (_, v) => v['--mark'], bg: (p) => p.background, min: 3 },
  { check: 'riddle title on paper', fg: (_, v) => v['--kicker'], bg: (p) => p.paper, min: 3 },
  { check: 'hint on background', fg: (_, v) => v['--hint'], bg: (p) => p.background, min: 3 },
  { check: 'labels on background', fg: (_, v) => v['--label'], bg: (p) => p.background, min: 4.5 },
]

export type PaletteIssue = { check: string; ratio: number; min: number }

/** The contrast checks a look fails; empty when it reads well everywhere in the game. */
export function paletteIssues(p: Palette, style: ThemeStyle = {}): PaletteIssue[] {
  const v = themeVars(p, style)
  const out: PaletteIssue[] = []
  for (const r of CONTRAST_RULES) {
    const ratio = contrast(r.fg(p, v), r.bg(p, v))
    if (ratio < r.min) out.push({ check: r.check, ratio: Math.round(ratio * 100) / 100, min: r.min })
  }
  return out
}
