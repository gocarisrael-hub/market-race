// A personal mini-game between stops: "מי אמר את זה?", "נכון או לא נכון", "מה בתמונה?" or
// "צופן אישי". Built only from the order's own answers; the phone never gets the solution, only
// "right" or "wrong". Solving it opens a line of the closing letter, on a torn piece of paper with
// confetti. The captain can skip it. Keyed by stage, so a poll never clears what is being chosen.
import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { TextPart } from '../../../server/domain/types.ts'
import { Burst, Confetti, Icon } from '../../shared/decor.tsx'
import { useWide } from '../../shared/useWide.ts'
import type { CopyKey, T } from '../copy.ts'
import { BrushButton, HandCircle, Paper, SketchButton, Tape } from '../draw.tsx'
import { GameSide } from './GameSide.tsx'
import { GAME_ICONS, StageTrail } from './Stages.tsx'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

type Game = NonNullable<ScreenProps['view']['minigame']>

/** Zoom steps of the photo game: close up first, the whole photo last. */
export const PHOTO_ZOOMS = [3.2, 2.2, 1.5, 1]

function Parts({ parts }: { parts: TextPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === 'slot' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
          <span key={i} className="slot">
            {p.v}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
          <span key={i}>{p.v}</span>
        ),
      )}
    </>
  )
}

/** A gentle shake on a wrong answer. */
function useShake(n: number) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!n || !el?.animate) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-7px) rotate(-0.6deg)' },
        { transform: 'translateX(6px) rotate(0.6deg)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 420, easing: 'ease-out' },
    )
  }, [n])
  return ref
}

export function MiniGame({ view, t, act, captain = false }: ScreenProps & { captain?: boolean }) {
  const game = view.minigame!
  const wide = useWide()
  return (
    <main className="scr riddle minigame" data-decor={view.decor} data-game={game.type}>
      <StageTrail view={view} t={t} />
      <div className="riddle-main">
        {game.solved ? (
          <Solved view={view} game={game} t={t} act={act} />
        ) : (
          <Play view={view} game={game} t={t} act={act} captain={captain} />
        )}
      </div>
      {wide && <GameSide view={view} t={t} />}
    </main>
  )
}

