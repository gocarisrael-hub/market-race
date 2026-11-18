// "With background / without background" for one photo, on the photos step and the manage page.
// Without background, the subject is cut out in the buyer's browser (src/web/shared/cutout.ts,
// Dugri's MediaPipe cutout, loaded only when first asked for) and sent with the choice.
import { useEffect, useState } from 'react'
import { ApiError, listPhotos, type Photo, type PhotoBackground, setPhotoBackground } from './api.ts'
import { copy } from './copy.ts'
import { errorText } from './logic.ts'
import { Opt, Polaroid, Spinner } from './ui.tsx'

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
      <div className="row" role="radiogroup" aria-label={copy.photos.background}>
        {(['keep', 'remove'] as const).map((b) => (
          <Opt key={b} small role="radio" pressed={photo.background === b} onClick={() => choose(b)}>
            {b === 'keep' ? copy.photos.withBg : copy.photos.withoutBg}
          </Opt>
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

/** The order's photos with their background choice, for the manage page. */
export function ManagePhotos({ token }: { token: string }) {
  const [items, setItems] = useState<Photo[]>([])
  useEffect(() => {
    listPhotos(token).then(
      (r) => setItems(r.photos),
      () => setItems([]),
    )
  }, [token])
  if (!items.length) return null
  return (
    <div className="photos manage-photos">
      {items.map((p, i) => (
        <div className="photo-row" key={p.id}>
          <Polaroid src={p.previewUrl} alt={copy.manage.photoAlt(i + 1)} tilt={i % 2 ? 3 : -3} />
          <BackgroundChoice
            token={token}
            photo={p}
            onChange={(next) => setItems((xs) => xs.map((x) => (x.id === next.id ? next : x)))}
          />
        </div>
      ))}
    </div>
  )
}
