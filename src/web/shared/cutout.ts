// Background removal ON THE BUYER'S DEVICE: a photo in, a transparent PNG of the subject out.
// A port of Dugri's site/js/pawn-cutout.js, same runtime, same model, same rules:
//   * MediaPipe Tasks Vision ImageSegmenter, selfie_multiclass_256x256 (both Apache-2.0),
//     self-hosted under /vendor/mediapipe (vendor/mediapipe/README.md). No CDN, no third party.
//   * Category mask, every non-background class is the subject, the largest blob only.
//   * Under 2% coverage is a miss. The 256px mask is drawn scaled up over the photo
//     (bilinear), which is the feathered edge.
//   * Best effort: every failure (old browser, no WebAssembly, no person, 15s timeout)
//     resolves to null and the photo keeps its background. A cut never fails an order.
import { CUT_MAX_PX, CUT_TIMEOUT_MS, maskToRgba, personMask } from './cutout-mask.ts'

const VENDOR = '/vendor/mediapipe'
const MODEL = `${VENDOR}/selfie_multiclass_256x256.tflite`

type CategoryMask = { width: number; height: number; getAsUint8Array(): Uint8Array }
type Segmenter = { segment(img: HTMLCanvasElement): { categoryMask: CategoryMask; close(): void } }

let segmenterPromise: Promise<Segmenter> | null = null

// One segmenter per page, created on first use (~18MB: wasm ~2.4MB brotli, model 16MB), so it
// is only loaded when the buyer asks for a cutout.
function getSegmenter(): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const url = `${VENDOR}/vision_bundle.mjs`
      const { FilesetResolver, ImageSegmenter } = await import(/* @vite-ignore */ url)
      const fileset = await FilesetResolver.forVisionTasks(VENDOR)
      return (await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })) as Segmenter
    })().catch((e) => {
      // Remember the failure rather than downloading 18MB again per photo.
      segmenterPromise = Promise.reject(e)
      throw e
    })
  }
  return segmenterPromise
}

/** Decodes upright (EXIF applied: the cutout PNG has no EXIF) and downscaled. */
export async function decodeUpright(file: Blob, maxPx = CUT_MAX_PX): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return canvas
}

/** The subject of `file` as a transparent PNG, or null when it could not be cut. Never throws. */
export function cutPhoto(file: Blob): Promise<Blob | null> {
  return Promise.race([
    cut(file),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), CUT_TIMEOUT_MS)),
  ])
}

async function cut(file: Blob): Promise<Blob | null> {
  try {
    const segmenter = await getSegmenter()
    const source = await decodeUpright(file)
    const result = segmenter.segment(source)
    try {
      const category = result.categoryMask
      const mw = category.width
      const mh = category.height
      const mask = personMask(category.getAsUint8Array(), mw, mh)
      if (!mask) return null
      return await compose(source, mask, mw, mh)
    } finally {
      result.close()
    }
  } catch {
    return null
  }
}

/** Paints the mask over the photo as its alpha channel and encodes a PNG. */
async function compose(source: HTMLCanvasElement, mask: Uint8Array, mw: number, mh: number) {
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = mw
  maskCanvas.height = mh
  const maskCtx = maskCanvas.getContext('2d')!
  const img = maskCtx.createImageData(mw, mh)
  img.data.set(maskToRgba(mask, mw, mh))
  maskCtx.putImageData(img, 0, 0)

  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(maskCanvas, 0, 0, out.width, out.height)
  return await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
}