function Play({ view, game, t, act, captain }: ScreenProps & { game: Game; captain: boolean }) {
  const { busy, run } = useBusy()
  const [wrong, setWrong] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [crossed, setCrossed] = useState<number[]>([])
  const [truths, setTruths] = useState<(boolean | null)[]>(() => (game.statements ?? []).map(() => null))
  const [text, setText] = useState('')
  const [zoom, setZoom] = useState(0)
  const [skipping, setSkipping] = useState(false)
  const shakeRef = useShake(wrong)

  const send = (answer: { option?: number; truths?: boolean[]; text?: string }, onWrong?: () => void) =>
    run(async () => {
      const r = await act({ type: 'minigame', stopIndex: view.stopIndex, game: game.index, answer })
      if (r.kind === 'view' && r.correct === false) {
        setWrong((n) => n + 1)
        setMessage(game.type === 'true_false' ? t('game.tfWrong') : t('game.wrong'))
        onWrong?.()
      }
    })

  const pick = (option: number) => {
    if (busy || crossed.includes(option)) return
    void send({ option }, () => {
      setCrossed((c) => [...c, option])
      // A wrong guess on the photo shows a little more of it.
      if (game.type === 'photo') setZoom((z) => Math.min(PHOTO_ZOOMS.length - 1, z + 1))
    })
  }

  const submitTruths = (e: FormEvent) => {
    e.preventDefault()
    if (truths.some((v) => v === null)) {
      setMessage(t('game.pickAll'))
      return
    }
    void send({ truths: truths as boolean[] })
  }

  const submitText = (e: FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) {
      setMessage(t('game.empty'))
      return
    }
    void send({ text: value })
  }

  const title = t(`game.${game.type}.title` as CopyKey)
  return (
    <>
      <Paper className="note game-note rise" tilt={game.index % 2 ? -1.2 : 1.2}>
        <p className="game-kicker">
          <Icon name="sparkle" size={22} tilt={10} />
          {t('game.kicker')}
        </p>
        <h1 className="note-kicker game-title">
          <Icon name={GAME_ICONS[game.type]} size={38} tilt={-8} />
          {title}
        </h1>
        <p className="game-only">{t('game.only', { name: view.honoree })}</p>

        {game.type === 'photo' && game.photo && (
          <PhotoZoom src={game.photo} focus={game.focus} level={zoom} alt={t('game.photoAlt')} />
        )}
        {game.type === 'photo' && zoom < PHOTO_ZOOMS.length - 1 && (
          <SketchButton className="zoom-out" onClick={() => setZoom((z) => z + 1)}>
            <Icon name="magnifier" size={22} tilt={-8} />
            {t('game.zoomOut')}
          </SketchButton>
        )}

        {game.type === 'cipher' && game.cipher && (
          <Cipher cipher={game.cipher} alefbet={game.alefbet} t={t} />
        )}

        <p className="game-prompt">
          <Parts parts={game.prompt} />
        </p>
        {game.type === 'cipher' && game.keyHint && (
          <p className="cipher-hint">
            <Icon name="key" size={26} tilt={8} />
            <span>
              <Parts parts={game.keyHint} />
            </span>
          </p>
        )}
      </Paper>

      <div className="game-play" ref={shakeRef}>
        {(game.type === 'who_said' || game.type === 'photo') && game.options && (
          <ul className={`game-options ${game.type}`}>
            {game.options.map((o, i) => (
              <li key={o}>
                <button
                  type="button"
                  className={`game-option ${crossed.includes(i) ? 'crossed' : ''}`}
                  onClick={() => pick(i)}
                  disabled={busy || crossed.includes(i)}
                  style={{ ['--r' as string]: `${[-1.5, 1.2, -0.8, 1.6][i % 4]}deg` }}
                >
                  <span className="game-option-text">{game.type === 'who_said' ? `"${o}"` : o}</span>
                  {crossed.includes(i) && (
                    <svg className="cross" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M4 22 C 40 16, 80 26, 116 18" vectorEffect="non-scaling-stroke" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {game.type === 'true_false' && game.statements && (
          <form className="tf-form" onSubmit={submitTruths} noValidate>
            <ol className="tf-list">
              {game.statements.map((st, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: statements are positional
                <li key={i} className="tf-item">
                  <p className="tf-text">
                    <Parts parts={st} />
                  </p>
                  <fieldset className="tf-choice">
                    <legend className="sr-only">{t('game.statement', { n: i + 1 })}</legend>
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        className={`tf-btn ${truths[i] === v ? 'on' : ''}`}
                        aria-pressed={truths[i] === v}
                        onClick={() => {
                          setTruths((all) => all.map((x, j) => (j === i ? v : x)))
                          setMessage(null)
                        }}
                      >
                        {v ? t('game.true') : t('game.false')}
                        {truths[i] === v && <HandCircle />}
                      </button>
                    ))}
                  </fieldset>
                </li>
              ))}
            </ol>
            <div className="foot">
              <BrushButton type="submit" disabled={busy}>
                {busy ? t('game.checking') : t('game.check')}
              </BrushButton>
            </div>
          </form>
        )}

        {game.type === 'cipher' && (
          <form className="answer-form" onSubmit={submitText} noValidate>
            <div className="answer-block">
              <label className="answer">
                <span className="answer-label">
                  <Icon name="pencil" size={24} tilt={-6} />
                  {t('game.answerLabel')}
                </span>
                <input
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    setMessage(null)
                  }}
                  maxLength={200}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  dir="auto"
                  aria-describedby="game-feedback"
                />
              </label>
            </div>
            <div className="foot">
              <BrushButton type="submit" disabled={busy}>
                {busy ? t('game.checking') : t('game.check')}
              </BrushButton>
            </div>
          </form>
        )}

        <p id="game-feedback" className="feedback" aria-live="polite">
          {message && (
            <span key={wrong} className="feedback-text">
              {message}
            </span>
          )}
        </p>
      </div>

      {captain && (
        <div className="game-skip">
          {skipping ? (
            <Paper className="skip-ask rise" tilt={-1}>
              <p>{t('game.skipAsk')}</p>
              <div className="hintq-actions">
                <SketchButton
                  className="accent"
                  disabled={busy}
                  onClick={() =>
                    run(() => act({ type: 'minigame_skip', stopIndex: view.stopIndex, game: game.index }))
                  }
                >
                  {t('game.skipYes')}
                </SketchButton>
                <SketchButton onClick={() => setSkipping(false)}>{t('game.skipNo')}</SketchButton>
              </div>
            </Paper>
          ) : (
            <SketchButton className="skip-open" onClick={() => setSkipping(true)}>
              {t('game.skip')}
            </SketchButton>
          )}
        </div>
      )}
    </>
  )
}

