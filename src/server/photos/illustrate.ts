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
  return sharp(out, raw).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
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
