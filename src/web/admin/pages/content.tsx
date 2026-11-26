// Question sets and riddles (with live preview per form and an answer tester).

import { useEffect, useMemo, useState } from 'react'
import { occasionRecipients } from '../../../server/domain/recipient.ts'
import { extractSlots, nameSlots, type TemplateLine } from '../../../server/domain/template.ts'
import type { RiddleTemplates } from '../../../server/domain/types.ts'
import { FORMS, type Form, type Question, type TextPart } from '../../../server/domain/types.ts'
import { api } from '../api.ts'
import {
  Check,
  CrudPage,
  type EditorProps,
  FORM_LABELS,
  type Market,
  NumberInput,
  type Occasion,
  type QuestionSet,
  type Riddle,
  Select,
  type Stall,
  Text,
  useDebounced,
  useList,
} from '../ui.tsx'

// ---------- Question sets ----------

function blankQuestion(): Question {
  return { slot: '', text: {}, required: false, fallback: '', maxLen: 60 }
}

function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** "תקווה (היא, קבוצה)": the riddles whose text uses a slot, with the forms that use it. */
export function slotUsage(
  slot: string,
  riddles: { title: string; answer: string; templates: RiddleTemplates }[],
) {
  if (!slot) return []
  return riddles.flatMap((r) => {
    const forms = FORMS.filter((f) => extractSlots(r.templates[f] ?? '').includes(slot))
    return forms.length ? [`${r.title || r.answer} (${forms.map((f) => FORM_LABELS[f]).join(', ')})`] : []
  })
}

function QuestionEditor({
  q,
  index,
  usedIn,
  onChange,
  onMove,
  onRemove,
}: {
  q: Question
  index: number
  usedIn: string[] | null
  onChange: (q: Question) => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const perForm = typeof q.fallback !== 'string'
  return (
    <fieldset className="question" data-testid={`question-${index}`}>
      <legend>
        שאלה {index + 1}
        {q.slot && <code dir="ltr">{` {${q.slot}}`}</code>}
      </legend>
      <div className="row">
        <Text label="מפתח" value={q.slot} onChange={(slot) => onChange({ ...q, slot })} dir="ltr" required />
        <NumberInput
          label="אורך מקסימלי"
          value={q.maxLen}
          onChange={(maxLen) => onChange({ ...q, maxLen })}
        />
        <Check label="חובה" checked={q.required} onChange={(required) => onChange({ ...q, required })} />
        <Check
          label="לא לשאול (רק ברירת מחדל)"
          checked={!!q.hidden}
          onChange={(hidden) => onChange({ ...q, hidden: hidden || undefined })}
        />
      </div>
      {usedIn && (
        <p className="muted" data-testid="slot-usage">
          {usedIn.length ? `בשימוש בחידות: ${usedIn.join(' · ')}` : 'לא בשימוש באף חידה'}
        </p>
      )}
      {FORMS.map((f) => (
        <Text
          key={f}
          label={`שאלה (${FORM_LABELS[f]})`}
          value={q.text[f]}
          onChange={(v) => onChange({ ...q, text: { ...q.text, [f]: v } })}
        />
      ))}
      <Check
        label="ברירת מחדל לפי צורת פנייה"
        checked={perForm}
        onChange={(on) =>
          onChange({
            ...q,
            fallback: on
              ? { she: typeof q.fallback === 'string' ? q.fallback : '' }
              : typeof q.fallback === 'string'
                ? q.fallback
                : (q.fallback.she ?? ''),
          })
        }
      />
      {typeof q.fallback === 'string' ? (
        <Text label="ברירת מחדל" value={q.fallback} onChange={(fallback) => onChange({ ...q, fallback })} />
      ) : (
        FORMS.map((f) => {
          const fb = q.fallback as Partial<Record<Form, string>>
          return (
            <Text
              key={f}
              label={`ברירת מחדל (${FORM_LABELS[f]})`}
              value={fb[f]}
              onChange={(v) => onChange({ ...q, fallback: { ...fb, [f]: v } })}
            />
          )
        })
      )}
      <div className="actions">
        <button type="button" onClick={() => onMove(-1)}>
          למעלה
        </button>
        <button type="button" onClick={() => onMove(1)}>
          למטה
        </button>
        <button type="button" className="danger" onClick={onRemove}>
          הסרת שאלה
        </button>
      </div>
    </fieldset>
  )
}

function QuestionSetEditor({ value, set }: EditorProps<QuestionSet>) {
  const qs = value.questions ?? []
  const riddles = useList<Riddle>('/catalog/riddles')
  return (
    <>
      <Text label="שם השאלון" value={value.name} onChange={(name) => set({ name })} required />
      <p className="muted">
        לכל שאלה: נוסח לכל צורת פנייה, חובה או לא, ברירת מחדל כשלא עונים ואורך מקסימלי. שאלה שמסומנת "לא
        לשאול" לא מוצגת לקונה, והחידות מקבלות את ברירת המחדל שלה.
      </p>
      {qs.map((q, i) => (
        <QuestionEditor
          // biome-ignore lint/suspicious/noArrayIndexKey: questions have no stable id while being edited
          key={i}
          q={q}
          index={i}
          usedIn={riddles.items ? slotUsage(q.slot, riddles.items) : null}
          onChange={(nq) => set({ questions: qs.map((x, j) => (j === i ? nq : x)) })}
          onMove={(by) => set({ questions: move(qs, i, by) })}
          onRemove={() => set({ questions: qs.filter((_, j) => j !== i) })}
        />
      ))}
      <button type="button" onClick={() => set({ questions: [...qs, blankQuestion()] })}>
        הוספת שאלה
      </button>
    </>
  )
}

/** Drops empty per-form texts so the stored JSON stays clean. */
function cleanForms<T extends Partial<Record<Form, string>>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v?.trim())) as T
}