/** The photo, zoomed in on one spot; each step shows more of it. */
function PhotoZoom({
  src,
  focus,
  level,
  alt,
}: {
  src: string
  focus: { x: number; y: number } | null
  level: number
  alt: string
}) {
  const z = PHOTO_ZOOMS[Math.min(level, PHOTO_ZOOMS.length - 1)]
  const f = focus ?? { x: 50, y: 50 }
  return (
    <figure className="polaroid zoom-photo" style={{ ['--r' as string]: '-3deg' }}>
      <span className="washi washi-a" aria-hidden="true" />
      <span className="washi washi-b" aria-hidden="true" />
      <div className="zoom-frame" data-zoom={z}>
        <img
          src={src}
          alt={alt}
          style={{ transform: `scale(${z})`, transformOrigin: `${f.x}% ${f.y}%` }}
          draggable={false}
        />
        <span className="zoom-lens" aria-hidden="true" />
      </div>
      <div className="zoom-steps" aria-hidden="true">
        {PHOTO_ZOOMS.map((s, i) => (
          <span key={s} className={i <= level ? 'on' : ''} />
        ))}
      </div>
    </figure>
  )
}

/** The enciphered text, letter by letter, and the alef-bet to count along. */
function Cipher({ cipher, alefbet, t }: { cipher: string; alefbet: string | null; t: T }) {
  const letters = [...cipher].map((c, i) => ({ c, key: `${i}${c}` }))
  return (
    <div className="cipher">
      <p className="sr-only">
        {t('game.cipherLabel')}: {cipher}
      </p>
      <p className="cipher-text" aria-hidden="true">
        {letters.map(({ c, key }, i) =>
          c === ' ' ? (
            <span key={key} className="cipher-gap" />
          ) : (
            <span
              key={key}
              className="cipher-letter"
              style={{ ['--r' as string]: `${[-5, 4, -2, 6, -4][i % 5]}deg` }}
            >
              {c}
            </span>
          ),
        )}
      </p>
      {alefbet && (
        <figure className="alefbet-wrap">
          <figcaption className="sr-only">{t('game.alefbet')}</figcaption>
          <div className="alefbet">
            {[...alefbet].map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </figure>
      )}
    </div>
  )
}

function Solved({ view, game, t, act }: ScreenProps & { game: Game }) {
  const { busy, run } = useBusy()
  const reward = game.reward
  return (
    <section className="game-solved">
      <Confetti decor={view.decor} />
      <div className="correct-wrap">
        <Burst decor={view.decor} />
        <h1 className="correct pop">{t('game.solved')}</h1>
      </div>
      {reward?.text && (
        <Paper className="reward-piece rise" tilt={-2.4}>
          <Tape className="reward-tape" />
          <p className="reward-kicker">
            <Icon name="loveLetter" size={30} tilt={-8} />
            {t('game.reward')}
          </p>
          <p className="reward-text">"{reward.text}"</p>
          {reward.signature && <div className="sig">{reward.signature}</div>}
        </Paper>
      )}
      <p className="reward-note">{t('game.rewardNote')}</p>
      <div className="foot">
        <BrushButton
          disabled={busy}
          onClick={() =>
            run(() => act({ type: 'minigame_continue', stopIndex: view.stopIndex, game: game.index }))
          }
        >
          {t('game.continue')}
        </BrushButton>
      </div>
    </section>
  )
}
