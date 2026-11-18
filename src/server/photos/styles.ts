// PROTOTYPE: photo style treatments for the owner to choose from (none is live yet; the live
// converter is still `illustrate` / `illustrateCutout`). Each style renders a 4:5 JPEG from the
// buyer's photo, with its background ("bg") and/or from the browser cutout ("cut").
// Everything is plain sharp plus raw pixel work and SVG overlays: no model, no network.
// Showcase: scripts/photo-styles-showcase.ts renders every style on sample photos.
import sharp, { type OverlayOptions } from 'sharp'
import { alphaBox, ILLUSTRATED_ASPECT, paint, type Rgb, subjectWindow } from './illustrate.ts'

export type StyleMode = 'bg' | 'cut'
export interface StyleInput {
  photo: Buffer
  /** Transparent PNG of the subject (src/web/shared/cutout.ts). Required for 'cut'. */
  cutout?: Buffer | null
}
export interface StylePalette {
  paper: Rgb
  ink: Rgb
  accent: Rgb
  /** A second print color (riso, pop art, paper layers). */
  second: Rgb
  /** A third, light color (washi tape, sunburst). */
  sun: Rgb
}
export interface StyleOptions {
  width?: number
  palette?: Partial<StylePalette>
  seed?: number
  /** PNG icons to scatter round the subject (occasion doodles). */
  icons?: Buffer[]
}
export interface PhotoStyle {
  no: number
  id: string
  /** Short Hebrew name and one Hebrew line, for the owner's choice. */
  name: string
  line: string
  modes: StyleMode[]
  render(input: StyleInput, mode: StyleMode, opts?: StyleOptions): Promise<Buffer>
}

const hex = (h: string): Rgb => ({
  r: Number.parseInt(h.slice(1, 3), 16),
  g: Number.parseInt(h.slice(3, 5), 16),
  b: Number.parseInt(h.slice(5, 7), 16),
})
const css = (c: Rgb, a = 1) => `rgba(${c.r},${c.g},${c.b},${a})`
/** The Carmel map's colors: warm paper, brown-black ink, market red, a riso blue, a sunny yellow. */
export const DEFAULT_STYLE_PALETTE: StylePalette = {
  paper: hex('#FCF3E3'),
  ink: hex('#2B2420'),
  accent: hex('#B4161B'),
  second: hex('#1F5E8C'),
  sun: hex('#F4C75F'),
}

// ---------- shared helpers ----------

interface Ctx {
  W: number
  H: number
  pal: StylePalette
  rand: () => number
  opts: StyleOptions
}
function ctxOf(opts: StyleOptions = {}): Ctx {
  const W = Math.round(opts.width ?? 800)
  const H = Math.round(W / ILLUSTRATED_ASPECT)
  let s = opts.seed ?? 20251118
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  return { W, H, pal: { ...DEFAULT_STYLE_PALETTE, ...opts.palette }, rand, opts }
}
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))
const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** RGB raw of the photo cropped to W x H around its subject (sharp's attention strategy). */
async function framePhoto(photo: Buffer, W: number, H: number) {
  return sharp(photo)
    .rotate()
    .flatten({ background: '#FCF3E3' })
    .resize(W, H, { fit: 'cover', position: sharp.strategy.attention })
    .removeAlpha()
    .toColorspace('srgb')
    .raw()
    .toBuffer()
}

/** RGBA raw of the cutout framed on its silhouette, W x H, with `margin` round the subject. */
async function frameCutout(cutout: Buffer, W: number, H: number) {
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
  return sharp(padded, {
    raw: {
      width: info.width + pad.left + pad.right,
      height: info.height + pad.top + pad.bottom,
      channels: 4,
    },
  })
    .extract({ left: win.left + pad.left, top: win.top + pad.top, width: win.width, height: win.height })
    .resize(W, H, { fit: 'fill' })
    .raw()
    .toBuffer()
}

/** The subject for a mode: RGB pixels and an alpha (all 255 with the background). */
async function source(
  input: StyleInput,
  mode: StyleMode,
  W: number,
  H: number,
  paper = DEFAULT_STYLE_PALETTE.paper,
) {
  const rgb = Buffer.alloc(W * H * 3)
  const alpha = Buffer.alloc(W * H, 255)
  if (mode === 'cut') {
    if (!input.cutout) throw new Error('this style needs a cutout')
    const rgba = await frameCutout(input.cutout, W, H)
    // Outside the subject the pixels are paper, so blurs and filters never pull in black.
    for (let i = 0; i < W * H; i++) {
      const a = rgba[i * 4 + 3] / 255
      rgb[i * 3] = clamp(mix(paper.r, rgba[i * 4], a))
      rgb[i * 3 + 1] = clamp(mix(paper.g, rgba[i * 4 + 1], a))
      rgb[i * 3 + 2] = clamp(mix(paper.b, rgba[i * 4 + 2], a))
      alpha[i] = rgba[i * 4 + 3]
    }
  } else (await framePhoto(input.photo, W, H)).copy(rgb)
  return { rgb, alpha }
}

async function blurGrey(buf: Buffer, W: number, H: number, sigma: number) {
  if (sigma < 0.3) return Buffer.from(buf)
  return sharp(buf, { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma)
    .greyscale()
    .raw()
    .toBuffer()
}
async function blurRgb(buf: Buffer, W: number, H: number, sigma: number) {
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .blur(sigma)
    .raw()
    .toBuffer()
}
function greyOf(rgb: Buffer, W: number, H: number) {
  const g = Buffer.alloc(W * H)
  for (let i = 0; i < W * H; i++) g[i] = clamp(lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) * 255)
  return g
}
/** Local contrast normalisation: stretches the 2nd..98th percentile of a grey image to 0..255. */
function stretch(g: Buffer, alpha?: Buffer) {
  const hist = new Array(256).fill(0)
  let n = 0
  for (let i = 0; i < g.length; i++)
    if (!alpha || alpha[i] > 128) {
      hist[g[i]]++
      n++
    }
  let lo = 0
  let hi = 255
  for (let a = 0, s = 0; a < 256; a++) {
    s += hist[a]
    if (s > n * 0.02) {
      lo = a
      break
    }
  }
  for (let a = 255, s = 0; a >= 0; a--) {
    s += hist[a]
    if (s > n * 0.02) {
      hi = a
      break
    }
  }
  const out = Buffer.alloc(g.length)
  for (let i = 0; i < g.length; i++) out[i] = clamp(((g[i] - lo) / Math.max(1, hi - lo)) * 255)
  return out
}

/** Sobel edge strength 0..1 of a grey image, after a blur; busy textures damped. */
async function edgesOf(g: Buffer, W: number, H: number, sigma = 1.6) {
  const s = await blurGrey(g, W, H, sigma)
  const e = new Float32Array(W * H)
  let max = 1
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      const gx = -s[i - W - 1] - 2 * s[i - 1] - s[i + W - 1] + s[i - W + 1] + 2 * s[i + 1] + s[i + W + 1]
      const gy = -s[i - W - 1] - 2 * s[i - W] - s[i - W + 1] + s[i + W - 1] + 2 * s[i + W] + s[i + W + 1]
      e[i] = Math.hypot(gx, gy)
      if (e[i] > max) max = e[i]
    }
  const e8 = Buffer.alloc(W * H)
  for (let i = 0; i < W * H; i++) e8[i] = clamp((e[i] / max) * 255)
  const dens = await blurGrey(e8, W, H, Math.max(2, W / 90))
  const out = new Float32Array(W * H)
  const sample: number[] = []
  for (let i = 0; i < W * H; i++) {
    out[i] = Math.max(0, e8[i] - 1.3 * dens[i])
    if (i % 7 === 0) sample.push(out[i])
  }
  sample.sort((a, b) => a - b)
  const hi = Math.max(sample[Math.floor(sample.length * 0.92)] || 1, 12)
  for (let i = 0; i < W * H; i++) out[i] = smooth(hi * 0.5, hi, out[i])
  return out
}

