// The pure half of the background cutout, ported as-is from Dugri (site/js/pawn-cutout.js).
// No DOM here, so the same code runs in the buyer's browser and in the unit tests.
//
// The segmenter (MediaPipe selfie_multiclass_256x256) labels every pixel of a 256x256 mask:
// 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others (accessories).
// Everything that is not 0 is the person.

export const BACKGROUND_CLASS = 0

/**
 * How much of the frame the subject has to cover for the cut to be believable. Below this the
 * model found a speck (or nothing), and the cut is reported as a miss: the photo keeps its
 * background.
 */
export const MIN_COVERAGE = 0.02

/** Longest side of the cutout PNG the browser hands back. */
export const CUT_MAX_PX = 1024

/** Give up after this long: a miss, not a hung upload. */
export const CUT_TIMEOUT_MS = 15000

/**
 * Keep only the biggest connected blob of the mask (4-connected). A bystander's shoulder in the
 * corner of the frame is labelled "person" too; on a cutout it reads as a stray scrap.
 */
export function largestBlob(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h).fill(-1)
  const queue = new Int32Array(w * h)
  const sizes: number[] = []
  for (let seed = 0; seed < w * h; seed++) {
    if (!mask[seed] || label[seed] >= 0) continue
    const id = sizes.length
    let head = 0
    let tail = 0
    let count = 0
    queue[tail++] = seed
    label[seed] = id
    while (head < tail) {
      const p = queue[head++]
      count++
      const x = p % w
      const y = (p / w) | 0
      if (x > 0 && mask[p - 1] && label[p - 1] < 0) {
        label[p - 1] = id
        queue[tail++] = p - 1
      }
      if (x < w - 1 && mask[p + 1] && label[p + 1] < 0) {
        label[p + 1] = id
        queue[tail++] = p + 1
      }
      if (y > 0 && mask[p - w] && label[p - w] < 0) {
        label[p - w] = id
        queue[tail++] = p - w
      }
      if (y < h - 1 && mask[p + w] && label[p + w] < 0) {
        label[p + w] = id
        queue[tail++] = p + w
      }
    }
    sizes.push(count)
  }
  if (sizes.length < 2) return mask
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = label[i] === best ? 1 : 0
  return out
}

/**
 * The person mask (1 = subject) from the segmenter's category mask, or null when the subject
 * covers less than MIN_COVERAGE of the frame. The largest blob only.
 */
export function personMask(category: Uint8Array, w: number, h: number): Uint8Array | null {
  const person = new Uint8Array(w * h)
  let covered = 0
  for (let i = 0; i < w * h; i++) {
    if (category[i] !== BACKGROUND_CLASS) {
      person[i] = 1
      covered++
    }
  }
  if (covered / (w * h) < MIN_COVERAGE) return null
  return largestBlob(person, w, h)
}

/**
 * The mask as RGBA pixels (white, alpha 255 on the subject). The browser draws this scaled up over
 * the photo with `destination-in`: the bilinear upscale of a 256px mask onto a photo of up to
 * 1024px is the feathered edge (Dugri relies on the same thing, no extra blur).
 */
export function maskToRgba(mask: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 255
    data[i * 4 + 1] = 255
    data[i * 4 + 2] = 255
    data[i * 4 + 3] = mask[i] ? 255 : 0
  }
  return data
}
