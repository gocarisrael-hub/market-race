// Optional personal questions about the honoree, each with its answer. The game asks one before
// it shows a riddle's hint. Used on the questions step of the order flow and on the edit page.
import type { HintQuestion } from './api.ts'
import { copy, type SiteForm } from './copy.ts'
import { MAX_HINT_QUESTIONS } from './logic.ts'
import { QField, TornPaper } from './ui.tsx'

export function HintQuestions(props: {
  value: HintQuestion[]
  onChange: (v: HintQuestion[]) => void
  form: SiteForm | null
}) {
  const list = props.value
  const set = (i: number, patch: Partial<HintQuestion>) =>
    props.onChange(list.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  return (
    <TornPaper tilt="l" id="hint-questions">
      <h2 className="sub">{copy.hintQuestions.title}</h2>
      <p className="hint" style={{ margin: '4px 0 0' }}>
        {copy.hintQuestions.intro} ({copy.optional})
      </p>
      {list.map((q, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id; order is stable
        <div className="note hint-q" key={i}>
          <QField
            name={`hintQuestion${i}`}
            label={`${copy.hintQuestions.question} ${i + 1}`}
            placeholder={copy.hintQuestions.questionPlaceholder(props.form)}
            value={q.question}
            maxLen={140}
            onChange={(v) => set(i, { question: v })}
          />
          <QField
            name={`hintAnswer${i}`}
            label={`${copy.hintQuestions.answer} ${i + 1}`}
            placeholder={copy.hintQuestions.answerPlaceholder}
            value={q.answer}
            maxLen={60}
            onChange={(v) => set(i, { answer: v })}
          />
          <button
            type="button"
            className="link-btn"
            onClick={() => props.onChange(list.filter((_, j) => j !== i))}
          >
            {copy.hintQuestions.remove}
          </button>
        </div>
      ))}
      {list.length < MAX_HINT_QUESTIONS && (
        <button
          type="button"
          className="add-link"
          onClick={() => props.onChange([...list, { question: '', answer: '' }])}
        >
          {copy.hintQuestions.add(list.length)}
        </button>
      )}
    </TornPaper>
  )
}
