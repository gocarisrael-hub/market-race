// "With background / without background" for one photo, on the photos step and the manage page,
// and the manage page's photo control (drop area with taped slots, each with that choice).
// Without background, the subject is cut out in the buyer's browser (src/web/shared/cutout.ts,
// Dugri's MediaPipe cutout, loaded only when first asked for) and sent with the choice.
import { useEffect, useState } from 'react'
import { Icon, SketchShape } from '../shared/decor.tsx'
import {
  ApiError,
  deletePhoto,
  listPhotos,
  type Photo,
  type PhotoBackground,
  setPhotoBackground,
} from './api.ts'
import { copy } from './copy.ts'
import { errorText, MAX_PHOTOS } from './logic.ts'
import { Link, Sketch, Spinner } from './ui.tsx'

export function BackgroundChoice(props: {
  token: string
  photo: Photo
  /** A local copy of the photo (just picked); otherwise the stored original is fetched. */
  source?: string
  onChange: (p: Photo) => void
}) {
  const { token, photo, source, onChange } = props
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const choose = async (background: PhotoBackground) => {
    if (busy || background === photo.background) return
    setBusy(true)
    setNote(null)
    try {
      if (background === 'keep' || photo.hasCutout) {
        onChange(await setPhotoBackground(token, photo.id, { background }))
        return
      }
      const blob = await fetch(source ?? photo.url).then((r) => r.blob())
      const { cutPhoto } = await import('../shared/cutout.ts')
      const cutout = await cutPhoto(blob)
      // A cutout the server refuses (no subject in it) is a miss like any other.
      const next = await setPhotoBackground(
        token,
        photo.id,
        cutout ? { background, cutout } : { background, failed: true },
      ).catch((e) =>
        e instanceof ApiError && e.status === 415
          ? setPhotoBackground(token, photo.id, { background, failed: true })
          : Promise.reject(e),
      )
      if (next.background !== 'remove') setNote(copy.photos.cutFailed)
      onChange(next)
    } catch (e) {
      setNote(errorText(e instanceof ApiError ? e.code : 'generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-choice">
      {/* One drawn outline around both words: the chosen one in ink-red, the other dimmed. */}
      <div className="bg-toggle" role="radiogroup" aria-label={copy.photos.background}>
        <SketchShape />
        {(['keep', 'remove'] as const).map((b, i) => (
          <span key={b} className="bg-side">
            {i > 0 && (
              <svg className="bg-slash" viewBox="0 0 8 24" aria-hidden="true">
                <path d="M6 2 C 5 9, 3 15, 2 22" />
              </svg>
            )}
            {/* biome-ignore lint/a11y/useSemanticElements: a drawn word, not a native radio dot */}
            <button
              type="button"
              role="radio"
              aria-checked={photo.background === b}
              disabled={busy}
              onClick={() => choose(b)}
            >
              {b === 'keep' ? copy.photos.withBg : copy.photos.withoutBg}
            </button>
          </span>
        ))}
      </div>
      {busy && (
        <span className="hint bg-busy" role="status">
          <Spinner />
          {copy.photos.cutting}
        </span>
      )}
      {note && (
        <p className="hint" role="alert">
          {note}
        </p>
      )}
    </div>
  )
}

const SLOT = 'M4 5 C 20 3, 40 6, 56 4 C 58 22, 55 44, 57 62 C 40 64, 20 61, 3 63 C 5 44, 2 22, 4 5 Z'
const DROP =
  'M8 10 C 90 4, 210 9, 292 6 C 296 40, 293 80, 295 112 C 210 117, 90 113, 6 115 C 3 80, 7 40, 8 10 Z'
const TILT = [-5, 3, -2, 4, -3]

/** One taped paper slot: the drawn photo, or dashes and a plus when empty. */
function Slot({ photo, index, alt }: { photo?: Photo; index: number; alt?: string }) {
  return (
    <span className={photo ? 'slot full' : 'slot'} style={{ ['--r' as string]: `${TILT[index]}deg` }}>
      <svg viewBox="0 0 60 66" preserveAspectRatio="none" aria-hidden="true">
        <path d={SLOT} vectorEffect="non-scaling-stroke" />
      </svg>
      {photo ? <img src={photo.previewUrl} alt={alt ?? ''} /> : <span className="plus">+</span>}
      {photo && <span className="washi" />}
    </span>
  )
}

/**
 * The manage page's photo control: a dashed, hand-drawn drop area with a camera and a "1/5" count
 * that leads to the photos page, and taped slots. A filled slot shows the drawn photo with its
 * background choice and a remove action; the whole area outside the slots is the link.
 */
export function PhotoDrop({ token, count }: { token: string; count: number }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loaded, setLoaded] = useState(!count)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!count) return
    listPhotos(token).then(
      (r) => {
        setPhotos(r.photos)
        setLoaded(true)
      },
      () => setLoaded(true),
    )
  }, [token, count])
  const n = loaded ? photos.length : count
  const remove = async (p: Photo) => {
    setError(null)
    try {
      await deletePhoto(token, p.id)
      setPhotos((xs) => xs.filter((x) => x.id !== p.id))
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : 'generic'))
    }
  }
  return (
    <div className="photo-drop">
      <svg className="drop-edge" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
        <path d={DROP} vectorEffect="non-scaling-stroke" />
      </svg>
      <Link href={`/order/${token}/photos`} className="drop-top">
        <span className="sr-only">{copy.manage.photosLink(n)}</span>
        <Icon name="camera" size={52} tilt={-8} />
        <span className="drop-word" aria-hidden="true">
          {n ? copy.manage.photosChange : copy.manage.photosAdd}
        </span>
        <span className="drop-count" aria-hidden="true">
          {copy.manage.photosCount(n, MAX_PHOTOS)}
        </span>
      </Link>
      <div className="drop-slots">
        {photos.map((p, i) => (
          <div className="slot-card" key={p.id}>
            <Slot photo={p} index={i} alt={copy.manage.photoAlt(i + 1)} />
            <BackgroundChoice
              token={token}
              photo={p}
              onChange={(next) => setPhotos((xs) => xs.map((x) => (x.id === next.id ? next : x)))}
            />
            <Sketch small icon="scissors" className="slot-remove" onClick={() => remove(p)}>
              {copy.photos.remove}
            </Sketch>
          </div>
        ))}
        <span className="drop-empty" aria-hidden="true">
          {Array.from({ length: MAX_PHOTOS - photos.length }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: empty slots are positional
            <Slot key={i} index={photos.length + i} />
          ))}
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
