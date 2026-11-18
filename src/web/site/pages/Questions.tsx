// Step 2: the honoree's name, the occasion's questions, letter notes, or "answer later".
// Leaving this step creates (or updates) the order, so the next steps have a manage token.
import { useEffect, useState } from 'react'
import { Doodles } from '../../shared/decor.tsx'
import {
  ApiError,
  createOrder,
  getQuestions,
  type LetterNote,
  type Question,
  type Shop,
  updateOrder,
} from '../api.ts'
import { copy } from '../copy.ts'
import {
  type Draft,
  decorFor,
  errorText,
  MAX_NOTES,
  orderPayload,
  payloadKey,
  saveAction,
  step1Error,
  step2Error,
} from '../logic.ts'
import { navigate } from '../router.ts'
import { Back, Cta, Deco, Failed, Loading, Opt, QField, StepTrail, TornPaper } from '../ui.tsx'
import { STEPS } from './Home.tsx'

export function Questions(props: { shop: Shop; draft: Draft; setDraft: (d: Draft) => void }) {
  const { shop, draft: d, setDraft } = props
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const incomplete = step1Error(d, shop)

  useEffect(() => {
    if (incomplete) return navigate('/', { replace: true })
    getQuestions(d.occasionKey!, d.form!).then(setQuestions, () => setLoadError(true))
  }, [d.occasionKey, d.form, incomplete])

  if (incomplete) return null
  if (loadError) return <Failed text={copy.loadFailed} />
  if (!questions) return <Loading />
  const form = d.form!

  const set = (patch: Partial<Draft>) => {
    setError(null)
    setDraft({ ...d, ...patch })
  }
  const notes = d.letterNotes.length ? d.letterNotes : [{ text: '', signature: '' }]
  const setNote = (i: number, patch: Partial<LetterNote>) =>
    set({ letterNotes: notes.map((n, j) => (j === i ? { ...n, ...patch } : n)) })

  const next = async () => {
    const e = step2Error(d, questions)
    if (e) return setError(e)
    const payload = orderPayload(d, questions)
    const key = payloadKey(payload)
    const action = saveAction(d, key)
    setBusy(true)
    try {
      let token = d.manageToken
      if (action === 'update' && token) {
        try {
          await updateOrder(token, payload)
        } catch (err) {
          // Paid or gone: start a fresh order rather than editing it.
          if (!(err instanceof ApiError) || ![404, 409].includes(err.status)) throw err
          token = null
        }
      }
      if (!token || action === 'create') token = (await createOrder(payload)).manageToken
      setDraft({ ...d, manageToken: token, savedKey: key })
      navigate(`/order/${token}/photos`)
    } catch (err) {
      setError(errorText(err instanceof ApiError ? err.code : 'generic'))
      setBusy(false)
    }
  }

  const [t1, t2] = copy.questions.title(form)
  const decor = decorFor(shop, d.occasionKey)
  return (
    <main className="page" data-decor={decor ?? undefined}>
      <Doodles
        className="deco"
        decor={decor}
        spots={[
          { top: 340, left: 4, size: 46, rot: 12 },
          { top: 760, left: -10, size: 42, rot: -10 },
        ]}
      />
      <Deco
        icon="falafel"
        className="bob"
        style={{ top: 50, left: -44, width: 130, ['--r' as string]: '-14deg' }}
      />
      <Deco
        icon="flowers"
        className="sway"
        style={{ top: 440, right: -40, width: 70, transformOrigin: '50% 100%' }}
      />
      <Back href="/" />
      <div style={{ marginTop: 18, marginLeft: 80 }}>
        <StepTrail step={2} total={STEPS} />
        <h1 className="title rise">
          {t1}
          <br />
          {t2}
        </h1>
        <p className="lead">{copy.questions.intro}</p>
      </div>

      <div className="section">
        <QField
          name="honoreeName"
          label={copy.questions.name(form)}
          placeholder={copy.questions.namePlaceholder(form)}
          value={d.honoreeName}
          onChange={(v) => set({ honoreeName: v })}
          maxLen={40}
          required
          paper={-1.2}
        />
        {!d.answersLater &&
          questions.map((q, i) => (
            <QField
              paper={i % 2 ? -0.9 : 1.1}
              key={q.slot}
              name={q.slot}
              label={q.text}
              value={d.answers[q.slot] ?? ''}
              onChange={(v) => set({ answers: { ...d.answers, [q.slot]: v } })}
              maxLen={q.maxLen || undefined}
              required={q.required}
            />
          ))}
      </div>

      <div className="section">
        <Opt
          role="checkbox"
          small
          pressed={d.answersLater}
          onClick={() => set({ answersLater: !d.answersLater })}
        >
          {copy.questions.later}
        </Opt>
        {d.answersLater && <p className="hint">{copy.questions.laterHint}</p>}
      </div>

      {!d.answersLater && (
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
              {d.letterNotes.length > 1 && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => set({ letterNotes: d.letterNotes.filter((_, j) => j !== i) })}
                >
                  {copy.questions.removeNote}
                </button>
              )}
            </div>
          ))}
          {notes.length < MAX_NOTES && (
            <button
              type="button"
              className="add-link"
              onClick={() => set({ letterNotes: [...notes, { text: '', signature: '' }] })}
            >
              {copy.questions.addNote}
            </button>
          )}
        </TornPaper>
      )}

      <Cta onClick={next} busy={busy} error={error}>
        {copy.questions.next}
      </Cta>
    </main>
  )
}
