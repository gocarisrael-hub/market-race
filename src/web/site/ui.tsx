// Hand-drawn building blocks, SVG paths taken from docs/mockup.
import { type CSSProperties, type ReactNode, useId, useState } from 'react'
import { themeVars } from '../../server/domain/look.ts'
import type { Palette } from '../../server/domain/types.ts'
import { type DoodleName, Icon, SketchShape } from '../shared/decor.tsx'
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
      {props.pressed && <Tick />}
    </button>
  )
}

/** A hand-drawn checkmark, drawn at the corner of a chosen option. */
export function Tick({ className = 'tick' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 20" aria-hidden="true">
      <path className="draw" d="M3 11 C 6 13, 8 16, 9 18 C 12 11, 16 6, 22 2" />
    </svg>
  )
}

/**
 * The drawn progress trail of the order flow (like the riddle trail of the game): a dashed walk
 * from step to step, done steps ticked, the current one circled. The text stays for screen readers.
 */
export function StepTrail({ step, total }: { step: number; total: number }) {
  const labels = copy.trail
  return (
    <nav className="step-trail" aria-label={copy.stepOf(step, total)}>
      <svg className="step-path" viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true">
        <path d="M384 26 C 340 6, 312 50, 268 30 S 190 6, 150 34 S 70 52, 16 28" />
      </svg>
      <ol>
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1
          const state = n < step ? 'done' : n === step ? 'now' : 'later'
          return (
            <li key={n} className={state} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="dot">
                {state === 'done' ? <Tick className="dot-tick" /> : n}
                {state === 'now' && <Ring />}
              </span>
              <span className="word">{labels[i] ?? ''}</span>
            </li>
          )
        })}
      </ol>
      <span className="eyebrow sr-only">{copy.stepOf(step, total)}</span>
    </nav>
  )
}

// A torn-off note for a question: ragged top and bottom edges.
const SCRAP =
  'M4 18 L 22 8 L 41 16 L 63 6 L 84 14 L 106 5 L 127 13 L 150 4 L 171 12 L 193 6 L 214 15 L 236 5 L 257 13 L 278 7 L 296 14 L 293 150 L 297 284 L 279 292 L 258 284 L 236 295 L 215 286 L 193 294 L 172 285 L 150 296 L 128 287 L 106 294 L 85 285 L 63 295 L 42 286 L 21 293 L 3 285 L 6 150 Z'

// A scrap torn on all sides: ragged top and bottom, slightly crooked sides.
const NOTE =
  'M3 9 L 12 6 L 20 8.5 L 31 5 L 40 7.5 L 52 4.5 L 63 7 L 75 5 L 88 8 L 99 4.5 L 112 7.5 L 124 5 L 137 8 L 149 5 L 160 7.5 L 172 4.5 L 184 7 L 197 6 L 195 18 L 198 31 L 196 44 L 185 46.5 L 173 43.5 L 161 47 L 148 44 L 136 47 L 123 44.5 L 111 46.5 L 98 43.5 L 86 47 L 73 44 L 61 46.5 L 48 43.5 L 36 47 L 24 44 L 13 46.5 L 4 44 L 6 31 L 2 19 Z'

/** A question on a scrap of torn paper, handwritten (the section titles of the order flow). */
export function QNote(props: { id?: string; children: ReactNode; tilt?: number; icon?: DoodleName }) {
  return (
    <div className="qnote" id={props.id} style={{ ['--r' as string]: `${props.tilt ?? -1.5}deg` }}>
      <svg viewBox="0 0 200 50" preserveAspectRatio="none" aria-hidden="true">
        <path d={NOTE} vectorEffect="non-scaling-stroke" />
      </svg>
      <span>
        {props.icon && <Icon name={props.icon} size={30} tilt={-8} className="qnote-icon" />}
        {props.children}
      </span>
    </div>
  )
}

