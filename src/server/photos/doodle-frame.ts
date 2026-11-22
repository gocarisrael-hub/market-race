// The live game-photo look (the owner's choice, style 14 reworked): the photo stays itself, and the
// style lives round it. With its background, the photo sits in a hand-drawn blob inside a drawn
// circle; without, the cut subject (thin ink outline) breaks a little out of the circle. Round it,
// 6 to 10 doodles from the order's occasion set, in the order's palette.
// The seed (the photo's id) picks the doodles, their places, turns and colors: each photo gets its
// own, and a re-render of the same photo is identical. Doodles never touch the subject.
// `illustrate` (illustrate.ts) is the previous look, kept for comparison and fallback.
import sharp from 'sharp'
import { DECOR_DOODLES, DOODLE_SVG } from './doodles.generated.ts'
import { alphaBox, ILLUSTRATED_ASPECT, type Rgb, subjectWindow } from './illustrate.ts'

export type FrameMode = 'bg' | 'cut'
/** Palette colors as CSS hex (the order's Palette). */
export interface FrameColors {
  paper: string
  ink: string
  accent: string
  accent2?: string
}
export interface DoodleFrameOptions {
  /** Picks doodles, places, turns and colors: the photo's id. */
  seed: number
  /** The occasion's doodle set (Decor); unknown or missing: generic. */
  decor?: string | null
  palette?: Partial<FrameColors> | null
  /** Output height in px (width is 4:5 of it). Default 1000. */
  height?: number
  /** Draw the doodles (default true; off only to compare in tests). */
  doodles?: boolean
}
export interface DoodlePlacement {
  name: string
  x: number
  y: number
  /** Side of the doodle's 64-unit box, in px. */
  size: number
  rotate: number
  color: string
}

