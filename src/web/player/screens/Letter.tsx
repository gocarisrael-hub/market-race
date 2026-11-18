// The final letter: notes from friends with signatures, a collage of the photos taped between
// and around the notes, falling food, and the route.
import type { ReactNode } from 'react'
import { Paper } from '../draw.tsx'
import { iconUrl, stopIcon } from '../logic.ts'
import { TapedPhoto, useLightbox } from '../photo.tsx'
import type { ScreenProps } from './types.ts'

const PHOTO_TILTS = [5, -6, 4, -4, 6]

const FALLING = [
  { icon: 'tomatoes', left: '6%', size: 54, delay: '0s', dur: '7s' },
  { icon: 'fruit', left: '34%', size: 60, delay: '-2.4s', dur: '7.5s' },
  { icon: 'falafel', left: '76%', size: 56, delay: '-4.6s', dur: '7s' },
  { icon: 'hummus', left: '56%', size: 58, delay: '-1.2s', dur: '8.5s' },
  { icon: 'spices', left: '18%', size: 50, delay: '-5.8s', dur: '9s' },
]

export function Letter({ view, t }: Omit<ScreenProps, 'act'>) {
  const letter = view.letter ?? { notes: [], photos: [] }
  const n = view.totalStops
  const lightbox = useLightbox(t, t('letter.photoAlt'))

  // The collage: photo, note, photo, note... photos alternate sides and overlap the notes' edges.
  const pieces: ReactNode[] = []
  const count = Math.max(letter.notes.length, letter.photos.length)
  for (let i = 0; i < count; i++) {
    const src = letter.photos[i]
    if (src)
      pieces.push(
        <TapedPhoto
          key={`p${src}`}
          className={`letter-photo rise ${i % 2 ? 'side-r' : 'side-l'}`}
          src={src}
          alt={t('letter.photoAlt')}
          tilt={PHOTO_TILTS[i % PHOTO_TILTS.length]}
          t={t}
          onOpen={lightbox.open}
          style={{ animationDelay: `${0.2 + i * 0.3}s` }}
        />,
      )
    const note = letter.notes[i]
    if (note)
      pieces.push(
        <Paper
          key={`n${i}`}
          className={`letter-note rise ${i % 2 ? 'shift-l' : 'shift-r'}`}
          tilt={[-2.5, 2, -1.5, 2.5][i % 4]}
          style={{ animationDelay: `${0.3 + i * 0.35}s` }}
        >
          <p>"{note.text}"</p>
          {note.signature && <div className="sig">{note.signature}</div>}
        </Paper>,
      )
  }
  return (
    <main className="scr letter">
      <div className="falling" aria-hidden="true">
        {FALLING.map((f) => (
          <img
            key={f.icon}
            src={iconUrl(f.icon)}
            alt=""
            style={{ left: f.left, width: f.size, animationDelay: f.delay, animationDuration: f.dur }}
          />
        ))}
      </div>

      <header className="letter-head">
        <div className="muted-label">{t('letter.kicker')}</div>
        <h1 className="letter-title pop">{t('letter.title', { name: view.honoree })}</h1>
        {view.company?.logo && (
          <img
            className="letter-logo"
            src={view.company.logo}
            alt={t('letter.logoAlt', { company: view.company.name })}
          />
        )}
      </header>

      <div className={`letter-notes ${letter.photos.length ? 'with-photos' : ''}`}>{pieces}</div>

      <div className="letter-summary">
        <div className="cup" aria-hidden="true">
          <svg viewBox="0 0 60 40" className="steam" aria-hidden="true">
            <path d="M15 36 C 8 26, 22 20, 15 8" />
            <path d="M32 36 C 25 26, 39 20, 32 8" />
          </svg>
          <img src={iconUrl('coffee')} alt="" />
        </div>
        <p className="summary-lines">
          {t('letter.summaryRiddles', { n })}
          <br />
          {t('letter.summaryTastings', { n })}
          <br />
          {t('letter.summaryEnd')}
        </p>
      </div>

      {view.completed.length > 0 && (
        <section className="route">
          <h2>{t('letter.route')}</h2>
          <ol>
            {view.completed.map((c) => (
              <li key={c.index}>
                <img src={stopIcon(c.index)} alt="" />
                <span className="route-stall">{c.stall}</span>
                <span className="route-tasting">{c.tasting}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="keep">{t('letter.keep')}</p>
      {lightbox.element}
    </main>
  )
}
