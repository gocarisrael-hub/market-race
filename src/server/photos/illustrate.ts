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
  return sharp(input, { failOn: 'error' })
    .rotate()
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
}

export async function illustrate(input: Buffer, opts: IllustrateOptions = {}): Promise<Buffer> {
  const maxSize = opts.maxSize ?? 1000
  const paper = opts.paper ?? { r: 0xff, g: 0xfb, b: 0xf4 }
  const ink = opts.ink ?? { r: 0x2b, g: 0x24, b: 0x20 }

  const base = sharp(input)
    .rotate()
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
  const { data: src, info } = await base
    .clone()
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info

  // 1. Edge-preserving smoothing (median) then color flattening through a small palette.
  const smoothed = await sharp(src, { raw: { width: w, height: h, channels: 3 } })
    .median(5)
    .modulate({ saturation: 1.15 })
    .png({ palette: true, colours: opts.colors ?? 14, dither: 0 })
    .toBuffer()
  const { data: flat } = await sharp(smoothed).removeAlpha().raw().toBuffer({ resolveWithObject: true })

  // 2. Ink outlines: Sobel magnitude on a blurred grey image, thresholded.
  const { data: grey } = await sharp(src, { raw: { width: w, height: h, channels: 3 } })
    .greyscale()
    .blur(1.4)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const edge = new Float32Array(w * h)
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
    }
  }
  // Threshold at a high percentile so only strong contours become ink.
  const sample = Array.from(edge.filter((_, i) => i % 7 === 0)).sort((a, b) => a - b)
  const hi = sample[Math.floor(sample.length * 0.9)] || 1
  const lo = hi * 0.6

  // 3. Compose: flattened color, pushed toward paper, ink where edges are strong, paper grain.
  let rnd = opts.seed ?? 1234567
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
    return rnd / 0x7fffffff
  }
  const out = Buffer.alloc(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    const e = edge[i]
    const inkA = e <= lo ? 0 : e >= hi ? 0.85 : ((e - lo) / (hi - lo)) * 0.85
    const grain = (rand() - 0.5) * 14
    for (let c = 0; c < 3; c++) {
      const p = c === 0 ? paper.r : c === 1 ? paper.g : paper.b
      const k = c === 0 ? ink.r : c === 1 ? ink.g : ink.b
      // A watercolor wash: 82% pigment over the paper color.
      const wash = flat[i * 3 + c] * 0.82 + p * 0.18
      const v = wash * (1 - inkA) + k * inkA + grain
      out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(v)))
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
}