// Brush smears of paint, each a little different.
const DAUBS = [
  'M6 24 C 4 14, 14 8, 24 10 C 32 6, 44 5, 52 10 C 60 13, 62 22, 57 28 C 60 34, 50 39, 40 36 C 32 40, 20 39, 12 35 C 5 33, 3 29, 6 24 Z',
  'M5 20 C 6 11, 18 9, 28 11 C 38 8, 50 9, 56 14 C 62 19, 59 27, 55 30 C 52 36, 40 37, 31 34 C 22 38, 10 36, 7 30 C 3 27, 4 23, 5 20 Z',
  'M8 18 C 12 10, 24 12, 33 9 C 43 7, 55 11, 58 19 C 61 26, 56 33, 47 34 C 38 37, 28 35, 19 37 C 10 37, 4 30, 8 18 Z',
]
const STREAKS = 'M14 19 C 26 16, 40 15, 52 18 M11 27 C 24 25, 37 26, 50 28 M18 33 C 28 31, 36 32, 44 33'

/** A paint daub in a palette's colors: one clean smear of the accent, nothing at its corner. */
export function Daub({ palette, index }: { palette: Palette; index: number }) {
  return (
    <svg className="daub-shape" viewBox="0 0 64 44" aria-hidden="true">
      <path d={DAUBS[index % DAUBS.length]} fill={palette.accent} />
      <path d={STREAKS} fill="none" stroke={palette.ink} strokeOpacity="0.22" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * A small "how it will look" preview: the map tinted with the palette, the palette's background
 * under a torn edge, and the ribbon and button in the colors the game derives from the palette.
 */
export function LookPreview(props: { map: string | null; palette: Palette; name: string }) {
  const v = themeVars(props.palette)
  const style = {
    '--pv-bg': v['--bg'],
    '--pv-ribbon': v['--ribbon'],
    '--pv-ribbon-tail': v['--ribbon-tail'],
    '--pv-on-ribbon': v['--on-ribbon'],
    '--pv-accent': v['--accent'],
    '--pv-on-accent': v['--on-accent'],
    '--pv-ink': v['--ink'],
  } as CSSProperties
  return (
    <figure className="look-preview" style={style} data-testid="look-preview" data-bg={v['--bg']}>
      <div className="pv-map">
        {props.map && <img src={props.map} alt={copy.home.previewAlt(props.name)} />}
        {props.map && props.palette.mapTint && (
          <span className="map-tint" style={{ background: props.palette.mapTint }} />
        )}
      </div>
      <div className="pv-sheet">
        <svg className="pv-edge" viewBox="0 0 390 30" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 30 L0 18 C 40 3, 70 23, 110 11 S 180 -2, 220 12 S 300 24, 340 8 S 380 3, 390 10 L390 30 Z" />
        </svg>
        <div className="pv-ribbon">
          <svg viewBox="0 0 330 92" preserveAspectRatio="none" aria-hidden="true">
            <path className="tail" d="M8 26 L40 20 L34 46 L40 72 L8 66 L20 46 Z" />
            <path className="tail" d="M322 26 L290 20 L296 46 L290 72 L322 66 L310 46 Z" />
            <path className="main" d="M34 12 Q165 -4 296 12 L296 72 Q165 56 34 72 Z" />
          </svg>
          <span>{copy.home.previewRibbon}</span>
        </div>
        <div className="pv-button">
          <svg viewBox="0 0 346 68" preserveAspectRatio="none" aria-hidden="true">
            <path d={BRUSH} />
          </svg>
          <span>{copy.home.previewButton}</span>
        </div>
      </div>
    </figure>
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

/**
 * A secondary action: a handwritten word in a hand-drawn outline, with an optional drawn icon.
 * An in-app link with `href`, an outside link with `external`, otherwise a button.
 */
export function Sketch(props: {
  children: ReactNode
  href?: string
  external?: boolean
  onClick?: () => void
  icon?: DoodleName
  small?: boolean
  className?: string
  disabled?: boolean
  label?: string
}) {
  const cls = `sketch${props.small ? ' small' : ''} ${props.className ?? ''}`
  const inner = (
    <>
      <SketchShape />
      {props.icon && <Icon name={props.icon} />}
      <span>{props.children}</span>
    </>
  )
  if (props.href && props.external)
    return (
      <a className={cls} href={props.href} target="_blank" rel="noopener" aria-label={props.label}>
        {inner}
      </a>
    )
  if (props.href)
    return (
      <Link href={props.href} className={cls}>
        {inner}
      </Link>
    )
  return (
    <button
      type="button"
      className={cls}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
    >
      {inner}
    </button>
  )
}

/** The brush-stroke button inline in the page (not sticky). In-app link, outside link or button. */
export function Brush(props: {
  children: ReactNode
  href?: string
  external?: boolean
  onClick?: () => void
  small?: boolean
  icon?: DoodleName
}) {
  const cls = `brush inline${props.small ? ' small' : ''}`
  const inner = (
    <>
      <BrushShape />
      <span>
        {props.icon && <Icon name={props.icon} className="on-brush" />}
        {props.children}
      </span>
    </>
  )
  if (props.href && props.external)
    return (
      <a className={cls} href={props.href}>
        {inner}
      </a>
    )
  if (props.href)
    return (
      <a
        className={cls}
        href={props.href}
        onClick={(e) => {
          e.preventDefault()
          navigate(props.href!)
        }}
      >
        {inner}
      </a>
    )
  return (
    <button type="button" className={cls} onClick={props.onClick}>
      {inner}
    </button>
  )
}

/** A section title in the handwritten face, with a drawn icon and a brush underline. */
export function SectionHead(props: { icon: DoodleName; children: ReactNode; id?: string; tilt?: number }) {
  return (
    <h2 className="sub section-head" id={props.id}>
      <Icon name={props.icon} size={40} tilt={props.tilt ?? -6} />
      <span>{props.children}</span>
    </h2>
  )
}

/** The big title of a page with the step's own drawn icon beside it. */
export function TitleIcon({ icon }: { icon: DoodleName }) {
  return (
    <span className="title-icon" aria-hidden="true">
      <Icon name={icon} size={58} tilt={8} />
      <Ring />
    </span>
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
  /** Draws the question on a torn paper note, tilted by this many degrees. */
  paper?: number
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
    <label
      className={props.paper === undefined ? 'q' : 'q on-paper'}
      style={props.paper === undefined ? undefined : { ['--r' as string]: `${props.paper}deg` }}
    >
      {props.paper !== undefined && (
        <svg className="q-paper" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
          <path d={SCRAP} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
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
      <Sketch href="/" icon="house" small>
        {copy.toHome}
      </Sketch>
    </main>
  )
}

/** An illustrated photo as a taped polaroid: white border, two washi strips, a drawn shadow line. */
export function Polaroid({ src, alt, tilt = -3 }: { src: string; alt: string; tilt?: number }) {
  return (
    <figure className="polaroid" style={{ ['--r' as string]: `${tilt}deg` }}>
      <span className="washi washi-a" aria-hidden="true" />
      <span className="washi washi-b" aria-hidden="true" />
      <img src={src} alt={alt} />
      <svg className="polaroid-shade" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        <path d="M6 4 C 50 9, 110 6, 150 8 S 190 6, 196 3" vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  )
}

/** The links between the landing page, the tastings and the order, in handwriting. */
export function SiteNav({ current }: { current: 'about' | 'tastings' | 'order' }) {
  const items = [
    { key: 'about', href: '/', label: copy.nav.about },
    { key: 'tastings', href: '/tastings', label: copy.nav.tastings },
    { key: 'order', href: '/order', label: copy.nav.order },
  ] as const
  return (
    <nav className="site-nav" aria-label={copy.nav.label}>
      {items.map((it) =>
        it.key === current ? (
          <span key={it.key} className="site-nav-item" aria-current="page">
            {it.label}
            <Underline />
          </span>
        ) : (
          <Link key={it.key} href={it.href} className="site-nav-item">
            {it.label}
          </Link>
        ),
      )}
    </nav>
  )
}

/**
 * An expandable section, closed until opened: a handwritten heading on a button (aria-expanded),
 * the content opening in place under it.
 */
export function Fold(props: { title: string; icon: DoodleName; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <section className={`section fold${open ? ' open' : ''} ${props.className ?? ''}`}>
      <h2 className="fold-head">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <Icon name={props.icon} size={40} tilt={-6} />
          <span>{props.title}</span>
          <svg className="fold-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 9 C 9 12, 11 14, 12 16 C 14 13, 16 11, 19 8" />
          </svg>
        </button>
      </h2>
      <div className="fold-body" id={id} hidden={!open}>
        {open && props.children}
      </div>
    </section>
  )
}
