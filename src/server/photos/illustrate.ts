// Turns a photo into the illustrated map style with plain image filters (no AI model yet):
// edge-preserving smoothing, color flattening, ink outlines and paper grain.
// SPEC: keep the converter behind one function so it can be swapped for an AI model later.
import sharp from 'sharp'

export interface IllustrateOptions {
  maxSize?: number
  colors?: number // palette size for flattening
  paper?: { r: number; g: number; b: number }
  ink?: { r: number; g: number; b: number }
  seed?: number
}

/** Normalizes any accepted upload to an upright sRGB JPEG, at most `maxSize` px on the long side. */
export async function normalizePhoto(input: Buffer, maxSize = 1600): Promise<Buffer> {
  return (
    sharp(input, { failOn: 'error' })
      .rotate()
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      // Transparent areas become paper, not black.
      .flatten({ background: '#FFFBF4' })
      .toColorspace('srgb')
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
  )
}

/** Output aspect of the illustrated photo: a 4:5 portrait, like a polaroid print. */
export const ILLUSTRATED_ASPECT = 4 / 5

export async function illustrate(input: Buffer, opts: IllustrateOptions = {}): Promise<Buffer> {
  const maxSize = opts.maxSize ?? 1000
  // A warm, slightly yellowed paper (the maps' paper), not a cold white.
  const paper = opts.paper ?? { r: 0xfc, g: 0xf3, b: 0xe3 }
  const ink = opts.ink ?? { r: 0x2b, g: 0x24, b: 0x20 }

  // 0. Crop to 4:5 around the subject (sharp's attention strategy: saturation, skin, edges).
  const upright = await sharp(input)
    .rotate()
    // Transparent areas become paper, not black.
    .flatten({ background: paper })
    .toColorspace('srgb')
    .toBuffer({ resolveWithObject: true })
  const sw = upright.info.width
  const sh = upright.info.height
  const h = Math.max(1, Math.round(Math.min(maxSize, sh, sw / ILLUSTRATED_ASPECT)))
  const w = Math.max(1, Math.round(h * ILLUSTRATED_ASPECT))
  const { data: src } = await sharp(upright.data)
    .resize(w, h, { fit: 'cover', position: sharp.strategy.attention })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const out = await paint(src, w, h, { ...opts, paper, ink })
  return sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}

export type Rgb = { r: number; g: number; b: number }

