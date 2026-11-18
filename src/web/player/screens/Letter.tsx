// The final letter: notes from friends with signatures, photos, falling food, and the route.
import { Doodles } from '../../shared/decor.tsx'
import { Paper, Tape } from '../draw.tsx'
import { iconUrl, stopIcon } from '../logic.ts'
import type { ScreenProps } from './types.ts'

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
  return (
    <main className="scr letter" data-decor={view.decor}>
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
        <Doodles
          decor={view.decor}
          spots={[
            { top: 4, left: '1%', size: 48, rot: -10 },
            { top: 46, right: '1%', size: 42, rot: 12 },
            { top: 120, left: '6%', size: 30, rot: 6 },
          ]}
        />
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

      {letter.photos.length > 0 && (
        <div className={`letter-photos n${Math.min(letter.photos.length, 3)}`}>
          {letter.photos.map((src, i) => (
            <figure
              key={src}
              className="letter-photo rise"
              style={{
                ['--r' as string]: `${[4, -5, 3, -3, 5][i % 5]}deg`,
                animationDelay: `${0.2 + i * 0.2}s`,
              }}
            >
              <Tape />
              <img src={src} alt={t('letter.photoAlt')} loading="lazy" />
            </figure>
          ))}
        </div>
      )}

      <div className="letter-notes">
        {letter.notes.map((note, i) => (
          <Paper
            // biome-ignore lint/suspicious/noArrayIndexKey: notes are positional
            key={i}
            className={`letter-note rise ${i % 2 ? 'shift-l' : 'shift-r'}`}
            tilt={[-2.5, 2, -1.5, 2.5][i % 4]}
            style={{ animationDelay: `${0.3 + i * 0.35}s` }}
          >
            <p>"{note.text}"</p>
            {note.signature && <div className="sig">{note.signature}</div>}
          </Paper>
        ))}
      </div>

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
    </main>
  )
}
