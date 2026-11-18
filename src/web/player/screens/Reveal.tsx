// Reveal: "נכון!", the answer, and the next stall marked on the map.
import { useState } from 'react'
import { Confetti, Doodles } from '../../shared/decor.tsx'
import type { T } from '../copy.ts'
import { BrushButton, PinMark, Rays, Underline } from '../draw.tsx'
import { mapFrame, stopIcon, trailPath } from '../logic.ts'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

const FRAME_RATIO = 0.9 // height / width of the map crop
const CLIP =
  'polygon(8% 12%, 30% 3%, 55% 7%, 80% 2%, 96% 14%, 99% 40%, 94% 66%, 98% 88%, 78% 97%, 52% 93%, 26% 99%, 6% 90%, 2% 64%, 5% 38%)'

export function MapCrop({
  map,
  pin,
  icon,
  company,
  tint,
  t,
}: {
  map: string | null
  tint?: string
  pin: { x: number; y: number } | null
  icon: string
  company: { name: string; logo: string | null } | null
  t: T
}) {
  // Maps are portrait; the real ratio is read once the image loads.
  const [ratio, setRatio] = useState(1.42)
  const f = pin ? mapFrame(pin, ratio, FRAME_RATIO, 1.8) : null
  return (
    <div className="map-crop rise" style={{ aspectRatio: `1 / ${FRAME_RATIO}` }}>
      <div className="map-clip" style={{ clipPath: CLIP }}>
        {map && (
          <img
            className={f ? 'map-zoom' : 'map-full'}
            src={map}
            alt={t('reveal.mapAlt')}
            onLoad={(e) => {
              const im = e.currentTarget
              if (im.naturalWidth) setRatio(im.naturalHeight / im.naturalWidth)
            }}
            style={f ? { left: `${f.left}%`, top: `${f.top}%`, width: `${f.width}%` } : undefined}
          />
        )}
        {map && tint && <span className="map-tint" style={{ background: tint }} />}
        {f && (
          <svg className="map-marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="map-path" d={trailPath(f.x, f.y)} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
      {f && (
        <span className="map-x" style={{ left: `${f.x}%`, top: `${f.y}%` }} aria-hidden="true">
          <span className="map-pulse" />
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path className="draw" d="M8 8 L 32 32 M 32 8 L 8 32" />
          </svg>
        </span>
      )}
      <img className={`map-icon bob ${f && f.x > 50 ? 'at-left' : 'at-right'}`} src={icon} alt="" />
      {company?.logo && (
        <span
          className={`map-stamp pop ${f && f.x > 50 ? 'side-r' : 'side-l'} ${f && f.y > 50 ? 'top' : 'bottom'}`}
        >
          <img src={company.logo} alt={t('reveal.stampAlt', { company: company.name })} />
        </span>
      )}
    </div>
  )
}

export function Reveal({ view, t, act }: ScreenProps) {
  const cur = view.current!
  const rv = cur.reveal!
  const { busy, run } = useBusy()
  return (
    <main className="scr reveal" data-decor={view.decor}>
      <Confetti decor={view.decor} />
      <div className="reveal-head">
        <Rays />
        <Doodles
          decor={view.decor}
          spots={[
            { top: 6, left: '4%', size: 46, rot: -12 },
            { top: 0, right: '5%', size: 42, rot: 10 },
          ]}
        />
        <h1 className="correct pop">{t('reveal.correct')}</h1>
        <p className="answer-was rise">{t('reveal.answerWas', { answer: rv.answer })}</p>
        {rv.afterText && <p className="after-text rise">{rv.afterText}</p>}
      </div>

      <MapCrop
        map={view.theme?.map ?? null}
        pin={rv.stall.pin}
        icon={stopIcon(cur.index)}
        company={view.company}
        tint={view.theme?.palette.mapTint}
        t={t}
      />

      <section className="reveal-stall rise">
        {rv.usingBackup && (
          <p className="closed-note">
            {t('reveal.closed', { original: rv.originalStallName ?? '' })}
            {rv.closedNote && <span className="closed-why"> {rv.closedNote}</span>}
          </p>
        )}
        <div className="muted-label">{cur.finale ? t('reveal.nextLast') : t('reveal.next')}</div>
        <h2 className="stall-name">{rv.stall.name}</h2>
        <Underline />
        {rv.stall.locationHint && (
          <p className="location">
            <PinMark />
            <span>{rv.stall.locationHint}</span>
          </p>
        )}
        <p className="tell">{t('reveal.tellThem', { name: view.honoree })}</p>
      </section>

      <div className="foot">
        <BrushButton
          disabled={busy}
          onClick={() => run(() => act({ type: 'arrived', stopIndex: cur.index }))}
        >
          {t('reveal.button')}
        </BrushButton>
      </div>
    </main>
  )
}
