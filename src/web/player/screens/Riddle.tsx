// Riddle: the note with personal slots, an optional taped photo, a hint, and the answer box.
// The component is keyed by stop, so a poll for the same step never clears what is being typed.
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { riddleTitle } from '../copy.ts'
import { Arrow, BrushButton, HandCircle, Paper, Tape, Tick, Trail } from '../draw.tsx'
import { splitQuestion, stopIcon } from '../logic.ts'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

export function Riddle({ view, t, act }: ScreenProps) {
  const cur = view.current!
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<null | { text: string; n: number }>(null)
  const { busy, run } = useBusy()
  const hint = run
  const { body, question } = splitQuestion(cur.riddle.parts)
  const inputRef = useRef<HTMLInputElement>(null)

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

  return (
    <main className="scr riddle">
      <header className="trail">
        <Trail />
        <ol
          className="trail-stops"
          aria-label={t('riddle.stopOf', { n: cur.index + 1, total: view.totalStops })}
        >
          {Array.from({ length: view.totalStops }, (_, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
              key={i}
              className={i < cur.index ? 'done' : i === cur.index ? 'now' : 'later'}
              aria-current={i === cur.index ? 'step' : undefined}
            >
              <img className={i === cur.index ? 'bob' : ''} src={stopIcon(i)} alt="" />
              {i < cur.index && <Tick />}
            </li>
          ))}
        </ol>
        <div className="trail-label">{t('riddle.stopOf', { n: cur.index + 1, total: view.totalStops })}</div>
      </header>

      <Paper className={`note rise ${cur.photo ? 'with-photo' : ''}`} tilt={cur.index % 2 ? -1.2 : 1.2}>
        <h1 className="note-kicker">{riddleTitle(t, cur.index, cur.finale)}</h1>
        {cur.photo && (
          <figure className="taped-photo">
            <Tape />
            <img src={cur.photo} alt={t('riddle.photoAlt')} />
          </figure>
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

      <form className="answer-form" onSubmit={submit} noValidate>
        <div className="answer-block">
          {cur.riddle.hint && (
            <div className="hint-line rise" role="note">
              <Arrow />
              <span>
                {t('riddle.hintPrefix')} {cur.riddle.hint}
              </span>
            </div>
          )}
          <div className="answer-row">
            <label className="answer">
              <span>{t('riddle.answerLabel')}</span>
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
            {cur.riddle.hasHint && !cur.riddle.hint && (
              <button
                type="button"
                className="hint-btn wiggle"
                aria-label={t('riddle.hintButton')}
                onClick={() => hint(() => act({ type: 'hint', stopIndex: cur.index }))}
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
    </main>
  )
}