/** Paper: the base color, a slow mottle and a fine grain. RGB raw. */
async function paperOf(c: Ctx, color: Rgb = c.pal.paper, mottle = 10) {
  const { W, H, rand } = c
  const small = Buffer.alloc(Math.ceil(W / 8) * Math.ceil(H / 8))
  for (let i = 0; i < small.length; i++) small[i] = Math.round(rand() * 255)
  const blot = await sharp(small, { raw: { width: Math.ceil(W / 8), height: Math.ceil(H / 8), channels: 1 } })
    .resize(W, H, { kernel: 'cubic' })
    .blur(6)
    .greyscale()
    .raw()
    .toBuffer()
  const out = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    const d = ((blot[i] - 128) / 128) * mottle + (rand() - 0.5) * 8
    out[i * 3] = clamp(color.r + d)
    out[i * 3 + 1] = clamp(color.g + d)
    out[i * 3 + 2] = clamp(color.b + d * 1.1)
  }
  return out
}

/** The alpha grown by `r` pixels (blur, then a threshold), optionally ragged. */
async function grow(alpha: Buffer, W: number, H: number, r: number, c?: Ctx, ragged = 0) {
  const b = await blurGrey(alpha, W, H, r / 2)
  const out = Buffer.alloc(W * H)
  let noise: Buffer | null = null
  if (c && ragged) {
    const sw = Math.ceil(W / 6)
    const sh = Math.ceil(H / 6)
    const small = Buffer.alloc(sw * sh)
    for (let i = 0; i < small.length; i++) small[i] = Math.round(c.rand() * 255)
    noise = await sharp(small, { raw: { width: sw, height: sh, channels: 1 } })
      .resize(W, H)
      .greyscale()
      .raw()
      .toBuffer()
  }
  for (let i = 0; i < W * H; i++) {
    const t = Math.max(10, 18 + (noise ? ((noise[i] - 128) / 128) * ragged : 0))
    out[i] = clamp(smooth(t - 6, t + 6, b[i]) * 255)
  }
  return out
}
/** Shifts a 1-channel buffer by (dx, dy), filling with 0. */
function shift(a: Buffer, W: number, H: number, dx: number, dy: number) {
  const out = Buffer.alloc(W * H)
  for (let y = 0; y < H; y++) {
    const sy = y - dy
    if (sy < 0 || sy >= H) continue
    for (let x = 0; x < W; x++) {
      const sx = x - dx
      if (sx >= 0 && sx < W) out[y * W + x] = a[sy * W + sx]
    }
  }
  return out
}
/** Paints `color` over `dst` (RGB raw) with coverage `a` (0..255 buffer or 0..1 floats). */
function over(dst: Buffer, color: Rgb | Buffer, a: Buffer | Float32Array, scale = 1, multiply = false) {
  const n = a.length
  const f = a instanceof Float32Array ? 1 : 1 / 255
  for (let i = 0; i < n; i++) {
    const t = a[i] * f * scale
    if (t <= 0) continue
    for (let ch = 0; ch < 3; ch++) {
      const c = Buffer.isBuffer(color)
        ? color[i * 3 + ch]
        : ch === 0
          ? (color as Rgb).r
          : ch === 1
            ? (color as Rgb).g
            : (color as Rgb).b
      const d = dst[i * 3 + ch]
      dst[i * 3 + ch] = clamp(mix(d, multiply ? (d * c) / 255 : c, Math.min(1, t)))
    }
  }
}
async function jpeg(rgb: Buffer, c: Ctx, overlays: OverlayOptions[] = []) {
  return sharp(rgb, { raw: { width: c.W, height: c.H, channels: 3 } })
    .composite(overlays)
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
}
const svg = (c: Ctx, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${c.W}" height="${c.H}">${body}</svg>`)

/** A torn-paper polygon round a rectangle, as an SVG path. */
function tornPath(c: Ctx, x: number, y: number, w: number, h: number, jag = 0.012) {
  const pts: string[] = []
  const j = () => (c.rand() - 0.5) * c.W * jag * 2
  const steps = 18
  for (let i = 0; i <= steps; i++) pts.push(`${x + (w * i) / steps + j()},${y + j()}`)
  for (let i = 1; i <= steps; i++) pts.push(`${x + w + j()},${y + (h * i) / steps + j()}`)
  for (let i = steps - 1; i >= 0; i--) pts.push(`${x + (w * i) / steps + j()},${y + h + j()}`)
  for (let i = steps - 1; i > 0; i--) pts.push(`${x + j()},${y + (h * i) / steps + j()}`)
  return `M${pts.join(' L')} Z`
}
/** A wobbly hand-drawn line path between two points. */
function wobble(c: Ctx, x1: number, y1: number, x2: number, y2: number, amp = 3) {
  const mx = (x1 + x2) / 2 + (c.rand() - 0.5) * amp * 2
  const my = (y1 + y2) / 2 + (c.rand() - 0.5) * amp * 2
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`
}

/** Posterised subject: median smoothed and flattened to `colors` colors. RGB raw. */
async function flatten(rgb: Buffer, W: number, H: number, colors: number, sat = 1.15) {
  const png = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .median(5)
    .modulate({ saturation: sat })
    .png({ palette: true, colours: colors, dither: 0 })
    .toBuffer()
  return sharp(png).removeAlpha().raw().toBuffer()
}

/** Composites a subject (rgb + alpha) over a background (rgb). */
function place(bg: Buffer, rgb: Buffer, alpha: Buffer) {
  over(bg, rgb, alpha)
  return bg
}

// ---------- the styles ----------

async function sticker(input: StyleInput, _m: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const { rgb, alpha } = await source(input, 'cut', W, H)
  // Shrink the subject a little so the sticker border fits in the frame.
  const s = 0.86
  const shrink = async (buf: Buffer, ch: 1 | 3) =>
    sharp(buf, { raw: { width: W, height: H, channels: ch } })
      .resize(Math.round(W * s), Math.round(H * s))
      .extend({
        top: Math.round((H * (1 - s)) / 2),
        bottom: H - Math.round(H * s) - Math.round((H * (1 - s)) / 2),
        left: Math.round((W * (1 - s)) / 2),
        right: W - Math.round(W * s) - Math.round((W * (1 - s)) / 2),
        background: ch === 1 ? { r: 0, g: 0, b: 0 } : pal.paper,
      })
      .greyscale(ch === 1)
      .raw()
      .toBuffer()
  const a = await shrink(alpha, 1)
  const painted = await paint(await shrink(rgb, 3), W, H, { paper: pal.paper, ink: pal.ink, colors: 18 })
  const border = await grow(a, W, H, W / 22)
  const shadow = await blurGrey(shift(border, W, H, Math.round(W / 70), Math.round(W / 45)), W, H, W / 90)
  const out = await paperOf(c)
  over(out, pal.ink, shadow, 0.28)
  over(out, { r: 255, g: 255, b: 255 }, border)
  // A thin grey die-cut line at the border's edge.
  const edge = Buffer.alloc(W * H)
  for (let i = 0; i < W * H; i++) edge[i] = border[i] > 20 && border[i] < 200 ? 160 : 0
  over(out, { r: 200, g: 196, b: 188 }, edge, 0.6)
  place(out, painted, a)
  return jpeg(out, c)
}

async function riso(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal, rand } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const g = stretch(await blurGrey(greyOf(rgb, W, H), W, H, 1.1), mode === 'cut' ? alpha : undefined)
  // Ink A (blue): shadows and lines. Ink B (fluo pink): midtones, printed a few pixels off.
  const pink = { r: 0xff, g: 0x48, b: 0x8e }
  const blue = pal.second
  const out = await paperOf(c, pal.paper, 6)
  const a = new Float32Array(W * H)
  const b = new Float32Array(W * H)
  const edges = await edgesOf(greyOf(rgb, W, H), W, H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const al = alpha[i] / 255
      const v = g[i] / 255
      // Stochastic grain, like a riso drum.
      const n = rand()
      a[i] = al * Math.max(edges[i] * 0.9, (1 - v) ** 1.6 > n * 0.9 + 0.08 ? 0.92 : 0)
      b[i] = al * (Math.sin(Math.PI * Math.min(1, v * 1.1)) * 0.95 > n * 0.85 + 0.1 ? 0.85 : 0)
    }
  const bShift = Buffer.from(b.map((v) => v * 255))
  over(out, pink, shift(bShift, W, H, 4, 3), 1, true)
  over(out, blue, a, 1, true)
  if (mode === 'cut') {
    // A pink block behind the subject, like a second pass on the drum.
    const block = await grow(alpha, W, H, W / 14)
    const off = shift(block, W, H, -Math.round(W / 30), Math.round(W / 40))
    const halo = Buffer.alloc(W * H)
    for (let i = 0; i < W * H; i++) halo[i] = alpha[i] > 30 ? 0 : off[i] * 0.55
    over(out, pink, halo, 1, true)
  }
  return jpeg(out, c)
}

async function halftone(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const flat = await flatten(rgb, W, H, 6, 1.5)
  const g = stretch(greyOf(await blurRgb(rgb, W, H, 1.2), W, H), mode === 'cut' ? alpha : undefined)
  const edges = await edgesOf(greyOf(rgb, W, H), W, H, 1.4)
  const out = await paperOf(c, mode === 'cut' ? pal.sun : pal.paper, 4)
  if (mode === 'cut') {
    // Comic background: big red dots on yellow.
    const cell = W / 26
    const dots = new Float32Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = (x + y) / Math.SQRT2 / cell
        const v = (x - y) / Math.SQRT2 / cell
        const d = Math.hypot(u - Math.round(u), v - Math.round(v))
        dots[y * W + x] = smooth(0.3, 0.26, d)
      }
    over(out, pal.accent, dots, 0.55)
  }
  // Light, saturated flat color under the dots.
  const lightened = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H * 3; i++) lightened[i] = clamp(flat[i] * 0.75 + 255 * 0.25)
  over(out, lightened, alpha)
  // Black halftone dots, 45 degrees, radius from darkness.
  const cell = W / 70
  const ink = new Float32Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const u = (x + y) / Math.SQRT2 / cell
      const v = (x - y) / Math.SQRT2 / cell
      const d = Math.hypot(u - Math.round(u), v - Math.round(v))
      const r = 0.62 * Math.sqrt(Math.max(0, 1 - g[i] / 255 - 0.08))
      ink[i] = (alpha[i] / 255) * Math.max(smooth(r + 0.06, r - 0.06, d), Math.min(1, edges[i] * 1.2))
    }
  over(out, pal.ink, ink)
  if (mode === 'cut') {
    const line = await grow(alpha, W, H, W / 90)
    const ring = Buffer.alloc(W * H)
    for (let i = 0; i < W * H; i++) ring[i] = alpha[i] > 128 ? 0 : line[i]
    over(out, pal.ink, ring)
  }
  return jpeg(out, c)
}

async function watercolor(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const soft = await flatten(await blurRgb(rgb, W, H, 1.5), W, H, 14, 1.25)
  const wide = await blurRgb(soft, W, H, W / 160)
  // Pigment pools at the edges of each wash (the difference between a blur and the flat color).
  const wash = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H * 3; i++) {
    const p = i % 3 === 0 ? pal.paper.r : i % 3 === 1 ? pal.paper.g : pal.paper.b
    const pool = Math.max(0, wide[i] - soft[i]) * 0.9
    wash[i] = clamp((mix(soft[i], p, 0.28) - pool) * (0.62 + (0.38 * p) / 255))
  }
  const out = await paperOf(c, pal.paper, 14)
  let a = alpha
  if (mode === 'cut')
    a = await grow(alpha, W, H, W / 60, c, 30) // the wash bleeds past the outline
  else {
    // Wet edges fading to paper at the borders.
    a = Buffer.alloc(W * H)
    const m = W * 0.05
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.min(x, y, W - 1 - x, H - 1 - y)
        a[y * W + x] = clamp(smooth(0, m, d + (c.rand() - 0.5) * m * 0.8) * 255)
      }
  }
  over(out, wash, await blurGrey(a, W, H, 1.2), 1, true)
  // A light pencil line on top.
  const edges = await edgesOf(greyOf(rgb, W, H), W, H, 1.8)
  for (let i = 0; i < W * H; i++) edges[i] *= (alpha[i] / 255) * 0.45
  over(out, pal.ink, edges)
  return jpeg(out, c)
}

async function inkSketch(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const g = greyOf(rgb, W, H)
  const edges = await edgesOf(g, W, H, 1.3)
  const fine = await edgesOf(g, W, H, 0.8)
  const s = stretch(await blurGrey(g, W, H, 2), mode === 'cut' ? alpha : undefined)
  const out = await paperOf(c, pal.paper, 8)
  // One grey wash for the shadows, then ink.
  const shade = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) shade[i] = (alpha[i] / 255) * smooth(0.45, 0.2, s[i] / 255) * 0.35
  over(out, pal.ink, shade)
  const ink = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) ink[i] = (alpha[i] / 255) * Math.min(1, edges[i] + fine[i] * 0.35)
  over(out, pal.ink, ink)
  if (mode === 'cut') {
    const line = await grow(alpha, W, H, W / 200)
    const ring = new Float32Array(W * H)
    for (let i = 0; i < W * H; i++) ring[i] = (line[i] / 255) * (1 - alpha[i] / 255)
    over(out, pal.ink, ring, 0.9)
  }
  return jpeg(out, c)
}

async function linocut(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal, rand } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const g = stretch(await blurGrey(greyOf(rgb, W, H), W, H, 2.2), mode === 'cut' ? alpha : undefined)
  const edges = await edgesOf(greyOf(rgb, W, H), W, H, 2)
  const out = await paperOf(c, pal.paper, 6)
  if (mode === 'cut') {
    // A red printed block behind the subject, its edge carved by hand.
    const path = tornPath(c, W * 0.08, H * 0.1, W * 0.84, H * 0.8, 0.008)
    const block = await sharp(svg(c, `<path d="${path}" fill="${css(pal.accent)}"/>`))
      .raw()
      .toBuffer()
    for (let i = 0; i < W * H; i++) {
      const t = (block[i * 4 + 3] / 255) * (0.85 + rand() * 0.15)
      for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = clamp(mix(out[i * 3 + ch], block[i * 4 + ch], t))
    }
  }
  // Ink: solid in the darks, carved lines following the tone in the mids, bare in the lights.
  const ink = new Float32Array(W * H)
  const period = W / 80
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const v = g[i] / 255
      const wave = Math.sin(((y + Math.sin(x / (W / 9)) * period * 1.5) / period) * Math.PI * 2) * 0.5 + 0.5
      const t = v < 0.3 ? 1 : v > 0.72 ? 0 : wave > (v - 0.3) / 0.42 ? 1 : 0
      ink[i] = (alpha[i] / 255) * Math.max(t, edges[i] > 0.5 ? 1 : 0) * (rand() > 0.04 ? 1 : 0.5)
    }
  const paperIn = mode === 'cut' ? pal.paper : null
  if (paperIn) over(out, paperIn, alpha)
  over(out, pal.ink, ink)
  return jpeg(out, c)
}

async function popArt(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H } = c
  const hw = Math.floor(W / 2)
  const hh = Math.floor(H / 2)
  const { rgb, alpha } = await source(input, mode, hw, Math.round(hw / ILLUSTRATED_ASPECT))
  const sh = Math.round(hw / ILLUSTRATED_ASPECT)
  const g = stretch(await blurGrey(greyOf(rgb, hw, sh), hw, sh, 1.2), mode === 'cut' ? alpha : undefined)
  const sets: [string, string, string, string][] = [
    // background, dark, mid, light
    ['#F4C75F', '#2B2420', '#B4161B', '#FFF4D6'],
    ['#7CC4C2', '#1F3A5F', '#FF488E', '#FFFFFF'],
    ['#FF488E', '#2B2420', '#F4C75F', '#FFF4D6'],
    ['#B4161B', '#1F1A17', '#7CC4C2', '#FCE9C8'],
  ]
  const tiles: OverlayOptions[] = []
  for (let k = 0; k < 4; k++) {
    const [bg, dark, midc, light] = sets[k].map(hex)
    const t = Buffer.alloc(hw * sh * 3)
    for (let i = 0; i < hw * sh; i++) {
      const v = g[i] / 255
      const col = v < 0.33 ? dark : v < 0.62 ? midc : light
      const a = alpha[i] / 255
      t[i * 3] = clamp(mix(bg.r, col.r, a))
      t[i * 3 + 1] = clamp(mix(bg.g, col.g, a))
      t[i * 3 + 2] = clamp(mix(bg.b, col.b, a))
    }
    const tile = await sharp(t, { raw: { width: hw, height: sh, channels: 3 } })
      .resize(hw, hh, { fit: 'cover' })
      .png()
      .toBuffer()
    tiles.push({ input: tile, left: (k % 2) * hw, top: Math.floor(k / 2) * hh })
  }
  const base = Buffer.alloc(W * H * 3, 255)
  const grid = svg(
    c,
    `<g stroke="#2B2420" stroke-width="${W / 90}" stroke-linecap="round" fill="none">
      <path d="${wobble(c, hw, 0, hw, H, 4)}"/><path d="${wobble(c, 0, hh, W, hh, 4)}"/>
      <rect x="${W / 180}" y="${W / 180}" width="${W - W / 90}" height="${H - W / 90}"/></g>`,
  )
  return jpeg(base, c, [...tiles, { input: grid }])
}

async function marketPoster(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal, rand } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const g = stretch(await blurGrey(greyOf(rgb, W, H), W, H, 1.6), mode === 'cut' ? alpha : undefined)
  const out = await paperOf(c, hex('#F3E2C0'), 12)
  if (mode === 'cut') {
    // Sun rays behind the subject.
    const cx = W / 2
    const cy = H * 0.42
    const rays: string[] = []
    for (let k = 0; k < 18; k++) {
      const a0 = (k / 18) * Math.PI * 2
      const a1 = a0 + Math.PI / 18
      const R = H
      rays.push(
        `<path d="M${cx},${cy} L${cx + R * Math.cos(a0)},${cy + R * Math.sin(a0)} L${cx + R * Math.cos(a1)},${cy + R * Math.sin(a1)} Z"/>`,
      )
    }
    const ray = await sharp(svg(c, `<g fill="${css(pal.sun, 0.75)}">${rays.join('')}</g>`))
      .raw()
      .toBuffer()
    for (let i = 0; i < W * H; i++)
      for (let ch = 0; ch < 3; ch++)
        out[i * 3 + ch] = clamp(mix(out[i * 3 + ch], ray[i * 4 + ch], ray[i * 4 + 3] / 255))
  }
  // Four flat inks by tone: dark brown, market red, ochre, cream; worn where the press missed.
  const tones = [pal.ink, pal.accent, hex('#D9902F'), hex('#F8EBD0')]
  const ink = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    const v = g[i] / 255
    const col = tones[v < 0.28 ? 0 : v < 0.5 ? 1 : v < 0.74 ? 2 : 3]
    ink[i * 3] = col.r
    ink[i * 3 + 1] = col.g
    ink[i * 3 + 2] = col.b
  }
  const worn = Buffer.alloc(W * H)
  for (let i = 0; i < W * H; i++) worn[i] = rand() < 0.06 ? alpha[i] * 0.55 : alpha[i]
  over(out, ink, worn)
  // A printed double border.
  const m = W * 0.04
  const frame = svg(
    c,
    `<g fill="none" stroke="${css(pal.ink)}" stroke-linecap="round">
      <rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" stroke-width="${W / 80}"/>
      <rect x="${m * 1.6}" y="${m * 1.6}" width="${W - 3.2 * m}" height="${H - 3.2 * m}" stroke-width="${W / 300}"/></g>`,
  )
  return jpeg(out, c, [{ input: frame }])
}

async function stamp(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const m = Math.round(W * 0.1)
  const iw = W - 2 * m
  const ih = H - 2 * m - Math.round(W * 0.06)
  const { rgb, alpha } = await source(input, mode, iw, Math.round(iw / ILLUSTRATED_ASPECT))
  const sh = Math.round(iw / ILLUSTRATED_ASPECT)
  const g = stretch(await blurGrey(greyOf(rgb, iw, sh), iw, sh, 0.8), mode === 'cut' ? alpha : undefined)
  // Engraved duotone: deep red ink on cream, fine horizontal engraving lines.
  const img = Buffer.alloc(iw * sh * 3)
  const bgc = mode === 'cut' ? hex('#F6D9A8') : pal.paper
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < iw; x++) {
      const i = y * iw + x
      const v = g[i] / 255
      const line = Math.sin((y / (iw / 140)) * Math.PI) * 0.5 + 0.5
      const t = (1 - v) ** 1.2 > line * 0.85 ? 0.95 : 0.12
      const a = alpha[i] / 255
      const col = {
        r: mix(pal.paper.r, pal.accent.r * 0.8, t),
        g: mix(pal.paper.g, 20, t),
        b: mix(pal.paper.b, 30, t),
      }
      img[i * 3] = clamp(mix(bgc.r, col.r, a))
      img[i * 3 + 1] = clamp(mix(bgc.g, col.g, a))
      img[i * 3 + 2] = clamp(mix(bgc.b, col.b, a))
    }
  const pic = await sharp(img, { raw: { width: iw, height: sh, channels: 3 } })
    .resize(iw, ih, { fit: 'cover' })
    .png()
    .toBuffer()
  // The stamp: white paper with perforated edges, on the page paper.
  const r = W / 60
  const holes: string[] = []
  for (let x = r; x < W; x += r * 2.6)
    holes.push(`<circle cx="${x}" cy="0" r="${r}"/><circle cx="${x}" cy="${H}" r="${r}"/>`)
  for (let y = r; y < H; y += r * 2.6)
    holes.push(`<circle cx="0" cy="${y}" r="${r}"/><circle cx="${W}" cy="${y}" r="${r}"/>`)
  const sheet = svg(
    c,
    `<defs><mask id="p"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${holes.join('')}</g></mask></defs>
     <rect x="${r * 0.4}" y="${r * 0.4}" width="${W - r * 0.8}" height="${H - r * 0.8}" fill="#FFFDF8" mask="url(#p)"/>`,
  )
  // A postmark over one corner: rings and wavy cancel lines.
  const pm = svg(
    c,
    `<g fill="none" stroke="${css(pal.ink, 0.55)}" stroke-width="${W / 200}">
      <circle cx="${W * 0.78}" cy="${H * 0.2}" r="${W * 0.15}"/><circle cx="${W * 0.78}" cy="${H * 0.2}" r="${W * 0.11}"/>
      ${[0, 1, 2, 3]
        .map((k) => {
          const y = H * 0.14 + k * W * 0.035
          return `<path d="M${W * 0.35},${y} q${W * 0.04},${-W * 0.025} ${W * 0.08},0 t${W * 0.08},0 t${W * 0.08},0 t${W * 0.08},0"/>`
        })
        .join('')}</g>`,
  )
  const base = await paperOf(c, pal.paper, 6)
  return jpeg(base, c, [{ input: sheet }, { input: pic, left: m, top: m }, { input: pm }])
}

async function polaroid(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal, rand } = c
  const fw = Math.round(W * 0.78)
  const pad = Math.round(fw * 0.06)
  const iw = fw - 2 * pad
  const ih = Math.round(iw * 1.0)
  const fh = ih + pad + Math.round(fw * 0.22)
  const { rgb, alpha } = await source(input, mode, iw, Math.round(iw / ILLUSTRATED_ASPECT))
  const sh = Math.round(iw / ILLUSTRATED_ASPECT)
  // Faded instant film: lifted blacks, warm highlights, soft vignette, grain.
  const img = Buffer.alloc(iw * sh * 3)
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < iw; x++) {
      const i = y * iw + x
      const d = Math.hypot(x / iw - 0.5, y / sh - 0.5)
      const vig = 1 - smooth(0.35, 0.75, d) * 0.25
      const n = (rand() - 0.5) * 14
      const a = alpha[i] / 255
      const bgc = hex('#EFE3CC')
      const r = (rgb[i * 3] * 0.82 + 38) * vig * 1.02 + n
      const g = (rgb[i * 3 + 1] * 0.8 + 34) * vig + n
      const b = (rgb[i * 3 + 2] * 0.72 + 40) * vig * 0.95 + n
      img[i * 3] = clamp(mix(bgc.r, r, a))
      img[i * 3 + 1] = clamp(mix(bgc.g, g, a))
      img[i * 3 + 2] = clamp(mix(bgc.b, b, a))
    }
  const pic = await sharp(img, { raw: { width: iw, height: sh, channels: 3 } })
    .resize(iw, ih, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer()
  const frame = await sharp({ create: { width: fw, height: fh, channels: 4, background: '#FFFEFA' } })
    .composite([{ input: pic, left: pad, top: pad }])
    .png()
    .toBuffer()
  const rotated = await sharp(frame)
    .rotate(-4, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true })
  const left = Math.round((W - rotated.info.width) / 2)
  const top = Math.round((H - rotated.info.height) / 2)
  const shadow = await sharp(rotated.data).extractChannel(3).toColourspace('b-w').raw().toBuffer()
  const base = await paperOf(c, pal.paper, 10)
  const sh2 = Buffer.alloc(W * H)
  for (let y = 0; y < rotated.info.height; y++)
    for (let x = 0; x < rotated.info.width; x++) {
      const X = x + left + Math.round(W / 60)
      const Y = y + top + Math.round(W / 40)
      if (X >= 0 && Y >= 0 && X < W && Y < H) sh2[Y * W + X] = shadow[y * rotated.info.width + x]
    }
  over(base, pal.ink, await blurGrey(sh2, W, H, W / 80), 0.22)
  const tapeW = W * 0.26
  const tape = (x: number, y: number, rot: number, col: string) =>
    `<g transform="translate(${x},${y}) rotate(${rot})"><path d="M${-tapeW / 2},-${W * 0.03} L${tapeW / 2},-${W * 0.035} L${tapeW / 2 - 4},${W * 0.032} L${-tapeW / 2 + 3},${W * 0.03} Z" fill="${col}"/></g>`
  const tapes = svg(
    c,
    tape(left + rotated.info.width * 0.18, top + W * 0.02, -32, css(pal.sun, 0.72)) +
      tape(left + rotated.info.width * 0.85, top + W * 0.05, 28, css(pal.accent, 0.35)),
  )
  // Handwritten-ish underline on the polaroid's bottom margin.
  const scribble = svg(
    c,
    `<path d="${wobble(c, W * 0.3, top + rotated.info.height * 0.9, W * 0.68, top + rotated.info.height * 0.88, 6)}" stroke="${css(pal.ink, 0.6)}" stroke-width="${W / 200}" fill="none" stroke-linecap="round"/>`,
  )
  return jpeg(base, c, [{ input: rotated.data, left, top }, { input: tapes }, { input: scribble }])
}

async function collage(input: StyleInput, _m: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const { rgb, alpha } = await source(input, 'cut', W, H)
  const base = await paperOf(c, pal.paper, 12)
  // Three torn scraps of colored paper behind, each with a thin white torn edge.
  const scraps = [
    { x: 0.04, y: 0.08, w: 0.6, h: 0.42, col: hex('#7CC4C2'), rot: -7 },
    { x: 0.36, y: 0.3, w: 0.58, h: 0.46, col: pal.sun, rot: 5 },
    { x: 0.1, y: 0.58, w: 0.74, h: 0.34, col: hex('#F29BAA'), rot: -3 },
  ]
  const body = scraps
    .map((s) => {
      const p = tornPath(c, s.x * W, s.y * H, s.w * W, s.h * H, 0.014)
      return `<g transform="rotate(${s.rot} ${W / 2} ${H / 2})"><path d="${p}" fill="#FFFDF7" transform="translate(${W * 0.006},${W * 0.008})"/><path d="${p}" fill="${css(s.col)}"/></g>`
    })
    .join('')
  const layer = await sharp(svg(c, body)).raw().toBuffer()
  for (let i = 0; i < W * H; i++)
    for (let ch = 0; ch < 3; ch++)
      base[i * 3 + ch] = clamp(mix(base[i * 3 + ch], layer[i * 4 + ch], layer[i * 4 + 3] / 255))
  // The subject, cut out by hand: a ragged white margin and a soft shadow.
  const margin = await grow(alpha, W, H, W / 34, c, 40)
  const shadow = await blurGrey(shift(margin, W, H, Math.round(W / 90), Math.round(W / 60)), W, H, W / 120)
  over(base, pal.ink, shadow, 0.25)
  over(base, { r: 255, g: 253, b: 247 }, margin)
  const flat = await flatten(rgb, W, H, 24, 1.1)
  place(base, flat, alpha)
  // A strip of washi across the top.
  const washi = svg(
    c,
    `<path d="${tornPath(c, W * 0.34, H * 0.03, W * 0.32, H * 0.05, 0.004)}" fill="${css(pal.accent, 0.45)}" transform="rotate(-6 ${W / 2} ${H * 0.05})"/>`,
  )
  return jpeg(base, c, [{ input: washi }])
}

async function duotone(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const g = stretch(await blurGrey(greyOf(rgb, W, H), W, H, 0.7), mode === 'cut' ? alpha : undefined)
  const out = await paperOf(c, pal.paper, 8)
  if (mode === 'cut') {
    // A soft round blot of the light tone behind the subject.
    const blot = await sharp(
      svg(
        c,
        `<ellipse cx="${W / 2}" cy="${H * 0.48}" rx="${W * 0.44}" ry="${H * 0.4}" fill="${css(pal.sun, 0.55)}"/>`,
      ),
    )
      .blur(W / 50)
      .raw()
      .toBuffer()
    for (let i = 0; i < W * H; i++)
      for (let ch = 0; ch < 3; ch++)
        out[i * 3 + ch] = clamp(mix(out[i * 3 + ch], blot[i * 4 + ch], blot[i * 4 + 3] / 255))
  }
  // Ink in the shadows, the map's red in the midtones, paper in the light.
  const img = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    const v = g[i] / 255
    const a = v < 0.5 ? v / 0.5 : (v - 0.5) / 0.5
    const [c0, c1] = v < 0.5 ? [pal.ink, pal.accent] : [pal.accent, pal.paper]
    const t = smooth(0, 1, a)
    img[i * 3] = clamp(mix(c0.r, c1.r, t))
    img[i * 3 + 1] = clamp(mix(c0.g, c1.g, t))
    img[i * 3 + 2] = clamp(mix(c0.b, c1.b, t))
  }
  over(out, img, alpha)
  return jpeg(out, c)
}

async function pencil(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, rand } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const g = stretch(await blurGrey(greyOf(rgb, W, H), W, H, 2.4), mode === 'cut' ? alpha : undefined)
  const edges = await edgesOf(greyOf(rgb, W, H), W, H, 1.4)
  const out = await paperOf(c, hex('#FBF7EE'), 6)
  const graphite = hex('#3C3A3E')
  const p = W / 110
  const hatch = new Float32Array(W * H)
  const layers: [number, number][] = [
    [Math.PI / 4, 0.78],
    [-Math.PI / 4, 0.56],
    [0, 0.38],
    [Math.PI / 2.4, 0.22],
  ]
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const v = g[i] / 255
      let t = 0
      for (const [ang, th] of layers) {
        if (v >= th) continue
        const proj = x * Math.cos(ang) + y * Math.sin(ang)
        const s = Math.abs(Math.sin((proj / p) * Math.PI))
        const width = 0.22 + (th - v) * 0.9
        if (s < width) t = Math.min(1, t + 0.42 + rand() * 0.2)
      }
      hatch[i] = (alpha[i] / 255) * Math.max(t * 0.85, edges[i] * 0.95)
    }
  over(out, graphite, hatch)
  if (mode === 'cut') {
    const line = await grow(alpha, W, H, W / 260)
    const ring = new Float32Array(W * H)
    for (let i = 0; i < W * H; i++) ring[i] = (line[i] / 255) * (1 - alpha[i] / 255) * 0.8
    over(out, graphite, ring)
  }
  return jpeg(out, c)
}

/** Hand-drawn doodles (hearts, stars, squiggles, confetti, balloons) in SVG, round a subject. */
function doodleSvg(c: Ctx, color: string) {
  const { W, H, rand } = c
  const sw = W / 140
  const heart = (x: number, y: number, s: number, r: number) =>
    `<path transform="translate(${x},${y}) rotate(${r}) scale(${s})" d="M0,6 C-8,-4 -18,4 0,18 C18,4 8,-4 0,6 Z" fill="none" stroke="${color}" stroke-width="${sw / s}" stroke-linejoin="round"/>`
  const star = (x: number, y: number, s: number, _r = 0) =>
    `<path transform="translate(${x},${y}) scale(${s})" d="M0,-10 L3,-3 L10,-2 L4,3 L6,10 L0,6 L-6,10 L-4,3 L-10,-2 L-3,-3 Z" fill="none" stroke="${color}" stroke-width="${sw / s}" stroke-linejoin="round"/>`
  const squiggle = (x: number, y: number, s: number, _r = 0) =>
    `<path transform="translate(${x},${y}) scale(${s})" d="M0,0 q5,-8 10,0 t10,0 t10,0" fill="none" stroke="${color}" stroke-width="${sw / s}" stroke-linecap="round"/>`
  const balloon = (x: number, y: number, s: number, _r = 0) =>
    `<g transform="translate(${x},${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="${sw / s}" stroke-linecap="round"><ellipse cx="0" cy="0" rx="9" ry="11"/><path d="M0,11 l-2,3 h4 z M0,14 q4,8 -2,14 t2,12"/></g>`
  const parts: string[] = []
  const spots = [
    [0.1, 0.1],
    [0.88, 0.08],
    [0.06, 0.5],
    [0.92, 0.44],
    [0.12, 0.9],
    [0.86, 0.9],
    [0.5, 0.05],
  ]
  const kinds = [heart, star, balloon, squiggle, star, heart, squiggle]
  spots.forEach(([fx, fy], k) => {
    const s = (W / 260) * (0.9 + rand() * 0.6)
    const f = kinds[k]
    parts.push(f(fx * W, fy * H, s, (rand() - 0.5) * 40))
  })
  for (let k = 0; k < 14; k++) {
    const x = rand() * W
    const y = rand() * H
    if (Math.abs(x - W / 2) < W * 0.28 && Math.abs(y - H / 2) < H * 0.33) continue
    parts.push(
      `<path d="M${x},${y} l${W / 90},${(rand() - 0.5) * (W / 90)}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`,
    )
  }
  return parts.join('')
}

async function doodleFrame(input: StyleInput, _m: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const { rgb, alpha } = await source(input, 'cut', W, H)
  // Keep the subject in the middle, with room round it for the doodles.
  const s = 0.74
  const sw = Math.round(W * s)
  const shh = Math.round(H * s)
  const ext = {
    top: Math.round((H - shh) / 2),
    bottom: H - shh - Math.round((H - shh) / 2),
    left: Math.round((W - sw) / 2),
    right: W - sw - Math.round((W - sw) / 2),
  }
  const shrink = (buf: Buffer, ch: 1 | 3, bg: Rgb) =>
    sharp(buf, { raw: { width: W, height: H, channels: ch } })
      .resize(sw, shh)
      .extend({ ...ext, background: bg })
      .greyscale(ch === 1)
      .raw()
      .toBuffer()
  const a = await shrink(alpha, 1, { r: 0, g: 0, b: 0 })
  const painted = await paint(await shrink(rgb, 3, pal.paper), W, H, {
    paper: pal.paper,
    ink: pal.ink,
    colors: 16,
  })
  const out = await paperOf(c, pal.paper, 8)
  // A hand-drawn circle round the subject, under it.
  const ringSvg = svg(
    c,
    `<path d="M${W * 0.5},${H * 0.12} C${W * 0.95},${H * 0.1} ${W * 0.97},${H * 0.85} ${W * 0.52},${H * 0.88} C${W * 0.06},${H * 0.9} ${W * 0.04},${H * 0.16} ${W * 0.46},${H * 0.13}" fill="none" stroke="${css(pal.accent)}" stroke-width="${W / 110}" stroke-linecap="round"/>`,
  )
  const ring = await sharp(ringSvg).raw().toBuffer()
  const ringA = Buffer.alloc(W * H)
  for (let i = 0; i < W * H; i++) ringA[i] = ring[i * 4 + 3]
  over(out, pal.accent, ringA)
  const border = await grow(a, W, H, W / 60)
  over(out, { r: 255, g: 255, b: 255 }, border)
  place(out, painted, a)
  const icons: OverlayOptions[] = []
  const iconSpots = [
    [0.04, 0.24],
    [0.8, 0.22],
    [0.06, 0.7],
    [0.78, 0.68],
  ]
  for (let k = 0; k < Math.min(iconSpots.length, c.opts.icons?.length ?? 0); k++) {
    const icon = await sharp(c.opts.icons![k])
      .resize(Math.round(W * 0.17), Math.round(W * 0.17), { fit: 'inside' })
      .rotate(k % 2 ? 10 : -10, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    icons.push({ input: icon, left: Math.round(iconSpots[k][0] * W), top: Math.round(iconSpots[k][1] * H) })
  }
  return jpeg(out, c, [{ input: svg(c, doodleSvg(c, css(pal.accent))) }, ...icons])
}

async function paperLayers(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal } = c
  const { rgb, alpha } = await source(input, mode, W, H)
  const g = stretch(await blurGrey(greyOf(rgb, W, H), W, H, W / 160), mode === 'cut' ? alpha : undefined)
  const out = await paperOf(c, hex('#F7EAD3'), 6)
  // Light to dark sheets, each cut along a tone level and casting a small shadow on the one below.
  const sheets = [hex('#FFF8EA'), pal.sun, hex('#E0713A'), pal.accent, hex('#4A2A22')]
  const levels = [0.92, 0.72, 0.52, 0.34, 0.18]
  for (let k = 0; k < sheets.length; k++) {
    const m = Buffer.alloc(W * H)
    for (let i = 0; i < W * H; i++) m[i] = alpha[i] > 128 && g[i] / 255 < levels[k] ? 255 : 0
    const clean = await sharp(m, { raw: { width: W, height: H, channels: 1 } })
      .median(5)
      .blur(0.8)
      .greyscale()
      .raw()
      .toBuffer()
    const shadow = await blurGrey(shift(clean, W, H, Math.round(W / 160), Math.round(W / 110)), W, H, W / 140)
    over(out, pal.ink, shadow, 0.3)
    over(out, sheets[k], clean)
  }
  return jpeg(out, c)
}

async function wanted(input: StyleInput, mode: StyleMode, opts?: StyleOptions) {
  const c = ctxOf(opts)
  const { W, H, pal, rand } = c
  const iw = Math.round(W * 0.74)
  const ih = Math.round(H * 0.5)
  const { rgb, alpha } = await source(input, mode, iw, Math.round(iw / ILLUSTRATED_ASPECT))
  const sh = Math.round(iw / ILLUSTRATED_ASPECT)
  const g = stretch(greyOf(rgb, iw, sh), mode === 'cut' ? alpha : undefined)
  const img = Buffer.alloc(iw * sh * 3)
  for (let i = 0; i < iw * sh; i++) {
    const v = g[i] / 255
    const a = alpha[i] / 255
    const n = (rand() - 0.5) * 18
    const bgv = 0.86
    const t = mix(bgv, v, a)
    img[i * 3] = clamp(t * 235 + 20 + n)
    img[i * 3 + 1] = clamp(t * 205 + 22 + n)
    img[i * 3 + 2] = clamp(t * 160 + 18 + n)
  }
  const pic = await sharp(img, { raw: { width: iw, height: sh, channels: 3 } })
    .resize(iw, ih, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer()
  const base = await paperOf(c, hex('#EBD3A6'), 22)
  // Coffee stains and darker, burnt edges.
  const stains = await sharp(
    svg(
      c,
      `<g fill="none" stroke="rgba(120,70,30,0.22)" stroke-width="${W / 60}"><circle cx="${W * 0.82}" cy="${H * 0.84}" r="${W * 0.1}"/><circle cx="${W * 0.14}" cy="${H * 0.12}" r="${W * 0.07}"/></g>`,
    ),
  )
    .blur(2)
    .raw()
    .toBuffer()
  for (let i = 0; i < W * H; i++) {
    const x = i % W
    const y = (i / W) | 0
    const d = Math.min(x, y, W - 1 - x, H - 1 - y) / W
    const burn = smooth(0.08, 0, d) * 0.4
    for (let ch = 0; ch < 3; ch++) {
      const v = mix(base[i * 3 + ch], stains[i * 4 + ch], stains[i * 4 + 3] / 255)
      base[i * 3 + ch] = clamp(v * (1 - burn))
    }
  }
  const font = 'serif'
  const title = await sharp({
    text: {
      text: `<span foreground="#3A2414" weight="bold">מבוקשים!</span>`,
      font,
      width: Math.round(W * 0.8),
      height: Math.round(H * 0.13),
      rgba: true,
      align: 'centre',
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true })
  const reward = await sharp({
    text: {
      text: `<span foreground="#3A2414">פרס: מנת חומוס חמה</span>`,
      font,
      width: Math.round(W * 0.7),
      height: Math.round(H * 0.06),
      rgba: true,
      align: 'centre',
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true })
  const frame = svg(
    c,
    `<rect x="${(W - iw) / 2 - W / 90}" y="${H * 0.2 - W / 90}" width="${iw + W / 45}" height="${ih + W / 45}" fill="none" stroke="#3A2414" stroke-width="${W / 120}"/>
     <path d="${wobble(c, W * 0.15, H * 0.82, W * 0.85, H * 0.82, 3)}" stroke="#3A2414" stroke-width="${W / 200}" fill="none"/>
     <path d="${wobble(c, W * 0.15, H * 0.94, W * 0.85, H * 0.94, 3)}" stroke="#3A2414" stroke-width="${W / 200}" fill="none"/>
     <g fill="#6B4A2A"><circle cx="${W * 0.06}" cy="${W * 0.06}" r="${W / 70}"/><circle cx="${W * 0.94}" cy="${W * 0.06}" r="${W / 70}"/></g>`,
  )
  void pal
  return jpeg(base, c, [
    { input: pic, left: Math.round((W - iw) / 2), top: Math.round(H * 0.2) },
    { input: frame },
    { input: title.data, left: Math.round((W - title.info.width) / 2), top: Math.round(H * 0.045) },
    { input: reward.data, left: Math.round((W - reward.info.width) / 2), top: Math.round(H * 0.85) },
  ])
}

/** The numbered catalogue the owner picks from. */
export const PHOTO_STYLES: PhotoStyle[] = [
  {
    no: 1,
    id: 'sticker',
    name: 'מדבקה',
    line: 'הדמות גזורה עם שוליים לבנים עבים וצל רך, כמו מדבקה שהודבקה על הדף.',
    modes: ['cut'],
    render: sticker,
  },
  {
    no: 2,
    id: 'riso',
    name: 'ריזוגרפיה',
    line: 'הדפס בשני צבעים, כחול וורוד זוהר, עם גרעין ותזוזה קטנה בין הצבעים.',
    modes: ['bg', 'cut'],
    render: riso,
  },
  {
    no: 3,
    id: 'halftone',
    name: 'קומיקס נקודות',
    line: 'צבעים עזים ונקודות רסטר שחורות, כמו חוברת קומיקס ישנה.',
    modes: ['bg', 'cut'],
    render: halftone,
  },
  {
    no: 4,
    id: 'watercolor',
    name: 'צבעי מים',
    line: 'כתמי צבע רכים שנספגים בנייר, עם קו עיפרון דק מעל.',
    modes: ['bg', 'cut'],
    render: watercolor,
  },
  {
    no: 5,
    id: 'ink',
    name: 'סקיצה בדיו',
    line: 'רק קווי דיו ומעט צל אפור, כמו ציור מהיר במחברת.',
    modes: ['bg', 'cut'],
    render: inkSketch,
  },
  {
    no: 6,
    id: 'linocut',
    name: 'חיתוך לינוליאום',
    line: 'שחור על נייר עם קווים חרוטים בחצאי הטונים, ובלוק אדום מאחור.',
    modes: ['bg', 'cut'],
    render: linocut,
  },
  {
    no: 7,
    id: 'popart',
    name: 'פופ-ארט ארבע',
    line: 'אותה תמונה ארבע פעמים, כל פעם בצבעים אחרים, בסגנון וורהול.',
    modes: ['bg', 'cut'],
    render: popArt,
  },
  {
    no: 8,
    id: 'poster',
    name: 'פוסטר שוק וינטג׳',
    line: 'ארבעה צבעי דפוס של השוק, קרני שמש ומסגרת כפולה של כרזה ישנה.',
    modes: ['bg', 'cut'],
    render: marketPoster,
  },
  {
    no: 9,
    id: 'stamp',
    name: 'בול דואר',
    line: 'תחריט אדום בתוך בול עם שוליים מחוררים וחותמת דואר.',
    modes: ['bg', 'cut'],
    render: stamp,
  },
  {
    no: 10,
    id: 'polaroid',
    name: 'פולארויד עם סלוטייפ',
    line: 'צבעים דהויים וחמים של פילם מיידי, מודבק בסלוטייפ על הדף.',
    modes: ['bg'],
    render: polaroid,
  },
  {
    no: 11,
    id: 'collage',
    name: 'קולאז׳ נייר קרוע',
    line: 'הדמות גזורה ביד ומונחת על פיסות נייר צבעוני קרוע.',
    modes: ['cut'],
    render: collage,
  },
  {
    no: 12,
    id: 'duotone',
    name: 'דואוטון בצבעי המפה',
    line: 'צבעי המפה בלבד: דיו בצללים, אדום השוק באמצע, נייר באור.',
    modes: ['bg', 'cut'],
    render: duotone,
  },
  {
    no: 13,
    id: 'pencil',
    name: 'עיפרון בקווים מוצלבים',
    line: 'הצללה בקווי עיפרון מוצלבים, כמו רישום בבית ספר לאמנות.',
    modes: ['bg', 'cut'],
    render: pencil,
  },
  {
    no: 14,
    id: 'doodles',
    name: 'מסגרת שרבוטים',
    line: 'הדמות בעיגול יד, ומסביבה לבבות, כוכבים ואיורי שוק של האירוע.',
    modes: ['cut'],
    render: doodleFrame,
  },
  {
    no: 15,
    id: 'papercut',
    name: 'נייר חתוך בשכבות',
    line: 'שכבות נייר בצבעים חמים, כל אחת חתוכה לפי האור ומטילה צל קטן.',
    modes: ['bg', 'cut'],
    render: paperLayers,
  },
  {
    no: 16,
    id: 'wanted',
    name: 'מודעת "מבוקשים"',
    line: 'כרזת מערבון על נייר שרוף בקצוות, עם פרס בצד השני של השוק.',
    modes: ['bg', 'cut'],
    render: wanted,
  },
]
