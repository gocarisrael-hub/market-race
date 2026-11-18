// Company palette from a logo. Pure: takes RGBA pixels (already downscaled by the caller).
// Dominant colors by k-means; the accent is the most present colorful one with enough contrast
// (WCAG >= 3:1) against the theme's background; ink is a dark logo color, else the theme's ink.
import type { Palette } from './types.ts'

export type RGB = [number, number, number]

export interface Swatch {
  hex: string
  rgb: RGB
  share: number // 0..1 of the opaque pixels
}

export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase()
}

export function fromHex(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** HSL-style saturation, 0..1. */
export function saturation([r, g, b]: RGB): number {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  if (max === min) return 0
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
}

const dist2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/**
 * Dominant colors of an RGBA buffer, most present first. Transparent pixels are ignored.
 * Deterministic k-means: seeds are the most frequent coarse color, then farthest-point picks.
 */
export function dominantColors(rgba: Uint8Array | Uint8ClampedArray, k = 5, iterations = 12): Swatch[] {
  const px: RGB[] = []
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    px.push([rgba[i], rgba[i + 1], rgba[i + 2]])
  }
  if (!px.length) return []

  // Seed 1: center of the most frequent coarse (4 bits per channel) bucket.
  const buckets = new Map<number, { n: number; sum: RGB }>()
  for (const p of px) {
    const key = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4)
    const b = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] }
    b.n++
    b.sum[0] += p[0]
    b.sum[1] += p[1]
    b.sum[2] += p[2]
    buckets.set(key, b)
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0]
  const centers: RGB[] = [[top.sum[0] / top.n, top.sum[1] / top.n, top.sum[2] / top.n]]
  while (centers.length < k) {
    let best: RGB | null = null
    let bestD = 0
    for (const p of px) {
      const d = Math.min(...centers.map((c) => dist2(p, c)))
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
    if (!best || bestD < 100) break // the rest is the same color
    centers.push([...best])
  }

  const assign = new Array<number>(px.length).fill(0)
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < px.length; i++) {
      let bi = 0
      let bd = Number.POSITIVE_INFINITY
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(px[i], centers[c])
        if (d < bd) {
          bd = d
          bi = c
        }
      }
      assign[i] = bi
    }
    const sums = centers.map(() => ({ n: 0, s: [0, 0, 0] as RGB }))
    for (let i = 0; i < px.length; i++) {
      const s = sums[assign[i]]
      s.n++
      s.s[0] += px[i][0]
      s.s[1] += px[i][1]
      s.s[2] += px[i][2]
    }
    sums.forEach((s, c) => {
      if (s.n) centers[c] = [s.s[0] / s.n, s.s[1] / s.n, s.s[2] / s.n]
    })
  }
  const counts = centers.map(() => 0)
  for (const a of assign) counts[a]++
  return centers
    .map((c, i) => {
      const rgb = c.map(Math.round) as RGB
      return { hex: toHex(rgb), rgb, share: counts[i] / px.length }
    })
    .filter((s) => s.share > 0)
    .sort((a, b) => b.share - a.share)
}

/** Darkens (or lightens on a dark background) until the contrast reaches `min`. */
export function adjustForContrast(color: RGB, against: RGB, min = 3): RGB {
  const darken = luminance(against) > 0.18
  let c: RGB = [...color]
  for (let i = 0; i < 40 && contrastRatio(c, against) < min; i++) {
    c = darken ? (c.map((v) => v * 0.9) as RGB) : (c.map((v) => v + (255 - v) * 0.1) as RGB)
  }
  return c.map(Math.round) as RGB
}

/**
 * The company palette: theme background and paper stay; accent and ink come from the logo.
 * Accent: the most present colorful swatch with contrast >= 3 against the background; else the
 * most present one with that contrast; else the most present colorful one adjusted to reach it.
 */
export function companyPalette(swatches: Swatch[], theme: Palette): Palette {
  const bg = fromHex(theme.background)
  const paper = fromHex(theme.paper)
  const contrasting = swatches.filter((s) => contrastRatio(s.rgb, bg) >= 3)
  const colorful = (s: Swatch) => saturation(s.rgb) >= 0.25 && luminance(s.rgb) > 0.01
  let accent =
    contrasting.find(colorful)?.rgb ?? contrasting.find((s) => saturation(s.rgb) >= 0.1)?.rgb ?? null
  if (!accent) {
    const base = swatches.find(colorful) ?? null
    accent = base ? adjustForContrast(base.rgb, bg) : (contrasting[0]?.rgb ?? fromHex(theme.accent))
  }
  const accentHex = toHex(accent)
  const second = contrasting.find((s) => colorful(s) && s.hex !== accentHex && dist2(s.rgb, accent) > 2500)

  // Ink: the darkest logo color if it reads on paper (4.5:1), else the theme's ink.
  const darkest = [...swatches].sort((a, b) => luminance(a.rgb) - luminance(b.rgb))[0]
  const ink =
    darkest && luminance(darkest.rgb) < 0.08 && contrastRatio(darkest.rgb, paper) >= 4.5
      ? darkest.hex
      : theme.ink

  const out: Palette = { background: theme.background, paper: theme.paper, accent: accentHex, ink }
  if (second) out.accent2 = second.hex
  if (theme.dark) out.dark = true
  return out
}
