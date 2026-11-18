// Hand-drawn pieces shared by the screens. Paths come from the mockup (docs/mockup/*.dc.html).
// Colors come from the theme's CSS variables (see theme.ts).
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { SketchShape } from '../shared/decor.tsx'

const BRUSH =
  'M9 12 C 70 4, 180 9, 262 5 C 300 3, 330 6, 339 9 C 344 26, 341 44, 343 58 C 262 64, 150 59, 60 63 C 36 64, 16 62, 5 60 C 2 44, 7 28, 9 12 Z'
const PAPER =
  'M6 10 C 60 3, 120 8, 180 4 C 230 1, 270 6, 294 5 C 297 60, 293 120, 296 180 C 298 230, 294 270, 297 294 C 230 298, 160 293, 90 297 C 50 299, 20 295, 4 296 C 7 240, 2 180, 5 120 C 7 70, 3 40, 6 10 Z'

/** The brush-stroke button. */
export function BrushButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`brush ${className}`} {...rest}>
      <svg viewBox="0 0 346 68" preserveAspectRatio="none" aria-hidden="true">
        <path d={BRUSH} vectorEffect="non-scaling-stroke" />
      </svg>
      <span>{children}</span>
    </button>
  )
}

/** The brush-stroke look on a link (e.g. opening WhatsApp). */
export function BrushLink({ children, className = '', ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={`brush ${className}`} {...rest}>
      <svg viewBox="0 0 346 68" preserveAspectRatio="none" aria-hidden="true">
        <path d={BRUSH} vectorEffect="non-scaling-stroke" />
      </svg>
      <span>{children}</span>
    </a>
  )
}

/** A secondary action: a handwritten word in a hand-drawn outline (never a bare underlined link). */
export function SketchButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`sketch small ${className}`} {...rest}>
      <SketchShape />
      <span>{children}</span>
    </button>
  )
}

/** A torn paper note, slightly tilted. */
export function Paper({
  children,
  tilt = 0,
  className = '',
  style,
}: {
  children: ReactNode
  tilt?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`paper ${className}`} style={{ ...style, ['--r' as string]: `${tilt}deg` }}>
      <svg viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
        <path d={PAPER} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="paper-body">{children}</div>
    </div>
  )
}

/** The ribbon banner with the race title. The text is HTML so long names can shrink. */
export function Ribbon({ text, fontSize }: { text: string; fontSize: number }) {
  return (
    <h1 className="ribbon pop">
      <svg viewBox="0 0 330 92" preserveAspectRatio="none" aria-hidden="true">
        <path className="ribbon-tail" d="M8 26 L40 20 L34 46 L40 72 L8 66 L20 46 Z" />
        <path className="ribbon-tail" d="M322 26 L290 20 L296 46 L290 72 L322 66 L310 46 Z" />
        <path className="ribbon-main" d="M34 12 Q165 -4 296 12 L296 72 Q165 56 34 72 Z" />
      </svg>
      <span style={{ fontSize: `min(${fontSize}px, ${(fontSize / 3.9).toFixed(2)}vw)` }}>{text}</span>
    </h1>
  )
}

export function Underline({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`underline ${className}`}
      viewBox="0 0 240 16"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="draw" d="M6 10 C 60 2, 110 14, 160 7 S 220 5, 234 9" />
    </svg>
  )
}

/** A hand-drawn loop around its children. */
export function HandCircle({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`hand-circle ${className}`}
      viewBox="0 0 120 60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="draw"
        d="M70 6 C 30 2, 4 14, 6 32 C 8 50, 50 58, 86 52 C 116 46, 118 22, 96 10 C 80 2, 50 4, 40 8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** The curly arrow pointing down-left (toward the answer in RTL). */
export function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg className={`arrow ${className}`} width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">
      <path d="M42 4 C 30 2, 14 10, 8 26 M8 26 L 4 14 M8 26 L 20 24" />
    </svg>
  )
}

export function Rays() {
  const angles = Array.from({ length: 12 }, (_, i) => i * 30)
  return (
    <svg className="rays" viewBox="0 0 400 400" aria-hidden="true">
      <g>
        {angles.map((a) => (
          <path key={a} d="M200 200 L188 0 L212 0 Z" transform={`rotate(${a} 200 200)`} />
        ))}
      </g>
    </svg>
  )
}

/** The torn top edge of the paper sheet at the bottom of the opening screen. */
export function TornEdge() {
  return (
    <svg className="torn-edge" viewBox="0 0 390 60" preserveAspectRatio="none" aria-hidden="true">
      <path
        className="torn-fill"
        d="M0 60 L0 36 C 40 6, 70 46, 110 22 S 180 -4, 220 24 S 300 48, 340 16 S 380 6, 390 20 L390 60 Z"
      />
      <path
        className="torn-line"
        d="M0 36 C 40 6, 70 46, 110 22 S 180 -4, 220 24 S 300 48, 340 16 S 380 6, 390 20"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** The dashed walking trail across the top of the riddle screen. */
export function Trail() {
  return (
    <svg className="trail-line" viewBox="0 0 390 110" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M350 60 C 300 30, 270 90, 230 62 S 160 30, 130 64 S 70 86, 30 56"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** A little location pin, drawn. */
export function PinMark() {
  return (
    <svg className="pin-mark" width="18" height="22" viewBox="0 0 18 22" aria-hidden="true">
      <path d="M9 21 C 4 14, 2 11, 2 8 C 2 4, 5 1.5, 9 1.5 C 13 1.5, 16 4, 16 8 C 16 11, 14 14, 9 21 Z" />
      <circle cx="9" cy="8" r="2.4" />
    </svg>
  )
}

export function Tape({ className = '' }: { className?: string }) {
  return <span className={`tape ${className}`} aria-hidden="true" />
}

export function Tick() {
  return (
    <svg className="tick" viewBox="0 0 24 20" aria-hidden="true">
      <path d="M3 11 C 6 13, 8 16, 9 18 C 12 11, 16 6, 22 2" />
    </svg>
  )
}