/** The illustration itself, on raw RGB pixels: returns raw RGB of the same size. */
export async function paint(
  src: Buffer,
  w: number,
  h: number,
  opts: IllustrateOptions & { paper: Rgb; ink: Rgb },
): Promise<Buffer> {
  const { paper, ink } = opts
  const raw = { raw: { width: w, height: h, channels: 3 as const } }

  // 1. Edge-preserving smoothing (median) then color flattening through a small palette.
  const smoothed = await sharp(src, raw)
    .median(7)
    .modulate({ saturation: 1.12 })
    .png({ palette: true, colours: opts.colors ?? 16, dither: 0 })
    .toBuffer()
  const { data: flat } = await sharp(smoothed).removeAlpha().raw().toBuffer({ resolveWithObject: true })

  // 2. Ink outlines: Sobel magnitude on a median-smoothed, blurred grey image.
  const { data: grey } = await sharp(src, raw)
    .greyscale()
    .median(5)
    .blur(1.8)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const edge = new Float32Array(w * h)
  let maxEdge = 1
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx =
        -grey[i - w - 1] -
        2 * grey[i - 1] -
        grey[i + w - 1] +
        grey[i - w + 1] +
        2 * grey[i + 1] +
        grey[i + w + 1]
      const gy =
        -grey[i - w - 1] -
        2 * grey[i - w] -
        grey[i - w + 1] +
        grey[i + w - 1] +
        2 * grey[i + w] +
        grey[i + w + 1]
      edge[i] = Math.hypot(gx, gy)
      if (edge[i] > maxEdge) maxEdge = edge[i]
    }
  }
  // Busy textures (grass, gravel, foliage) are edges everywhere: subtract the local edge density
  // so only contours that stand out from their surroundings become ink.
  const edge8 = Buffer.alloc(w * h)
  for (let i = 0; i < w * h; i++) edge8[i] = Math.round((edge[i] / maxEdge) * 255)
  const { data: density } = await sharp(edge8, { raw: { width: w, height: h, channels: 1 } })
    .blur(Math.max(2, Math.round(Math.min(w, h) / 90)))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const contour = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) contour[i] = Math.max(0, edge[i] - 1.35 * (density[i] / 255) * maxEdge)
  // Threshold at a high percentile so only strong contours become ink.
  const sample = Array.from(contour.filter((_, i) => i % 7 === 0)).sort((a, b) => a - b)
  const hi = Math.max(sample[Math.floor(sample.length * 0.93)] || 0, maxEdge * 0.08)
  const lo = hi * 0.55
  const inkAt = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const e = contour[i]
    inkAt[i] = e <= lo ? 0 : e >= hi ? 0.85 : ((e - lo) / (hi - lo)) * 0.85
  }
  dropSpecks(inkAt, w, h, Math.round((w * h) / 4000))

  // 3. Compose: flattened color, pushed toward paper, ink where edges are strong, paper grain.
  let rnd = opts.seed ?? 1234567
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
    return rnd / 0x7fffffff
  }
  const out = Buffer.alloc(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    const inkA = inkAt[i]
    const grain = (rand() - 0.5) * 9
    for (let c = 0; c < 3; c++) {
      const p = c === 0 ? paper.r : c === 1 ? paper.g : paper.b
      const k = c === 0 ? ink.r : c === 1 ? ink.g : ink.b
      // A watercolor wash: 80% pigment over the paper color, partly multiplied by the paper
      // (pigment soaks into a warm sheet, whites included).
      const wash = (flat[i * 3 + c] * 0.8 + p * 0.2) * (0.55 + (0.45 * p) / 255)
      const v = wash * (1 - inkA) + k * inkA + grain
      out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(v)))
    }
  }
  return out
}

/** Alpha at or above this is subject (a hair matte fades over a few pixels; all of it counts). */
const ALPHA_MIN = 24

/** Bounding box of the subject in an RGBA buffer, or null when there is no subject. */
export function alphaBox(rgba: Buffer, w: number, h: number) {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3] >= ALPHA_MIN) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 }
}

/**
 * The 4:5 window that frames a cut subject: the whole subject with a margin, centered on it. A
 * side where the subject runs off the photo (the photo's own edge cut it, a body below a
 * portrait) is anchored to that edge, so the straight cut sits on the frame and not inside it.
 */
export function subjectWindow(box: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number) {
  const margin = 0.1
  const bw = box.x1 - box.x0
  const bh = box.y1 - box.y0
  const winH = Math.max(bh * (1 + 2 * margin), (bw * (1 + 2 * margin)) / ILLUSTRATED_ASPECT, 16)
  const winW = winH * ILLUSTRATED_ASPECT
  let left = (box.x0 + box.x1) / 2 - winW / 2
  let top = (box.y0 + box.y1) / 2 - winH / 2
  const edge = 2
  if (box.y1 >= h - edge) top = box.y1 - winH
  else if (box.y0 <= edge) top = box.y0
  if (box.x0 <= edge && box.x1 < w - edge) left = box.x0
  else if (box.x1 >= w - edge && box.x0 > edge) left = box.x1 - winW
  return { left: Math.round(left), top: Math.round(top), width: Math.round(winW), height: Math.round(winH) }
}

/**
 * A cut subject (transparent PNG from the buyer's browser) illustrated on paper: framed on its
 * silhouette, painted like `illustrate`, and set on the paper with an ink contour round it.
 */