export const DEFAULT_FRAME_COLORS: FrameColors = {
  paper: '#FCF3E3',
  ink: '#2B2420',
  accent: '#B4161B',
  accent2: '#1F5E8C',
}
/** How many doodles a photo gets. */
export const DOODLES_MIN = 6
export const DOODLES_MAX = 10
/** A doodle's reach from its center, as a share of its box side (rotated box plus the wobble). */
export const DOODLE_REACH = 0.75

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t
const hexRgb = (h: string): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
  const v = m ? m[1] : '000000'
  return {
    r: Number.parseInt(v.slice(0, 2), 16),
    g: Number.parseInt(v.slice(2, 4), 16),
    b: Number.parseInt(v.slice(4, 6), 16),
  }
}
const rgbHex = (c: Rgb) => `#${[c.r, c.g, c.b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
const lum = (c: Rgb) => (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255
/** A pen color that reads on paper: a pale accent is pulled toward the ink. */
const penOf = (c: Rgb, ink: Rgb): Rgb =>
  lum(c) > 0.62 ? { r: mix(c.r, ink.r, 0.45), g: mix(c.g, ink.g, 0.45), b: mix(c.b, ink.b, 0.45) } : c

/** A small seeded generator (mulberry32 over a mixed seed): same seed, same sequence. */
export function rngOf(seed: number) {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  let a = (h ^ (h >>> 16)) | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The doodle names of an occasion set (generic when unknown). */
export const doodleSet = (decor: string | null | undefined) =>
  (DECOR_DOODLES[decor ?? 'generic'] ?? DECOR_DOODLES.generic).filter((n) => DOODLE_SVG[n])

/**
 * Places 6 to 10 doodles of the set on a W x H sheet, none reaching a pixel of `keepOut` (1 =
 * the subject and its frame) nor another doodle nor the sheet's edge. Pure: same inputs, same plan.
 */
export function planDoodles(
  rand: () => number,
  names: string[],
  keepOut: Uint8Array,
  W: number,
  H: number,
  colors: string[],
): DoodlePlacement[] {
  const want = DOODLES_MIN + Math.floor(rand() * (DOODLES_MAX - DOODLES_MIN + 1))
  const pool = [...names]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  // A summed-area table of the keep-out: a doodle's whole square (round its reach) must be clear.
  const sat = new Float64Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    let row = 0
    for (let x = 0; x < W; x++) {
      row += keepOut[y * W + x] ? 1 : 0
      sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + row
    }
  }
  const free = (x: number, y: number, r: number) => {
    const x0 = Math.max(0, Math.floor(x - r))
    const y0 = Math.max(0, Math.floor(y - r))
    const x1 = Math.min(W, Math.ceil(x + r) + 1)
    const y1 = Math.min(H, Math.ceil(y + r) + 1)
    const S = W + 1
    return sat[y1 * S + x1] - sat[y0 * S + x1] - sat[y1 * S + x0] + sat[y0 * S + x0] === 0
  }
  const out: DoodlePlacement[] = []
  for (let k = 0; k < want; k++) {
    const name = pool[k % pool.length]
    for (let attempt = 0; attempt < 700; attempt++) {
      // Big ones first; when the margins are tight, smaller.
      const shrink = attempt < 250 ? 1 : attempt < 400 ? 0.8 : attempt < 550 ? 0.65 : 0.55
      const size = W * (0.105 + rand() * 0.06) * shrink
      const r = size * DOODLE_REACH
      const x = r + rand() * (W - 2 * r)
      const y = r + rand() * (H - 2 * r)
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < (o.size * DOODLE_REACH + r) * 0.8)) continue
      if (!free(x, y, r)) continue
      out.push({
        name,
        x,
        y,
        size,
        rotate: Math.round((rand() - 0.5) * 56),
        color: colors[Math.floor(rand() * colors.length)],
      })
      break
    }
  }
  return out
}

/** A smooth closed path through points (Catmull-Rom as cubic Beziers). */
function closedPath(pts: [number, number][]) {
  const n = pts.length
  const f = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  let d = `M${f(pts[0])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`
  }
  return `${d} Z`
}
/** A smooth open path through points. */
function openPath(pts: [number, number][]) {
  const f = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  let d = `M${f(pts[0])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`
  }
  return d
}

/** A wobbly blob round (cx, cy): the window the photo shows through. */
function blobPoints(rand: () => number, cx: number, cy: number, rx: number, ry: number) {
  const ph = [rand(), rand(), rand()].map((v) => v * Math.PI * 2)
  const pts: [number, number][] = []
  const n = 40
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const m =
      1 + 0.025 * Math.sin(2 * t + ph[0]) + 0.018 * Math.sin(3 * t + ph[1]) + 0.01 * Math.sin(5 * t + ph[2])
    pts.push([cx + Math.cos(t) * rx * m, cy + Math.sin(t) * ry * m])
  }
  return pts
}
/** A circle drawn in one go by hand: it starts anywhere, drifts, and overshoots its start. */
function ringPath(rand: () => number, cx: number, cy: number, rx: number, ry: number) {
  const start = rand() * Math.PI * 2
  const sweep = Math.PI * 2 + 0.35 + rand() * 0.25
  const ph = rand() * Math.PI * 2
  const pts: [number, number][] = []
  const n = 44
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const t = start + s * sweep
    const m = 1 + 0.018 * Math.sin(2 * t + ph) - 0.035 * s
    pts.push([cx + Math.cos(t) * rx * m, cy + Math.sin(t) * ry * m])
  }
  return openPath(pts)
}

/** Paper: the base color, a slow mottle and a fine grain. RGB raw. */
async function paperOf(rand: () => number, W: number, H: number, color: Rgb) {
  const sw = Math.ceil(W / 8)
  const sh = Math.ceil(H / 8)
  const small = Buffer.alloc(sw * sh)
  for (let i = 0; i < small.length; i++) small[i] = Math.round(rand() * 255)
  const blot = await sharp(small, { raw: { width: sw, height: sh, channels: 1 } })
    .resize(W, H, { kernel: 'cubic' })
    .blur(6)
    .greyscale()
    .raw()
    .toBuffer()
  const out = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    const d = ((blot[i] - 128) / 128) * 7 + (rand() - 0.5) * 6
    out[i * 3] = clamp(color.r + d)
    out[i * 3 + 1] = clamp(color.g + d)
    out[i * 3 + 2] = clamp(color.b + d * 1.1)
  }
  return out
}

/** A light, warm, paper-toned grade: the photo stays sharp and true, just printed on warm paper. */
function warmGrade(rgb: Buffer, paper: Rgb) {
  const out = Buffer.alloc(rgb.length)
  for (let i = 0; i < rgb.length; i += 3) {
    out[i] = clamp(mix(rgb[i], paper.r, 0.07) * 1.01 + 2)
    out[i + 1] = clamp(mix(rgb[i + 1], paper.g, 0.07) * 0.995)
    out[i + 2] = clamp(mix(rgb[i + 2], paper.b, 0.07) * 0.955)
  }
  return out
}

/** Paints `src` (RGB at its own x0,y0 and size) over `dst` (W-wide RGB) with alpha `a` (0..255). */
function blit(dst: Buffer, W: number, src: Buffer, a: Buffer, x0: number, y0: number, w: number, h: number) {
  const H = dst.length / 3 / W
  for (let y = 0; y < h; y++) {
    const dy = y + y0
    if (dy < 0 || dy >= H) continue
    for (let x = 0; x < w; x++) {
      const dx = x + x0
      if (dx < 0 || dx >= W) continue
      const t = a[y * w + x] / 255
      if (t <= 0) continue
      const si = (y * w + x) * 3
      const di = (dy * W + dx) * 3
      dst[di] = clamp(mix(dst[di], src[si], t))
      dst[di + 1] = clamp(mix(dst[di + 1], src[si + 1], t))
      dst[di + 2] = clamp(mix(dst[di + 2], src[si + 2], t))
    }
  }
}
/** Paints a flat color over `dst` with coverage `a` (0..1) times `k`. */
function ink(dst: Buffer, color: Rgb, a: Float32Array | Buffer, k = 1) {
  const f = a instanceof Float32Array ? 1 : 1 / 255
  for (let i = 0; i < a.length; i++) {
    const t = Math.min(1, a[i] * f * k)
    if (t <= 0) continue
    dst[i * 3] = clamp(mix(dst[i * 3], color.r, t))
    dst[i * 3 + 1] = clamp(mix(dst[i * 3 + 1], color.g, t))
    dst[i * 3 + 2] = clamp(mix(dst[i * 3 + 2], color.b, t))
  }
}
/** The alpha of an SVG drawn at W x H. */
async function svgAlpha(W: number, H: number, body: string) {
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`),
  )
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer()
}
async function blurA(a: Buffer, W: number, H: number, sigma: number) {
  return sharp(a, { raw: { width: W, height: H, channels: 1 } })
    .blur(Math.max(0.3, sigma))
    .greyscale()
    .raw()
    .toBuffer()
}

