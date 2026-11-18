// /m/:token: the buyer's manage page. Status, the game link and QR, progress, late answers.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getManage, type LetterNote, type Manage as M, submitAnswers } from '../api.ts'
import { copy } from '../copy.ts'
import { answersError, cleanNotes, errorText, MAX_NOTES, whatsappShare } from '../logic.ts'
import { Cta, Deco, Failed, Link, Loading, QField, TornPaper } from '../ui.tsx'

const ACTIVE_POLL_MS = 15_000
const PAID_POLL_MS = 4000

export function Manage({ token, search }: { token: string; search: string }) {
  const [m, setM] = useState<M | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const checking = new URLSearchParams(search).get('paid') === '1'
  const started = useRef(Date.now())

  const loaded = useRef(false)
  const load = useCallback(
    () =>
      getManage(token).then(
        (x) => {
          loaded.current = true
          setM(x)
        },
        (e) => {
          // Only the first load reports errors; a failed refresh keeps what is shown.
          if (!loaded.current) setLoadError(errorText(e instanceof ApiError ? e.code : 'generic'))
        },
      ),
    [token],
  )
  useEffect(() => {
    load()
  }, [load])

  // Keep it fresh while something is about to change: payment settling, or a game being played.
  const waitingPay = !!m && !m.paid && checking && Date.now() - started.current < 120_000
  const live = !!m && (m.status === 'active' || m.status === 'review' || waitingPay)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(load, waitingPay ? PAID_POLL_MS : ACTIVE_POLL_MS)
    return () => window.clearInterval(id)
  }, [live, waitingPay, load])

  useEffect(() => {
    if (m && location.hash === '#answers') document.getElementById('answers')?.scrollIntoView()
  }, [m])

  if (loadError)
    return <Failed text={loadError === copy.errors.not_found ? copy.manage.notFound : loadError} />
  if (!m) return <Loading />

  const [t1, t2] = copy.manage.title(m.honoree)
  const payHref = m.kind === 'company' ? `/pay/${token}` : `/order/${token}/pay`
  const canPay = !m.paid && (m.status === 'pending_payment' || m.status === 'quoted') && m.amountAgorot > 0

  return (
    <main className="page">
      <Deco
        icon="gate"
        className="bob"
        style={{ top: 10, left: -30, width: 130, ['--r' as string]: '-6deg' }}
      />
      <div style={{ marginTop: 70, marginLeft: 80 }}>
        <div className="eyebrow">{copy.manage.orderNo(m.orderNo)}</div>
        <h1 className="title rise">
          {t1}
          <br />
          {t2}
        </h1>
      </div>

      <p className="status" data-testid="status">
        {waitingPay ? copy.manage.checking : (copy.manage.status[m.status] ?? '')}
      </p>
      {canPay && !waitingPay && (
        <p>
          <Link href={payHref} className="big-link">
            {copy.manage.payNow}
          </Link>
        </p>
      )}

      {m.progress && (m.status === 'active' || m.status === 'done') && m.progress.total > 0 && (
        <p className="hint">
          {copy.manage.progress(Math.min(m.progress.stopIndex + 1, m.progress.total), m.progress.total)}
          {' · '}
          {copy.manage.redeemed(m.progress.redeemed)}
        </p>
      )}

      {m.gameLink && (
        <section className="section">
          <h2 className="sub">{copy.manage.gameTitle}</h2>
          <div className="game-link">
            {m.qr && <img className="qr" src={m.qr} alt={copy.manage.qrAlt} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a className="big-link" href={m.gameLink}>
                {copy.manage.openGame}
              </a>
              <a href={whatsappShare(copy.manage.shareText(m.gameLink))} target="_blank" rel="noopener">
                {copy.manage.share}
              </a>
            </div>
          </div>
          <ol className="howto">
            {copy.manage.howTo.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
          {m.validUntil && (
            <p className="hint">
              {copy.manage.validUntil(
                new Date(m.validUntil).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }),
              )}
            </p>
          )}
        </section>
      )}

      {submitted && (
        <p className="status" role="status">
          {copy.manage.submitted}
        </p>
      )}
      {m.needsAnswers &&
        m.questions &&
        ['pending_payment', 'quoted', 'awaiting_answers'].includes(m.status) && (
          <LateAnswers
            token={token}
            m={m}
            onDone={() => {
              setSubmitted(true)
              load()
            }}
          />
        )}
    </main>
  )
}

function LateAnswers({ token, m, onDone }: { token: string; m: M; onDone: () => void }) {
  const questions = m.questions ?? []
  const [answers, setAnswers] = useState<Record<string, string>>(m.answers ?? {})
  const [notes, setNotes] = useState<LetterNote[]>([{ text: '', signature: '' }])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const e = answersError(answers, questions)
    if (e) return setError(e)
    setBusy(true)
    try {
      await submitAnswers(token, answers, cleanNotes(notes))
      onDone()
    } catch (err) {
      setError(errorText(err instanceof ApiError ? err.code : 'generic'))
      setBusy(false)
    }
  }
  const setNote = (i: number, patch: Partial<LetterNote>) =>
    setNotes(notes.map((n, j) => (j === i ? { ...n, ...patch } : n)))

  return (
    <section className="section" id="answers" aria-labelledby="answers-title">
      <h2 className="sub" id="answers-title">
        {copy.manage.answersTitle}
      </h2>
      <p className="hint">{copy.manage.answersIntro}</p>
      {questions.map((q) => (
        <QField
          key={q.slot}
          name={q.slot}
          label={q.text}
          value={answers[q.slot] ?? ''}
          maxLen={q.maxLen || undefined}
          required={q.required}
          onChange={(v) => {
            setError(null)
            setAnswers({ ...answers, [q.slot]: v })
          }}
        />
      ))}
      <TornPaper tilt="r">
        <h2 className="sub">{copy.questions.notes}</h2>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          {copy.questions.notesHint} ({copy.optional})
        </p>
        {notes.map((n, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: notes have no id; order is stable
          <div className="note" key={i}>
            <QField
              label={copy.questions.noteText}
              value={n.text}
              multiline
              maxLen={600}
              onChange={(v) => setNote(i, { text: v })}
            />
            <QField
              label={copy.questions.noteSignature}
              value={n.signature}
              maxLen={60}
              onChange={(v) => setNote(i, { signature: v })}
            />
          </div>
        ))}
        {notes.length < MAX_NOTES && (
          <button
            type="button"
            className="add-link"
            onClick={() => setNotes([...notes, { text: '', signature: '' }])}
          >
            {copy.questions.addNote}
          </button>
        )}
      </TornPaper>
      <Cta onClick={submit} busy={busy} error={error}>
        {copy.manage.submit}
      </Cta>
    </section>
  )
}
