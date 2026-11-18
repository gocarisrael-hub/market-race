// Turns a palette into the CSS variables the player (and the site preview) use, and checks it.
// The palette only names a few colors; everything else (text on the background, button text,
// the slot color on paper) is derived here so every theme stays readable.
import type { Palette } from './types.ts'

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
  '--on-accent': string
  '--slot': string
  '--line': string
  '--ribbon': string
  '--ribbon-tail': string
  '--on-ribbon': string
  '--mark': string
}

const LIGHT = '#FFFFFF'

export function themeVars(p: Palette): ThemeVars {
  const dark = p.dark ?? luminance(parseHex(p.background) ?? [255, 255, 255]) < 0.18
  // Text straight on the background: the ink, or the paper color on a dark/mid background.
  const onBg = dark ? p.paper : bestOn(p.background, p.ink, LIGHT)
  const muted = mix(onBg, p.background, 0.72)
  const onAccent = bestOn(p.accent, LIGHT, p.ink)
  const ribbon = p.accent2 ?? p.accent
  const ribbonTail = p.accent2 ? p.accent : shade(p.accent, 0.77)
  // Marks drawn on the background (circles, the X on the map, underlines) use the accent if it
  // reads, the second accent otherwise.
  const mark =
    contrast(p.accent, p.background) >= 2.2 ? p.accent : (p.accent2 ?? readableOn(p.accent, p.background))
  return {
    '--bg': p.background,
    '--ink': p.ink,
    '--paper': p.paper,
    '--ink-soft': mix(p.ink, p.paper, 0.72),
    '--accent': p.accent,
    '--on-bg': onBg,
    '--muted': muted,
    '--on-accent': onAccent,
    '--slot': readableOn(p.accent, p.paper),
    '--line': onBg,
    '--ribbon': ribbon,
    '--ribbon-tail': ribbonTail,
    '--on-ribbon': bestOn(ribbon, LIGHT, p.ink),
    '--mark': mark,
  }
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

/** Minimum contrasts every palette must reach once the player has derived its colors. */
export const CONTRAST_RULES: Rule[] = [
  { check: 'riddle text on paper', fg: (p) => p.ink, bg: (p) => p.paper, min: 4.5 },
  { check: 'text on background', fg: (_, v) => v['--on-bg'], bg: (p) => p.background, min: 4.5 },
  { check: 'button text', fg: (_, v) => v['--on-accent'], bg: (p) => p.accent, min: 3 },
  { check: 'ribbon text', fg: (_, v) => v['--on-ribbon'], bg: (_, v) => v['--ribbon'], min: 3 },
  { check: 'personal text on paper', fg: (_, v) => v['--slot'], bg: (p) => p.paper, min: 3 },
  { check: 'drawn marks on background', fg: (_, v) => v['--mark'], bg: (p) => p.background, min: 3 },
]

export type PaletteIssue = { check: string; ratio: number; min: number }

/** The contrast checks a palette fails; empty when it reads well everywhere in the game. */
export function paletteIssues(p: Palette): PaletteIssue[] {
  const v = themeVars(p)
  const out: PaletteIssue[] = []
  for (const r of CONTRAST_RULES) {
    const ratio = contrast(r.fg(p, v), r.bg(p, v))
    if (ratio < r.min) out.push({ check: r.check, ratio: Math.round(ratio * 100) / 100, min: r.min })
  }
  return out
}
