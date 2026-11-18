// The manage page's edit mode: the buyer changes the name, the answers and the letter notes (and
// reaches the photos) any number of times until the game starts. Same fields as the order flow.
import { useState } from 'react'
import { ApiError, type LetterNote, type Manage as M, submitAnswers } from '../api.ts'
import { copy, type SiteForm } from '../copy.ts'
import { cleanNotes, editError, errorText, MAX_NOTES } from '../logic.ts'
import { Cta, Link, QField, TornPaper } from '../ui.tsx'

export function ManageEdit(props: {
  token: string
  m: M
  /** First answers after paying ("answer later"): worded as sending, not editing. */
  first: boolean
  onDone: () => void
  onCancel?: () => void
}) {
  const { token, m, first } = props
  const form = (m.form || 'she') as SiteForm
  const questions = m.questions ?? []
  const [name, setName] = useState(m.honoreeName ?? m.honoree)
  const [answers, setAnswers] = useState<Record<string, string>>(m.answers ?? {})
  const [notes, setNotes] = useState<LetterNote[]>(
    m.letterNotes?.length ? m.letterNotes : [{ text: '', signature: '' }],
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const e = editError(name, answers, questions, form)
    if (e) return setError(e)
    setBusy(true)
    try {
      await submitAnswers(token, { honoreeName: name.trim(), answers, letterNotes: cleanNotes(notes) })
      props.onDone()
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
        {first ? copy.manage.answersTitle : copy.manage.editTitle}
      </h2>
      <p className="hint">{first ? copy.manage.answersIntro : copy.manage.editHint}</p>
      <QField
        name="honoreeName"
        label={copy.questions.name(form)}
        value={name}
        maxLen={40}
        required
        onChange={(v) => {
          setError(null)
          setName(v)
        }}
      />
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
            {notes.length > 1 && (
              <button
                type="button"
                className="link-btn"
                onClick={() => setNotes(notes.filter((_, j) => j !== i))}
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
            onClick={() => setNotes([...notes, { text: '', signature: '' }])}
          >
            {copy.questions.addNote}
          </button>
        )}
      </TornPaper>
      {m.photos.editable && (
        <p>
          <Link href={`/order/${token}/photos`}>{copy.manage.photosLink(m.photos.count)}</Link>
        </p>
      )}
      {props.onCancel && (
        <p>
          <button type="button" className="link-btn" onClick={props.onCancel}>
            {copy.manage.cancel}
          </button>
        </p>
      )}
      <Cta onClick={save} busy={busy} error={error}>
        {first ? copy.manage.submit : copy.manage.save}
      </Cta>
    </section>
  )
}