export function QuestionSetsPage() {
  return (
    <CrudPage<QuestionSet>
      section="question-sets"
      title="שאלונים"
      path="/catalog/question-sets"
      newLabel="שאלון חדש"
      blank={() => ({ name: '', questions: [] })}
      toBody={(v) => ({
        name: v.name,
        questions: (v.questions ?? []).map((q) => ({
          ...q,
          text: cleanForms(q.text),
          fallback: typeof q.fallback === 'string' ? q.fallback : cleanForms(q.fallback),
        })),
      })}
      columns={[
        { label: 'שם', render: (q) => q.name },
        { label: 'שאלות', render: (q) => q.questions.length },
      ]}
      Editor={QuestionSetEditor}
    />
  )
}

// ---------- Riddles ----------

type Preview = { parts: TextPart[]; missing: string[]; bare?: TextPart[]; lines?: TemplateLine[] }

function PartsText({ parts, testId }: { parts: TextPart[]; testId?: string }) {
  return (
    <p data-testid={testId} className="riddle-lines">
      {parts.map((p, i) =>
        p.t === 'slot' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
          <span key={i} className="slot" title={p.slot}>
            {p.v}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
          <span key={i}>{p.v}</span>
        ),
      )}
    </p>
  )
}
type Match = { ok: true; via: 'exact' | 'fuzzy'; matched: string } | { ok: false }

