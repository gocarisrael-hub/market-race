// Hand-drawn building blocks, SVG paths taken from docs/mockup.
import type { CSSProperties, ReactNode } from 'react'
import { copy } from './copy.ts'
import { navigate } from './router.ts'

const BRUSH =
  'M9 12 C 70 4, 180 9, 262 5 C 300 3, 330 6, 339 9 C 344 26, 341 44, 343 58 C 262 64, 150 59, 60 63 C 36 64, 16 62, 5 60 C 2 44, 7 28, 9 12 Z'
const RING = 'M70 6 C 30 2, 4 14, 6 32 C 8 50, 50 58, 86 52 C 116 46, 118 22, 96 10 C 80 2, 50 4, 40 8'
const PAPER =
  'M6 10 C 60 3, 120 8, 180 4 C 230 1, 270 6, 294 5 C 297 60, 293 120, 296 180 C 298 230, 294 270, 297 294 C 230 298, 160 293, 90 297 C 50 299, 20 295, 4 296 C 7 240, 2 180, 5 120 C 7 70, 3 40, 6 10 Z'

/** Hand-drawn circle around its positioned parent. */
export function Ring({ style }: { style?: CSSProperties }) {
  return (
    <svg className="ring" viewBox="0 0 120 60" preserveAspectRatio="none" aria-hidden="true" style={style}>
      <path
        className="draw"
        d={RING}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function Underline() {
  return (
    <svg className="underline" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
      <path
        className="draw"
        d="M4 9 C 50 3, 120 12, 196 5"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** The curved hand-drawn arrow of the photos mockup (points left, original → drawn). */
export function Arrow() {
  return (
    <svg width="56" height="36" viewBox="0 0 64 40" aria-hidden="true">
      <path
        className="draw"
        d="M58 18 C 42 6, 24 8, 8 22 M8 22 L 12 8 M8 22 L 22 26"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Spinner() {
  return (
    <svg className="spinner" viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M24 6 C 36 5, 43 15, 42 25 C 41 36, 31 43, 22 42"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A handwritten choice. `pressed` draws the circle. */
export function Opt(props: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
  small?: boolean
  role?: 'radio' | 'checkbox'
}) {
  const aria =
    props.role === 'radio' || props.role === 'checkbox'
      ? { role: props.role, 'aria-checked': props.pressed }
      : { 'aria-pressed': props.pressed }
  return (
    <button type="button" className={props.small ? 'opt small' : 'opt'} onClick={props.onClick} {...aria}>
      {props.children}
      {props.pressed && <Ring />}
    </button>
  )
}

function BrushShape() {
  return (
    <svg viewBox="0 0 346 68" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={BRUSH}
        fill="var(--accent)"
        stroke="var(--ink)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Brush-stroke main action, sticky at the bottom. Renders a link with `href`. */
export function Cta(props: {
  children: ReactNode
  onClick?: () => void
  href?: string
  busy?: boolean
  error?: string | null
}) {
  return (
    <div className="cta-wrap">
      {props.error && (
        <p className="error" role="alert">
          {props.error}
        </p>
      )}
      {props.href ? (
        <a
          className="brush"
          href={props.href}
          onClick={(e) => {
            e.preventDefault()
            navigate(props.href!)
          }}
        >
          <BrushShape />
          <span>{props.children}</span>
        </a>
      ) : (
        <button type="button" className="brush" onClick={props.onClick} disabled={props.busy}>
          <BrushShape />
          <span>{props.busy ? copy.loading : props.children}</span>
        </button>
      )}
    </div>
  )
}

export function TornPaper(props: { children: ReactNode; tilt?: 'r' | 'l'; id?: string }) {
  return (
    <div className={`torn-paper${props.tilt ? ` tilt-${props.tilt}` : ''}`} id={props.id}>
      <svg viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={PAPER}
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {props.children}
    </div>
  )
}

/** In-app link (pushState). */
export function Link(props: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={props.href}
      className={props.className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        navigate(props.href)
      }}
    >
      {props.children}
    </a>
  )
}

export function Back({ href }: { href: string }) {
  return (
    <Link href={href} className="back">
      {copy.back}
    </Link>
  )
}

/** Decorative illustration from assets/icons. */
export function Deco(props: { icon: string; style: CSSProperties; className?: string }) {
  return (
    <img
      className={`deco ${props.className ?? ''}`}
      src={`/static/icons/${props.icon}.png`}
      alt=""
      aria-hidden="true"
      style={props.style}
    />
  )
}

/** Handwritten answer field with an optional length counter. */
export function QField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  maxLen?: number
  required?: boolean
  placeholder?: string
  multiline?: boolean
  name?: string
}) {
  const n = [...props.value].length
  const over = !!props.maxLen && n > props.maxLen
  const input = props.multiline ? (
    <textarea
      name={props.name}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
      rows={2}
    />
  ) : (
    <input
      name={props.name}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
      aria-invalid={over || undefined}
    />
  )
  return (
    <label className="q">
      <span className="top">
        <span>
          {props.label}
          {props.required && <span className="req"> ({copy.required})</span>}
        </span>
        {!!props.maxLen && (
          <span className={over ? 'count over' : 'count'} aria-hidden="true">
            {n}/{props.maxLen}
          </span>
        )}
      </span>
      {input}
    </label>
  )
}

/** Plain contact field (Heebo). */
export function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  error?: string
  ltr?: boolean
  multiline?: boolean
  placeholder?: string
  autoComplete?: string
  inputMode?: 'tel' | 'email' | 'numeric' | 'text'
}) {
  return (
    <label className="f">
      {props.label}
      {props.multiline ? (
        <textarea value={props.value} onChange={(e) => props.onChange(e.target.value)} rows={3} />
      ) : (
        <input
          className={props.ltr ? 'ltr' : undefined}
          type={props.type ?? 'text'}
          value={props.value}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          aria-invalid={!!props.error || undefined}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.error && <span className="err">{props.error}</span>}
    </label>
  )
}

export function Loading() {
  return (
    <main className="page" aria-busy="true">
      <div style={{ marginTop: 120, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    </main>
  )
}

export function Failed({ text }: { text: string }) {
  return (
    <main className="page">
      <p className="status" role="alert" style={{ marginTop: 80 }}>
        {text}
      </p>
      <Link href="/">{copy.toHome}</Link>
    </main>
  )
}
