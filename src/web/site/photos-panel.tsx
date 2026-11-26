// The photos of an order: up to five, each shown next to its game version (a taped polaroid, as it
// appears in the game), with the background choice. Used by the build's photos stage and by the
// photos page opened from the manage page.
import { useEffect, useState } from 'react'
import { Icon } from '../shared/decor.tsx'
import { ApiError, deletePhoto, listPhotos, type Photo, uploadPhoto } from './api.ts'
import { copy } from './copy.ts'
import { errorText, MAX_PHOTOS } from './logic.ts'
import { BackgroundChoice } from './photo-background.tsx'
import { Arrow, Polaroid, Sketch, Spinner } from './ui.tsx'

type Item = Photo & { local?: string }

const DROP_EDGE =
  'M8 10 C 90 4, 210 9, 292 6 C 296 40, 293 80, 295 112 C 210 117, 90 113, 6 115 C 3 80, 7 40, 8 10 Z'

export function PhotosPanel(props: {
  token: string
  /** Called with the photos whenever they change (loaded, added, removed, redrawn). */
  onPhotos?: (photos: Photo[]) => void
  /** Called once the order is loaded: whether it is paid. */
  onPaid?: (paid: boolean) => void
}) {
  const { token, onPhotos, onPaid } = props
  const [items, setItems] = useState<Item[]>([])
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: loads once per order
  useEffect(() => {
    listPhotos(token).then(
      (r) => {
        setItems(r.photos)
        onPaid?.(r.paid)
      },
      () => setUnavailable(true),
    )
  }, [token])
  // biome-ignore lint/correctness/useExhaustiveDependencies: reports the list, not the callback
  useEffect(() => {
    onPhotos?.(items)
  }, [items])

  const room = MAX_PHOTOS - items.length - uploading
  const add = async (files: FileList | null) => {
    setError(null)
    const list = Array.from(files ?? []).slice(0, Math.max(0, room))
    if (!list.length) return
    setUploading((n) => n + list.length)
    for (const file of list) {
      try {
        const photo = await uploadPhoto(token, file)
        setItems((xs) => [...xs, { ...photo, local: URL.createObjectURL(file) }])
        setUnavailable(false)
      } catch (e) {
        setError(photoErrorText(e instanceof ApiError ? e : new ApiError('generic', 0)))
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }
  const remove = async (p: Item) => {
    try {
      await deletePhoto(token, p.id)
      setItems((xs) => xs.filter((x) => x.id !== p.id))
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : 'generic'))
    }
  }

  return (
    <>
      <div className="photos">
        {items.map((p, i) => (
          <div className="photo-pair rise" key={p.id}>
            <img className="orig" src={p.local ?? p.url} alt={copy.photos.original} />
            <Arrow />
            <Polaroid src={p.previewUrl} alt={copy.photos.drawn} tilt={i % 2 ? 3 : -3} />
            <BackgroundChoice
              token={token}
              photo={p}
              source={p.local}
              onChange={(next) => setItems((xs) => xs.map((x) => (x.id === next.id ? { ...x, ...next } : x)))}
            />
            <Sketch small icon="scissors" className="remove" onClick={() => remove(p)}>
              {copy.photos.remove}
            </Sketch>
          </div>
        ))}
        {uploading > 0 && (
          <div className="photo-pair" role="status">
            <Spinner />
            <span className="hint" style={{ gridColumn: '2 / -1' }}>
              {copy.photos.uploading}
            </span>
          </div>
        )}
      </div>

      <div className="section">
        {room > 0 && (
          <label className="file-drop">
            <svg className="drop-edge" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
              <path d={DROP_EDGE} vectorEffect="non-scaling-stroke" />
            </svg>
            <Icon name="camera" size={52} tilt={-8} />
            <span className="drop-word">{copy.photos.add(items.length)}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                add(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        )}
        <p className="hint photo-count">
          <Icon name="frame" size={26} />
          <span>{copy.photos.count(items.length, MAX_PHOTOS)}</span>
        </p>
      </div>
      {room <= 0 && !uploading && <p className="hint">{copy.photos.full}</p>}
      {unavailable && !items.length && !error && <p className="hint">{copy.photos.unavailable}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">{copy.photos.privacy}</p>
    </>
  )
}

/** Friendly text for a failed upload (codes from src/server/routes/public-photos.ts). */
function photoErrorText(e: ApiError) {
  if (e.code === 'too_many') return copy.photos.full
  if (e.status === 413) return copy.photos.tooBig
  if (e.code === 'unsupported_type' || e.code === 'unreadable_image' || e.code === 'no_file')
    return copy.photos.failed
  if (e.code === 'locked') return copy.photos.locked
  if (e.status === 404) return copy.photos.unavailable
  return errorText(e.code)
}
