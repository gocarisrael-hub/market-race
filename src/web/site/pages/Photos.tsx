// Step 3: optional photos, each shown next to its game version (the doodle frame) (a taped polaroid, as it
// appears in the game). Also reachable from the manage page until the game starts.
import { useEffect, useState } from 'react'
import { Doodles, Icon } from '../../shared/decor.tsx'
import { ApiError, deletePhoto, listPhotos, type Photo, type Shop, uploadPhoto } from '../api.ts'
import { copy } from '../copy.ts'
import { type Draft, decorFor, errorText, MAX_PHOTOS } from '../logic.ts'
import { BackgroundChoice } from '../photo-background.tsx'
import { Arrow, Back, Cta, Deco, Polaroid, Sketch, Spinner, StepTrail, TitleIcon } from '../ui.tsx'
import { STEPS } from './Home.tsx'

type Item = Photo & { local?: string }

const DROP_EDGE =
  'M8 10 C 90 4, 210 9, 292 6 C 296 40, 293 80, 295 112 C 210 117, 90 113, 6 115 C 3 80, 7 40, 8 10 Z'

export function Photos(props: { token: string; shop: Shop; draft: Draft }) {
  const { token, shop, draft } = props
  const decor = draft.manageToken === token ? decorFor(shop, draft.occasionKey) : null
  const [items, setItems] = useState<Item[]>([])
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    listPhotos(token).then(
      (r) => {
        setItems(r.photos)
        setPaid(r.paid)
      },
      () => setUnavailable(true),
    )
  }, [token])

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
    <main className="page" data-decor={decor ?? undefined}>
      {decor && (
        <Doodles
          className="deco"
          decor={decor}
          spots={[
            { top: 330, left: 8, size: 46, rot: 10 },
            { top: 620, left: -8, size: 40, rot: -8 },
          ]}
        />
      )}
      <Deco
        icon="coffee"
        className="bob"
        style={{ top: 30, left: -10, width: 70, ['--r' as string]: '8deg' }}
      />
      <Back href={paid ? `/m/${token}` : '/order/questions'} />
      <div style={{ marginTop: 18, marginLeft: 40 }}>
        <StepTrail step={3} total={STEPS} />
        <div className="title-row">
          <h1 className="title rise" style={{ fontSize: 56 }}>
            {copy.photos.title(draft.manageToken === token ? draft.form : null)}
          </h1>
          <TitleIcon icon="camera" />
        </div>
        <p className="lead">{copy.photos.intro}</p>
        <p className="hint">{copy.photos.bgHint}</p>
        <p className="photos-where">
          {copy.photos.where}
          <span className="hint"> {copy.photos.order}</span>
        </p>
      </div>

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

      {paid ? (
        <Cta href={`/m/${token}`}>{copy.photos.done}</Cta>
      ) : (
        <Cta href={`/order/${token}/pay`}>{copy.photos.next}</Cta>
      )}
    </main>
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
