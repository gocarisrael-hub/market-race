// Small pure helpers for the screens (unit tested).
import type { TextPart } from '../../server/domain/types.ts'

/**
 * Riddles end with a short question ("מה היא?"). The mockup sets it apart in big handwriting,
 * so split it off the last text part when it is short. Personal slots are never split.
 */
export function splitQuestion(parts: TextPart[]): { body: TextPart[]; question: string | null } {
  const last = parts[parts.length - 1]
  if (last?.t !== 'text') return { body: parts, question: null }
  const text = last.v.trimEnd()
  if (!text.endsWith('?')) return { body: parts, question: null }
  // The question starts after the last sentence end before the final "?".
  const head = text.slice(0, -1)
  const cut = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
    head.lastIndexOf(': '),
  )
  const question = (cut >= 0 ? text.slice(cut + 2) : text).trim()
  const words = question.split(/\s+/).length
  if (words > 4 || question.length > 28) return { body: parts, question: null }
  const rest = cut >= 0 ? text.slice(0, cut + 1) : ''
  // The whole riddle is the question: keep it as body text.
  if (rest.trim() === '' && parts.length === 1) return { body: parts, question: null }
  const body = parts.slice(0, -1)
  if (rest.trim() !== '') body.push({ t: 'text', v: rest })
  return { body, question }
}

export interface MapFrame {
  /** Image box, in percent of the frame: left/top offset and width. */
  left: number
  top: number
  width: number
  /** Where the stall lands, in percent of the frame. */
  x: number
  y: number
}

/**
 * Crops a map around a pin. The image is zoomed `zoom` times the frame width and placed so the
 * pin sits near `aim` (percent of the frame) without ever showing past the image edge.
 * `imageRatio` and `frameRatio` are height / width.
 */
export function mapFrame(
  pin: { x: number; y: number },
  imageRatio: number,
  frameRatio: number,
  zoom = 2.2,
  aim = { x: 58, y: 42 },
): MapFrame {
  const z = Math.max(zoom, frameRatio / imageRatio, 1)
  const w = z // in frame widths
  const h = (z * imageRatio) / frameRatio // in frame heights
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const px = clamp(pin.x, 0, 100) / 100
  const py = clamp(pin.y, 0, 100) / 100
  const left = clamp(aim.x / 100 - px * w, 1 - w, 0)
  const top = clamp(aim.y / 100 - py * h, 1 - h, 0)
  return {
    left: left * 100,
    top: top * 100,
    width: w * 100,
    x: (left + px * w) * 100,
    y: (top + py * h) * 100,
  }
}

/** A hand-drawn-looking curve from a corner of the frame to the stall (viewBox 0..100). */
export function trailPath(x: number, y: number): string {
  const sx = x > 50 ? 12 : 88
  const sy = 94
  const mx = (sx + x) / 2
  const my = (sy + y) / 2
  const wob = x > 50 ? -14 : 14
  return `M${sx} ${sy} C ${sx + wob} ${sy - 18}, ${mx - wob} ${my + 10}, ${mx} ${my} S ${x - wob / 2} ${y + 14}, ${x} ${y + 5}`
}

/** Decorative food icons, one per stop, cycled. Icons are illustration, not data. */
export const STOP_ICONS = ['fruit', 'hummus', 'falafel', 'tomatoes', 'coffee', 'spices', 'flowers']

export function iconUrl(name: string) {
  return `/static/icons/${name}.webp`
}

export function stopIcon(index: number) {
  return iconUrl(STOP_ICONS[index % STOP_ICONS.length])
}

/** Font size for the ribbon title so long names still fit on one line. */
export function ribbonFontSize(text: string, max = 46, min = 26): number {
  const len = [...text].length
  if (len <= 12) return max
  return Math.max(min, Math.round(max - (len - 12) * 1.6))
}
