// The manage page's edit mode: the buyer changes the name, the answers, the letter notes, the
// personal questions for hints and the color (palette, with a live preview), and reaches the
// photos, any number of times until the game starts. Same fields as the order flow.
import { useState } from 'react'
import { Icon } from '../../shared/decor.tsx'
import { ApiError, type HintQuestion, type LetterNote, type Manage as M, submitAnswers } from '../api.ts'
import { copy, type SiteForm } from '../copy.ts'
import { HintQuestions } from '../hintQuestions.tsx'
import {
  askedQuestions,
  cleanHintQuestions,
  cleanNotes,
  editError,
  errorText,
  MAX_NOTES,
  nameLabel,
} from '../logic.ts'
import {
  Cta,
  Daub,
  LookPreview,
  PhotoDrop,
  QField,
  QNote,
  Ring,
  SectionHead,
  Sketch,
  Tick,
  TornPaper,
} from '../ui.tsx'

// A notebook page: straight top (torn off the pad), ragged bottom.
const NOTEBOOK =
  'M4 6 C 80 4, 200 7, 296 5 C 298 80, 295 180, 297 286 L 280 292 L 262 285 L 240 294 L 220 286 L 198 293 L 176 285 L 154 294 L 132 286 L 110 293 L 88 285 L 66 294 L 44 286 L 22 293 L 3 287 C 5 180, 2 80, 4 6 Z'

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
  const all = m.questions ?? []
  // A group's name is the name field; its group_name question is not asked twice.
  const questions = askedQuestions(all, form)
  const [name, setName] = useState(m.honoreeName ?? m.honoree)
  const [answers, setAnswers] = useState<Record<string, string>>(m.answers ?? {})
  const [notes, setNotes] = useState<LetterNote[]>(
    m.letterNotes?.length ? m.letterNotes : [{ text: '', signature: '' }],
  )
  const [hintQuestions, setHintQuestions] = useState<HintQuestion[]>(m.hintQuestions ?? [])
  const look = m.look ?? null
  const pals = look?.palettes ?? []
  const [paletteId, setPaletteId] = useState<number | null>(
    pals.find((p) => p.id === look?.paletteId)?.id ?? pals[0]?.id ?? null,
  )
  const pal = pals.find((p) => p.id === paletteId) ?? null
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const e = editError(name, answers, questions, form, hintQuestions)
    if (e) return setError(e)
    setBusy(true)
    try {
      const sent = { ...answers }
      if (form === 'group' && all.some((q) => q.slot === 'group_name')) sent.group_name = name.trim()
      await submitAnswers(token, {
        honoreeName: name.trim(),
        answers: sent,
        letterNotes: cleanNotes(notes),
        hintQuestions: cleanHintQuestions(hintQuestions),
        ...(pals.length ? { paletteId } : {}),
      })
      props.onDone()
    } catch (err) {
      setError(errorText(err instanceof ApiError ? err.code : 'generic'))
      setBusy(false)
    }
  }
  const setNote = (i: number, patch: Partial<LetterNote>) =>
    setNotes(notes.map((n, j) => (j === i ? { ...n, ...patch } : n)))

  return (
    <section className="section m-edit" id="answers" aria-labelledby="answers-title">
      <SectionHead icon="pencil" id="answers-title">
        {first ? copy.manage.answersTitle : copy.manage.editTitle}
      </SectionHead>
      <p className="hint">{first ? copy.manage.answersIntro : copy.manage.editHint}</p>
      <div className="notebook">
        <svg className="notebook-edge" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
          <path d={NOTEBOOK} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="notebook-holes" aria-hidden="true" />
        <h3 className="notebook-title">
          <Icon name="question" size={30} tilt={-8} />
          {copy.manage.answersSection}
        </h3>
        <QField
          name="honoreeName"
          label={nameLabel(all, form)}
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
      </div>
      <TornPaper tilt="r">
        <h2 className="sub section-head">
          <Icon name="loveLetter" size={40} tilt={6} />
          <span>{copy.questions.notes}</span>
        </h2>
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
              <Sketch small icon="scissors" onClick={() => setNotes(notes.filter((_, j) => j !== i))}>
                {copy.questions.removeNote}
              </Sketch>
            )}
          </div>
        ))}
        {notes.length < MAX_NOTES && (
          <Sketch className="add-note" onClick={() => setNotes([...notes, { text: '', signature: '' }])}>
            {copy.questions.addNote}
          </Sketch>
        )}
      </TornPaper>
      <HintQuestions
        form={form}
        value={hintQuestions}
        onChange={(v) => {
          setError(null)
          setHintQuestions(v)
        }}
      />
      {look && pals.length > 1 && (
        <section className="section m-palette" aria-labelledby="l-edit-palette">
          <div className="palette-head">
            <Icon name="palette" size={46} tilt={-8} />
            <QNote id="l-edit-palette" tilt={1.4}>
              {copy.home.palette}
            </QNote>
          </div>
          <div className="daubs" role="radiogroup" aria-labelledby="l-edit-palette">
            {pals.map((p, i) => {
              const on = paletteId === p.id
              return (
                // biome-ignore lint/a11y/useSemanticElements: a drawn daub, like the other drawn options
                <button
                  type="button"
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  aria-label={p.name}
                  className="daub"
                  data-palette={p.id}
                  onClick={() => {
                    setError(null)
                    setPaletteId(p.id)
                  }}
                >
                  <Daub palette={p.palette} index={i} />
                  {on && <Ring />}
                  {on && <Tick />}
                </button>
              )
            })}
          </div>
          {pal && (
            <p className="daub-name" aria-live="polite">
              {pal.name}
            </p>
          )}
          {pal && <LookPreview map={look.map} palette={pal.palette} name={pal.name} />}
        </section>
      )}
      {m.photos.editable && (
        <section className="section">
          <SectionHead icon="camera" tilt={6}>
            {copy.manage.photosTitle}
          </SectionHead>
          <PhotoDrop token={token} count={m.photos.count} />
        </section>
      )}
      {props.onCancel && (
        <p className="m-cancel">
          <Sketch small onClick={props.onCancel}>
            {copy.manage.cancel}
          </Sketch>
        </p>
      )}
      <Cta onClick={save} busy={busy} error={error}>
        {first ? copy.manage.submit : copy.manage.save}
      </Cta>
    </section>
  )
}