export async function illustrateCutout(cutout: Buffer, opts: IllustrateOptions = {}): Promise<Buffer> {
  const maxSize = opts.maxSize ?? 1000
  const paper = opts.paper ?? { r: 0xfc, g: 0xf3, b: 0xe3 }
  const ink = opts.ink ?? { r: 0x2b, g: 0x24, b: 0x20 }
  const { data: rgba, info } = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const box = alphaBox(rgba, info.width, info.height)
  if (!box) throw new Error('empty cutout')
  const win = subjectWindow(box, info.width, info.height)
  const pad = {
    left: Math.max(0, -win.left),
    top: Math.max(0, -win.top),
    right: Math.max(0, win.left + win.width - info.width),
    bottom: Math.max(0, win.top + win.height - info.height),
  }
  const h = Math.max(16, Math.round(Math.min(maxSize, win.height)))
  const w = Math.max(13, Math.round(h * ILLUSTRATED_ASPECT))
  // Two passes: sharp would extract before it extends within one pipeline.
  const padded = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extend({ ...pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer()
  const pw = info.width + pad.left + pad.right
  const ph = info.height + pad.top + pad.bottom
  const { data: framed } = await sharp(padded, { raw: { width: pw, height: ph, channels: 4 } })
    .extract({ left: win.left + pad.left, top: win.top + pad.top, width: win.width, height: win.height })
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  // The subject flattened on paper is what gets painted; the alpha decides where it shows.
  const alpha = Buffer.alloc(w * h)
  const flat = Buffer.alloc(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    const a = framed[i * 4 + 3] / 255
    alpha[i] = framed[i * 4 + 3]
    flat[i * 3] = Math.round(framed[i * 4] * a + paper.r * (1 - a))
    flat[i * 3 + 1] = Math.round(framed[i * 4 + 1] * a + paper.g * (1 - a))
    flat[i * 3 + 2] = Math.round(framed[i * 4 + 2] * a + paper.b * (1 - a))
  }
  const painted = await paint(flat, w, h, { ...opts, paper, ink })
  // The ink contour: a soft band just outside the silhouette (the blurred alpha minus the alpha).
  const spread = Math.max(1.2, w / 260)
  const { data: grown } = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .blur(spread)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i] / 255
    const line = Math.min(1, Math.max(0, (grown[i] / 255 - a) * 3.2)) * 0.8
    for (let c = 0; c < 3; c++) {
      const p = c === 0 ? paper.r : c === 1 ? paper.g : paper.b
      const k = c === 0 ? ink.r : c === 1 ? ink.g : ink.b
      // Outside the subject the painted pixel is already paper and grain; keep it, then ink.
      const base = painted[i * 3 + c] * a + (painted[i * 3 + c] * 0.3 + p * 0.7) * (1 - a)
      out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(base * (1 - line) + k * line)))
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}

/**
 * Checks a cutout PNG sent by the browser against its original: a PNG, with alpha, the same
 * shape as the original, and with a subject in it. Returns the reason it is refused, or null.
 */
export async function checkCutout(png: Buffer, original: Buffer): Promise<string | null> {
  try {
    const meta = await sharp(png).metadata()
    if (meta.format !== 'png' || !meta.hasAlpha || !meta.width || !meta.height) return 'not_a_cutout'
    if (meta.width > 4096 || meta.height > 4096) return 'not_a_cutout'
    const o = await sharp(original).metadata()
    if (!o.width || !o.height) return 'not_a_cutout'
    if (Math.abs(meta.width / meta.height - o.width / o.height) > 0.03) return 'shape_mismatch'
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer({ resolveWithObject: true })
    let covered = 0
    for (let i = 0; i < data.length; i++) if (data[i] >= ALPHA_MIN) covered++
    const share = covered / (info.width * info.height)
    if (share < 0.02 || share > 0.995) return 'no_subject'
    return null
  } catch {
    return 'not_a_cutout'
  }
}

/** Removes ink blobs smaller than `minArea` pixels (texture specks), keeping long contours. */
function dropSpecks(ink: Float32Array, w: number, h: number, minArea: number) {
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const blob: number[] = []
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || ink[start] === 0) continue
    stack.push(start)
    seen[start] = 1
    blob.length = 0
    while (stack.length) {
      const i = stack.pop()!
      blob.push(i)
      const x = i % w
      const y = (i - x) / w
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const j = ny * w + nx
          if (!seen[j] && ink[j] > 0) {
            seen[j] = 1
            stack.push(j)
          }
        }
    }
    if (blob.length < minArea) for (const i of blob) ink[i] = 0
  }
}
