// Customer photos in the game: a taped polaroid (white border, washi tape, a drawn shadow line)
// that opens bigger in an in-page lightbox. Used on the riddle note and the final letter.
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import type { T } from './copy.ts'

const SHADE = 'M6 4 C 50 9, 110 6, 150 8 S 190 6, 196 3'
const CLOSE = 'M8 8 C 18 17, 28 27, 40 38 M38 8 C 29 18, 19 28, 7 39'

export function TapedPhoto({
  src,
  alt,
  tilt,
  t,
  onOpen,
  className = '',
  style,
}: {
  src: string
  alt: string
  tilt: number
  t: T
  onOpen: (src: string) => void
  className?: string
  style?: CSSProperties
}) {
  return (
    <figure className={`polaroid ${className}`} style={{ ...style, ['--r' as string]: `${tilt}deg` }}>
      <span className="washi washi-a" aria-hidden="true" />
      <span className="washi washi-b" aria-hidden="true" />
      <button
        type="button"
        className="polaroid-open"
        onClick={() => onOpen(src)}
        aria-label={t('photo.open')}
      >
        <img src={src} alt={alt} />
      </button>
      <svg className="polaroid-shade" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        <path d={SHADE} vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  )
}

/** State for one lightbox per screen: `open(src)` shows it, the element renders it. */
export function useLightbox(t: T, alt: string) {
  const [src, setSrc] = useState<string | null>(null)
  const close = useCallback(() => setSrc(null), [])
  const element = src ? <Lightbox src={src} alt={alt} t={t} onClose={close} /> : null
  return { open: setSrc, element }
}

function Lightbox({ src, alt, t, onClose }: { src: string; alt: string; t: T; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [onClose])
  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('photo.dialog')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <figure className="polaroid lightbox-photo" style={{ ['--r' as string]: '-1.5deg' }}>
        <span className="washi washi-a" aria-hidden="true" />
        <span className="washi washi-b" aria-hidden="true" />
        <img src={src} alt={alt} />
        <svg className="polaroid-shade" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
          <path d={SHADE} vectorEffect="non-scaling-stroke" />
        </svg>
      </figure>
      <button ref={closeRef} type="button" className="lightbox-close" onClick={onClose}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d={CLOSE} />
        </svg>
        <span>{t('photo.close')}</span>
      </button>
    </div>
  )
}