/** The doodles as one SVG overlay (the site's pen: wobbly strokes, light fills). */
function doodlesSvg(W: number, H: number, plan: DoodlePlacement[], inkHex: string, seed: number) {
  const styles: string[] = []
  const groups = plan.map((d, k) => {
    styles.push(
      `.z${k} .i{fill:none;stroke:${inkHex}}.z${k} .a{fill:none;stroke:${d.color}}.z${k} .f{fill:${d.color};fill-opacity:.22;stroke:${inkHex}}.z${k} .d{fill:${d.color};stroke:none}`,
    )
    const s = d.size / 64
    return `<g class="z${k}" transform="translate(${d.x.toFixed(1)},${d.y.toFixed(1)}) rotate(${d.rotate}) scale(${s.toFixed(4)}) translate(-32,-32)"><g filter="url(#wob)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${DOODLE_SVG[d.name]}</g></g>`
  })
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="wob" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="${seed % 1000}"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter></defs><style>${styles.join('')}</style>${groups.join('')}</svg>`,
  )
}

/**
 * RGB raw of the photo cropped to w x h. A tall photo keeps its upper part (faces are up there; the
 * saliency crop tends to pick a bright floor or window); a wide one is cropped round its subject.
 */
async function cropTo(input: Buffer, w: number, h: number, paper: string) {
  const upright = await sharp(input)
    .rotate()
    .flatten({ background: paper })
    .toColorspace('srgb')
    .toBuffer({ resolveWithObject: true })
  const tall = upright.info.height / upright.info.width > h / w
  if (!tall)
    return sharp(upright.data)
      .resize(w, h, { fit: 'cover', position: sharp.strategy.attention })
      .removeAlpha()
      .raw()
      .toBuffer()
  const sh = Math.round((upright.info.height * w) / upright.info.width)
  const scaled = await sharp(upright.data).resize(w, sh).removeAlpha().raw().toBuffer()
  const top = Math.round((sh - h) * 0.28)
  return scaled.subarray(top * w * 3, (top + h) * w * 3)
}

/** RGBA raw of the cutout framed on its silhouette (illustrate.ts's subjectWindow), w x h. */
async function frameCutout(cutout: Buffer, w: number, h: number) {
  const { data, info } = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const box = alphaBox(data, info.width, info.height)
  if (!box) throw new Error('empty cutout')
  const win = subjectWindow(box, info.width, info.height)
  const pad = {
    left: Math.max(0, -win.left),
    top: Math.max(0, -win.top),
    right: Math.max(0, win.left + win.width - info.width),
    bottom: Math.max(0, win.top + win.height - info.height),
  }
  const padded = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extend({ ...pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer()
  const rgba = await sharp(padded, {
    raw: {
      width: info.width + pad.left + pad.right,
      height: info.height + pad.top + pad.bottom,
      channels: 4,
    },
  })
    .extract({ left: win.left + pad.left, top: win.top + pad.top, width: win.width, height: win.height })
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer()
  // Sides where the photo's own edge cut the subject (a body below a portrait, a friend half out
  // of the shot): the subject is set against the same edge of the sheet, never cut mid-air.
  const e = 2
  const cut = {
    top: box.y0 <= e,
    bottom: box.y1 >= info.height - e,
    left: box.x0 <= e,
    right: box.x1 >= info.width - e,
  }
  return { rgba, cut }
}

export interface FrameRender {
  /** RGB raw, W x H, before JPEG. */
  raw: Buffer
  width: number
  height: number
  doodles: DoodlePlacement[]
  /** 1 where the subject (and its frame) is: no doodle reaches it. */
  keepOut: Uint8Array
  /** 1 where the subject itself shows (the photo window, or the cut silhouette). */
  subject: Uint8Array
}

/** Renders a photo (mode 'bg') or a transparent cutout PNG (mode 'cut') in the doodle frame. */
export async function renderDoodleFrame(
  input: Buffer,
  mode: FrameMode,
  opts: DoodleFrameOptions,
): Promise<FrameRender> {
  const H = Math.max(40, Math.round(opts.height ?? 1000))
  const W = Math.round(H * ILLUSTRATED_ASPECT)
  const rand = rngOf(opts.seed)
  const pal = {
    ...DEFAULT_FRAME_COLORS,
    ...Object.fromEntries(Object.entries(opts.palette ?? {}).filter(([, v]) => !!v)),
  }
  const paper = hexRgb(pal.paper)
  const inkC = hexRgb(pal.ink)
  const accent = penOf(hexRgb(pal.accent), inkC)
  const accent2 = pal.accent2 ? penOf(hexRgb(pal.accent2), inkC) : accent
  const out = await paperOf(rand, W, H, paper)
  const keepOut = new Uint8Array(W * H)
  const subject = new Uint8Array(W * H)
  const accentHex = rgbHex(accent)
  const ringW = W / 95

  if (mode === 'bg') {
    const cx = W * 0.5
    const cy = H * 0.47
    const rx = W * 0.4
    const ry = H * 0.37
    const blob = closedPath(blobPoints(rand, cx, cy, rx, ry))
    const mask = await svgAlpha(W, H, `<path d="${blob}" fill="#fff"/>`)
    // The photo, cropped round its subject to the blob's box (a little over, for the wobble).
    const bw = Math.round(rx * 2.12)
    const bh = Math.round(ry * 2.12)
    const bx = Math.round(cx - bw / 2)
    const by = Math.round(cy - bh / 2)
    const photo = await cropTo(input, bw, bh, pal.paper)
    const a = Buffer.alloc(bw * bh)
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const X = x + bx
        const Y = y + by
        if (X >= 0 && Y >= 0 && X < W && Y < H) a[y * bw + x] = mask[Y * W + X]
      }
    blit(out, W, warmGrade(photo, paper), a, bx, by, bw, bh)
    const ring = ringPath(rand, cx, cy, rx * 1.075, ry * 1.065)
    const lines = await svgAlpha(
      W,
      H,
      `<path d="${blob}" fill="none" stroke="#000" stroke-width="${(W / 300).toFixed(2)}"/>`,
    )
    ink(out, inkC, lines, 0.85)
    const ringA = await svgAlpha(
      W,
      H,
      `<path d="${ring}" fill="none" stroke="#000" stroke-width="${ringW.toFixed(2)}" stroke-linecap="round"/>`,
    )
    ink(out, accent, ringA)
    for (let i = 0; i < W * H; i++) if (mask[i] > 8) subject[i] = 1
    // The frame and everything in it: the blob, the ring and a margin.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const e = ((x - cx) / (rx * 1.15)) ** 2 + ((y - cy) / (ry * 1.13)) ** 2
        if (e <= 1 || mask[y * W + x] > 0 || ringA[y * W + x] > 0) keepOut[y * W + x] = 1
      }
  } else {
    // The cut subject, framed on its silhouette, a bit smaller than the sheet.
    const sw = Math.round(W * 0.88)
    const sh = Math.round(H * 0.88)
    const { rgba, cut } = await frameCutout(input, sw, sh)
    const sx = cut.left && !cut.right ? 0 : cut.right && !cut.left ? W - sw : Math.round((W - sw) / 2)
    const sy = cut.bottom ? H - sh : cut.top ? 0 : Math.round((H - sh) / 2 + H * 0.02)
    // The subject on the sheet: alpha, graded colors, a thin ink outline just outside it.
    const alpha = Buffer.alloc(W * H)
    const rgb = Buffer.alloc(sw * sh * 3)
    const a = Buffer.alloc(sw * sh)
    for (let i = 0; i < sw * sh; i++) {
      rgb[i * 3] = rgba[i * 4]
      rgb[i * 3 + 1] = rgba[i * 4 + 1]
      rgb[i * 3 + 2] = rgba[i * 4 + 2]
      a[i] = rgba[i * 4 + 3]
      const x = (i % sw) + sx
      const y = Math.floor(i / sw) + sy
      if (x >= 0 && y >= 0 && x < W && y < H) alpha[y * W + x] = a[i]
    }
    // The circle sits low on the subject, so the head breaks out of it.
    // It follows the subject's mass across, and its lower part down.
    let mx = 0
    let mass = 0
    let top = H
    let bottom = 0
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = alpha[y * W + x]
        if (v < 128) continue
        mx += x
        mass++
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    // A subject off to one side gets a smaller circle, so the circle stays on it and on the sheet.
    const mxAt = mass ? mx / mass : W / 2
    const r = Math.min(W * 0.38, Math.max(W * 0.3, Math.min(mxAt, W - mxAt) / 1.05))
    const cx = Math.min(W - r * 1.12, Math.max(r * 1.12, mxAt))
    const cy = Math.min(H - r * 1.12, Math.max(r * 1.12, mass ? top + (bottom - top) * 0.6 : H / 2))
    const ring = ringPath(rand, cx, cy, r * 1.02, r * 1.0)
    const disk = await svgAlpha(W, H, `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>`)
    ink(out, accent, disk, 0.13)
    const ringA = await svgAlpha(
      W,
      H,
      `<path d="${ring}" fill="none" stroke="#000" stroke-width="${ringW.toFixed(2)}" stroke-linecap="round"/>`,
    )
    ink(out, accent, ringA)
    const soft = await blurA(alpha, W, H, W / 330)
    const line = new Float32Array(W * H)
    for (let i = 0; i < W * H; i++) line[i] = Math.min(1, Math.max(0, (soft[i] - alpha[i]) / 255) * 3.4) * 0.9
    ink(out, inkC, line)
    blit(out, W, warmGrade(rgb, paper), a, sx, sy, sw, sh)
    const near = await blurA(alpha, W, H, W / 40)
    for (let i = 0; i < W * H; i++) {
      if (alpha[i] > 24) subject[i] = 1
      if (alpha[i] > 0 || near[i] > 4 || disk[i] > 0 || ringA[i] > 0) keepOut[i] = 1
    }
    // The ring's own reach (it drifts a little outside the disk).
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= (r * 1.1) ** 2) keepOut[y * W + x] = 1
  }

  const doodles =
    opts.doodles === false
      ? []
      : planDoodles(rand, doodleSet(opts.decor), keepOut, W, H, [accentHex, rgbHex(accent2)])
  const raw = doodles.length
    ? await sharp(out, { raw: { width: W, height: H, channels: 3 } })
        .composite([{ input: doodlesSvg(W, H, doodles, rgbHex(inkC), opts.seed >>> 0) }])
        .removeAlpha()
        .raw()
        .toBuffer()
    : out
  return { raw, width: W, height: H, doodles, keepOut, subject }
}

/** The game photo with its background, in the doodle frame: a 4:5 JPEG. */
export async function doodleFramePhoto(photo: Buffer, opts: DoodleFrameOptions): Promise<Buffer> {
  const r = await renderDoodleFrame(photo, 'bg', opts)
  return toJpeg(r)
}
/** The cut subject (transparent PNG from the browser) in the doodle frame: a 4:5 JPEG. */
export async function doodleFrameCutout(cutout: Buffer, opts: DoodleFrameOptions): Promise<Buffer> {
  const r = await renderDoodleFrame(cutout, 'cut', opts)
  return toJpeg(r)
}
function toJpeg(r: FrameRender) {
  return sharp(r.raw, { raw: { width: r.width, height: r.height, channels: 3 } })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
}
