// Riddle: the note with personal slots, an optional taped photo, a hint, and the answer box.
// When the buyer added personal questions, the hint opens only after answering one of them.
// The component is keyed by stop, so a poll for the same step never clears what is being typed.
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Icon } from '../../shared/decor.tsx'
import { useWide } from '../../shared/useWide.ts'
import { riddleTitle } from '../copy.ts'
import { Arrow, BrushButton, HandCircle, Paper, SketchButton } from '../draw.tsx'
import { splitQuestion, stopIcon } from '../logic.ts'
import { TapedPhoto, useLightbox } from '../photo.tsx'
import { GameSide } from './GameSide.tsx'
import { StageTrail } from './Stages.tsx'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

export function Riddle({ view, t, act }: ScreenProps) {
  const cur = view.current!
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<null | { text: string; n: number }>(null)
  const { busy, run } = useBusy()
  const hint = run
  // The personal question before the hint: open, its answer and the last wrong try.
  const [asking, setAsking] = useState(false)
  const [hintAnswer, setHintAnswer] = useState('')
  const [hintWrong, setHintWrong] = useState(0)
  const { body, question } = splitQuestion(cur.riddle.parts)
  const inputRef = useRef<HTMLInputElement>(null)
  const lightbox = useLightbox(t, t('riddle.photoAlt'))
  const wide = useWide()

  // A gentle shake of the answer line on a wrong answer (not a remount: keeps the keyboard up).
  useEffect(() => {
    const el = inputRef.current
    if (!feedback || !el?.animate) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-7px) rotate(-1deg)' },
        { transform: 'translateX(6px) rotate(1deg)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 420, easing: 'ease-out' },
    )
  }, [feedback])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = answer.trim()
    if (!value) {
      setFeedback((f) => ({ text: t('riddle.empty'), n: (f?.n ?? 0) + 1 }))
      return
    }
    void run(async () => {
      const r = await act({ type: 'answer', stopIndex: cur.index, answer: value })
      if (r.kind === 'view' && r.correct === false) {
        setFeedback((f) => ({ text: t('riddle.wrong'), n: (f?.n ?? 0) + 1 }))
      }
    })
  }

  const askHint = () => {
    if (cur.riddle.hintQuestion) {
      setAsking(true)
      return
    }
    void hint(() => act({ type: 'hint', stopIndex: cur.index }))
  }
  const answerHint = (e: FormEvent) => {
    e.preventDefault()
    const value = hintAnswer.trim()
    if (!value) return
    void run(async () => {
      const r = await act({ type: 'hint', stopIndex: cur.index, answer: value })
      if (r.kind === 'view' && r.correct === false) setHintWrong((n) => n + 1)
    })
  }
  const showQuestion = asking && !cur.riddle.hint && !!cur.riddle.hintQuestion

  return (
    <main className="scr riddle">
      <StageTrail view={view} t={t} />

      {/* Wide screens: the riddle and the answer in one column, the map and route beside them. */}
      <div className="riddle-main">
        <Paper className={`note rise ${cur.photo ? 'with-photo' : ''}`} tilt={cur.index % 2 ? -1.2 : 1.2}>
          <h1 className="note-kicker">
            <Icon name={cur.finale ? 'trophy' : 'magnifier'} size={30} tilt={-8} />
            {riddleTitle(t, cur.index, cur.finale)}
          </h1>
          {cur.photo && (
            <TapedPhoto
              className="riddle-photo"
              src={cur.photo}
              alt={t('riddle.photoAlt')}
              tilt={cur.index % 2 ? 4 : -4}
              t={t}
              onOpen={lightbox.open}
            />
          )}
          <p className="riddle-text">
            {body.map((p, i) =>
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
          </p>
          {question && <p className="riddle-q">{question}</p>}
          {!cur.photo && <img className="note-peek bob" src={stopIcon(cur.index + 3)} alt="" />}
        </Paper>

        {showQuestion && (
          <form className="hintq-form" onSubmit={answerHint} noValidate>
            <Paper className="hintq rise" tilt={-1}>
              <p className="hintq-kicker">
                <Icon name="key" size={30} tilt={-8} />
                <span>{t('hintq.title')}</span>
              </p>
              <p className="hintq-question" id="hintq-question">
                {cur.riddle.hintQuestion}
              </p>
              <label className="answer">
                <span className="answer-label">
                  <Icon name="pencil" size={22} tilt={-6} />
                  {t('hintq.answerLabel')}
                </span>
                <input
                  value={hintAnswer}
                  onChange={(e) => {
                    setHintAnswer(e.target.value)
                    if (hintWrong) setHintWrong(0)
                  }}
                  maxLength={200}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  dir="auto"
                  aria-describedby="hintq-question hintq-feedback"
                  // biome-ignore lint/a11y/noAutofocus: opened on purpose by tapping the hint
                  autoFocus
                />
              </label>
              <p id="hintq-feedback" className="hintq-feedback" aria-live="polite">
                {hintWrong > 0 && (
                  <span key={hintWrong} className="feedback-text">
                    {t('hintq.wrong')}
                  </span>
                )}
              </p>
              <div className="hintq-actions">
                <SketchButton type="submit" className="hintq-go accent" disabled={busy}>
                  {t('hintq.submit')}
                </SketchButton>
                <SketchButton
                  className="hintq-skip"
                  onClick={() => {
                    setAsking(false)
                    setHintAnswer('')
                    setHintWrong(0)
                  }}
                >
                  {t('hintq.skip')}
                </SketchButton>
              </div>
            </Paper>
          </form>
        )}

        <form className="answer-form" onSubmit={submit} noValidate>
          <div className="answer-block">
            {cur.riddle.hint && (
              <div className="hint-line rise" role="note">
                <Icon name="bulb" size={30} tilt={8} />
                <Arrow />
                <span>
                  {t('riddle.hintPrefix')} {cur.riddle.hint}
                </span>
              </div>
            )}
            <div className="answer-row">
              <label className="answer">
                <span className="answer-label">
                  <Icon name="pencil" size={24} tilt={-6} />
                  {t('riddle.answerLabel')}
                </span>
                <input
                  ref={inputRef}
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value)
                    if (feedback) setFeedback(null)
                  }}
                  maxLength={200}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  dir="auto"
                  aria-describedby="answer-feedback"
                />
              </label>
              {cur.riddle.hasHint && !cur.riddle.hint && !showQuestion && (
                <button
                  type="button"
                  className="hint-btn wiggle"
                  aria-label={t('riddle.hintButton')}
                  onClick={askHint}
                  disabled={busy}
                >
                  ?
                  <HandCircle />
                </button>
              )}
            </div>
            <p id="answer-feedback" className="feedback" aria-live="polite">
              {feedback && (
                <span key={feedback.n} className="feedback-text">
                  {feedback.text}
                </span>
              )}
            </p>
          </div>
          <div className="foot">
            <BrushButton type="submit" disabled={busy}>
              {busy ? t('riddle.checking') : t('riddle.submit')}
            </BrushButton>
          </div>
        </form>
      </div>
      {wide && <GameSide view={view} t={t} />}
      {lightbox.element}
    </main>
  )
}