function RiddlePreview({
  template,
  form,
  questionSetId,
}: {
  template: string
  form: Form
  questionSetId: number | null
}) {
  const req = useDebounced(JSON.stringify({ template, form, questionSetId }))
  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => {
    let live = true
    api<Preview>('/catalog/riddles/preview', { method: 'POST', json: JSON.parse(req) })
      .then((p) => live && setPreview(p))
      .catch(() => live && setPreview(null))
    return () => {
      live = false
    }
  }, [req])
  return (
    <div className="preview">
      <div className="muted">
        תצוגה מקדימה ({FORM_LABELS[form]}), עם תשובות לדוגמה מברירות המחדל של השאלון:
      </div>
      <PartsText parts={preview?.parts ?? []} testId="riddle-preview" />
      {preview?.bare && preview.lines?.some((l) => l.personal) && (
        <>
          <div className="muted">ובלי תשובות (שורות אישיות מתחלפות בחלופה או נעלמות):</div>
          <PartsText parts={preview.bare} testId="riddle-preview-bare" />
        </>
      )}
      {!!preview?.lines?.length && (
        <table className="lines" data-testid="riddle-lines">
          <thead>
            <tr>
              <th>שורה</th>
              <th>סוג</th>
              <th>משבצות</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{l.personal ? (l.alternatives.length > 1 ? 'אישית, עם חלופה' : 'אישית') : 'קבועה'}</td>
                <td dir="ltr">
                  {l.alternatives
                    .map((a) => (a.slots.length ? a.slots.map((x) => `{${x}}`).join(' ') : '—'))
                    .join('  ||  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!!preview?.missing.length && (
        <p className="error">ריק בתצוגה (אין תשובה וגם אין ברירת מחדל): {preview.missing.join(', ')}</p>
      )}
    </div>
  )
}

function AnswerTester({ answer, accepted }: { answer: string; accepted: string[] }) {
  const [input, setInput] = useState('')
  const req = useDebounced(JSON.stringify({ answer, accepted, input }))
  const [result, setResult] = useState<Match | null>(null)
  useEffect(() => {
    const body = JSON.parse(req)
    if (!body.input.trim() || !body.answer.trim()) return setResult(null)
    let live = true
    api<Match>('/catalog/riddles/test-answer', { method: 'POST', json: body })
      .then((r) => live && setResult(r))
      .catch(() => live && setResult(null))
    return () => {
      live = false
    }
  }, [req])
  return (
    <fieldset>
      <legend>בדיקת תשובה</legend>
      <Text label="תשובה של שחקן" value={input} onChange={setInput} />
      <p data-testid="answer-result" className={result ? (result.ok ? 'ok' : 'error') : 'muted'}>
        {!result
          ? 'הקלידו תשובה לבדיקה'
          : result.ok
            ? `מתקבלת (${result.via === 'exact' ? 'התאמה מדויקת' : 'טעות קטנה'}: ${result.matched})`
            : 'לא מתקבלת'}
      </p>
    </fieldset>
  )
}

function RiddleEditor({ value, set, isNew }: EditorProps<Riddle>) {
  const markets = useList<Market>('/catalog/markets')
  const stalls = useList<Stall>('/catalog/stalls')
  const sets = useList<QuestionSet>('/catalog/question-sets')
  const occasions = useList<Occasion>('/catalog/occasions')
  const [form, setForm] = useState<Form>('she')
  const [qsId, setQsId] = useState<number | null>(null)
  useEffect(() => {
    if (qsId === null && sets.items?.length) setQsId(sets.items[0].id)
  }, [sets.items, qsId])
  // Switching form: preview with a question set an occasion of that form uses, when the current one isn't.
  const pickForm = (f: Form) => {
    setForm(f)
    // Every set an occasion asks for a recipient of this form (or for its company form).
    const setsFor = (occasions.items ?? []).flatMap((o) =>
      o.audience === 'company'
        ? o.forms.includes(f)
          ? [o.questionSetId]
          : []
        : occasionRecipients(o)
            .filter((c) => c.form === f)
            .map((c) => c.questionSetId),
    )
    if (setsFor.length && !setsFor.includes(qsId)) setQsId(setsFor[0])
  }

  const templates = value.templates ?? {}
  const accepted = value.accepted ?? []
  const marketName = (id: number) => markets.items?.find((m) => m.id === id)?.name ?? ''
  const qset = sets.items?.find((s) => s.id === qsId)
  const used = useMemo(
    () => [...new Set(FORMS.flatMap((f) => extractSlots(templates[f] ?? '')))],
    [templates],
  )
  const defined = new Set([...(qset?.questions.map((q) => q.slot) ?? []), ...nameSlots(form)])
  // Checked for the form being edited: other forms are usually answered by other question sets.
  const undefinedSlots = qset ? extractSlots(templates[form] ?? '').filter((s) => !defined.has(s)) : []

  return (
    <>
      <Select
        label="דוכן"
        value={value.stallId}
        disabled={!isNew}
        options={(stalls.items ?? []).map((s) => ({
          value: s.id,
          label: `${s.name} (${marketName(s.marketId)})`,
        }))}
        onChange={(stallId) => set({ stallId })}
      />
      <Text label="כותרת פנימית" value={value.title} onChange={(title) => set({ title })} />
      <Text label="תשובה" value={value.answer} onChange={(answer) => set({ answer })} required />
      <label>
        תשובות נוספות שמתקבלות (שורה לכל תשובה)
        <textarea
          rows={3}
          value={accepted.join('\n')}
          onChange={(e) => set({ accepted: e.target.value.split('\n') })}
        />
      </label>
      <Text label="רמז" value={value.hint} onChange={(hint) => set({ hint })} />
      <Text label="טקסט אחרי פתרון" value={value.afterText} onChange={(afterText) => set({ afterText })} />
      <Check label="פעיל" checked={value.active} onChange={(active) => set({ active })} />

      <fieldset>
        <legend>נוסח החידה</legend>
        <div className="tabs" role="tablist">
          {FORMS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={f === form}
              className={f === form ? 'on' : ''}
              onClick={() => pickForm(f)}
            >
              {FORM_LABELS[f]}
              {templates[f] ? '' : ' (ריק)'}
            </button>
          ))}
        </div>
        <label>
          נוסח ({FORM_LABELS[form]})
          <textarea
            rows={8}
            value={templates[form] ?? ''}
            onChange={(e) => set({ templates: { ...templates, [form]: e.target.value } })}
            placeholder={
              'בסוף כל טקס שרים אותה כשכולם עומדים,\nהיא עוד לא אבדה, גם בימים הקשים.\n? ומאז {first_love}, {name} יודעת: עליה לא מוותרים. || ו{name} יודעת: עליה לא מוותרים.\nמה היא?'
            }
          />
        </label>
        <p className="muted small" data-testid="template-help">
          שורה לכל שורה בחידה. השורות הקבועות לבדן צריכות להוביל לתשובה. שורה שמתחילה ב-? היא שורה אישית: היא
          מופיעה רק כשיש תשובה לכל המשבצות שבה (בלי ברירות מחדל). || מפריד בין חלופות: הראשונה שיש לה תשובות
          נכנסת, וחלופה בלי משבצות שומרת על החרוז כשאין תשובה. בלי אף חלופה מתאימה, השורה מדלגת.
        </p>
        <Select
          label="שאלון לתצוגה"
          value={qsId}
          placeholder="ללא שאלון"
          options={(sets.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => setQsId(v || null)}
        />
        <RiddlePreview template={templates[form] ?? ''} form={form} questionSetId={qsId} />
        <p className="muted">
          משבצות בשימוש:{' '}
          {used.length ? (
            used.map((s) => (
              <code key={s} className={undefinedSlots.includes(s) ? 'error' : ''}>
                {`{${s}}`}{' '}
              </code>
            ))
          ) : (
            <span>אין</span>
          )}
        </p>
        {undefinedSlots.length > 0 && (
          <p className="error" data-testid="undefined-slots">
            לא מוגדרות בשאלון "{qset?.name}" (יישארו ריקות): {undefinedSlots.join(', ')}
          </p>
        )}
      </fieldset>
      <AnswerTester answer={value.answer ?? ''} accepted={accepted.filter((a) => a.trim())} />
    </>
  )
}

export function RiddlesPage() {
  const stalls = useList<Stall>('/catalog/stalls')
  const stallName = (id: number) => stalls.items?.find((s) => s.id === id)?.name ?? `#${id}`
  return (
    <CrudPage<Riddle>
      section="riddles"
      title="חידות"
      path="/catalog/riddles"
      newLabel="חידה חדשה"
      blank={() => ({
        stallId: stalls.items?.[0]?.id,
        title: '',
        answer: '',
        accepted: [],
        hint: '',
        templates: {},
        afterText: '',
        active: true,
      })}
      toBody={(v) => ({
        ...v,
        accepted: (v.accepted ?? []).map((a) => a.trim()).filter(Boolean),
        templates: cleanForms(v.templates ?? {}),
      })}
      columns={[
        { label: 'כותרת', render: (r) => r.title || r.answer },
        { label: 'תשובה', render: (r) => r.answer },
        { label: 'דוכן', render: (r) => stallName(r.stallId) },
        { label: 'מצב', render: (r) => (r.active ? 'פעיל' : 'לא פעיל') },
      ]}
      Editor={RiddleEditor}
    />
  )
}
