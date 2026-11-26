// Orders: list with filters, review queue, order detail (answers, game, links, payments,
// messages, redemptions, company tools), test-game form, live games.
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { occasionRecipients } from '../../../server/domain/recipient.ts'
import { nameSlots, questionTextFor } from '../../../server/domain/template.ts'
import {
  ALLERGENS,
  DIETS,
  type Form,
  type GameSnapshot,
  type LetterNote,
  type OrderFlag,
  type OrderStatus,
  type Palette,
  type Question,
  type Recipient,
  type TextPart,
} from '../../../server/domain/types.ts'
import { api } from '../api.ts'
import {
  Check,
  DIET_LABELS,
  errorText,
  FORM_LABELS,
  go,
  MoneyInput,
  NumberInput,
  type Occasion,
  type PaletteRow,
  type QuestionSet,
  RECIPIENT_LABELS,
  type Route,
  Select,
  shekels,
  Text,
  type Theme,
  useList,
  useLoc,
} from '../ui.tsx'

// ---------- Types and labels ----------

export const STATUS_LABELS: Record<OrderStatus, string> = {
  quoted: 'הצעת מחיר',
  pending_payment: 'ממתינה לתשלום',
  awaiting_answers: 'ממתינה לתשובות',
  review: 'לבדיקה',
  ready: 'מוכנה',
  active: 'במשחק',
  done: 'הסתיימה',
  expired: 'פגה',
  cancelled: 'בוטלה',
}
const STEP_LABELS: Record<string, string> = {
  opening: 'פתיחה',
  riddle: 'חידה',
  revealed: 'בדרך לדוכן',
  redeem: 'בדוכן',
  done: 'סיום',
}
const KIND_LABELS = { private: 'פרטי', company: 'חברה' }
const EDITABLE: OrderStatus[] = ['quoted', 'pending_payment', 'awaiting_answers', 'review', 'ready']

interface Usage {
  stops: number
  redeemedStops: number
  bought: number
  used: number
  /** How many arrived (chosen at the start), null before it. */
  players?: number | null
  /** Portions bought and not served; never refunded automatically. */
  unused?: number
}

interface OrderRow {
  id: number
  orderNo: string
  kind: 'private' | 'company'
  status: OrderStatus
  createdAt: string
  paidAt: string | null
  priceAgorot: number
  paymentRef: string | null
  buyerName: string
  buyerPhone: string
  buyerEmail: string
  occasionKey: string
  form: Form
  honoreeName: string
  themeId: number | null
  routeId: number | null
  people: number
  allergens: string[]
  diets: string[]
  answers: Record<string, string>
  letterNotes: LetterNote[]
  hintQuestions?: { question: string; answer: string }[]
  companyName: string | null
  companyLogo: string | null
  companyPalette: Palette | null
  validUntil: string | null
  flags: OrderFlag[]
  gameToken: string
  manageToken: string
  notes: string
  answersSubmittedAt: string | null
  deliveredAt: string | null
  usage?: Usage
}
type FullOrder = OrderRow & { game: GameSnapshot | null; recipient?: Recipient | null }

interface Detail {
  order: FullOrder
  state: {
    stopIndex: number
    step: string
    startedAt: string | null
    finishedAt: string | null
    pausedAt?: string | null
    lastActivityAt: string
    wrongAnswers: number
  } | null
  redemptions: {
    id: number
    stopIndex: number
    stallName: string
    tastingName: string
    portions: number
    feeAgorot: number
    usedBackup: boolean
    redeemedAt: string
  }[]
  usage: Usage
  messages: {
    id: number
    channel: string
    to: string
    template: string
    status: string
    error: string | null
    createdAt: string
  }[]
  paySessions: {
    id: number
    amountAgorot: number
    env: string
    status: string
    transactionId: string | null
    createdAt: string
    settledAt: string | null
  }[]
  uploads: { id: number; kind: string; path: string; createdAt: string }[]
  lead: { id: number; companyName: string; contactName: string } | null
  occasion: { key: string; label: string; audience: string } | null
  questions: Question[]
  links: { game: string; manage: string; pay: string; qr: string }
}

export function when(s: string | null | undefined): string {
  if (!s) return ''
  return new Date(s).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function ago(s: string, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - new Date(s).getTime()) / 1000))
  if (sec < 60) return `לפני ${sec} שנ'`
  const min = Math.round(sec / 60)
  if (min < 60) return `לפני ${min} דק'`
  const h = Math.round(min / 60)
  if (h < 24) return `לפני ${h} שע'`
  return `לפני ${Math.round(h / 24)} ימים`
}

const questionText = questionTextFor

/** Questions with their own field in the admin forms: not hidden, not asked as the name field. */
const ownField = (q: Question, form: Form, kind: 'private' | 'company') =>
  !q.hidden && !nameSlots(form).includes(q.slot) && !(kind === 'company' && q.slot === 'company_name')

function UsageText({ u }: { u: Usage | undefined }) {
  if (!u) return null
  return (
    <span title={`${u.redeemedStops} מתוך ${u.stops} תחנות`}>
      {u.used} / {u.bought}
    </span>
  )
}

function useOccasionLabels() {
  const { items } = useList<Occasion>('/catalog/occasions')
  return (key: string) => items?.find((o) => o.key === key)?.label ?? key
}

// ---------- List ----------

function OrdersTable({ rows, base }: { rows: OrderRow[]; base: string }) {
  const occ = useOccasionLabels()
  return (
    <table className="orders">
      <thead>
        <tr>
          <th>מס' הזמנה</th>
          <th>נוצרה</th>
          <th>סוג</th>
          <th>אירוע</th>
          <th>חוגג/ת</th>
          <th>אנשים</th>
          <th>מחיר</th>
          <th>סטטוס</th>
          <th>שולם</th>
          <th>מנות (נוצלו / נקנו)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id} onClick={() => go(`/${base}/${o.id}`)}>
            <td dir="ltr">{o.orderNo}</td>
            <td>{when(o.createdAt)}</td>
            <td>{KIND_LABELS[o.kind]}</td>
            <td>{occ(o.occasionKey)}</td>
            <td>{o.companyName || o.honoreeName}</td>
            <td>{o.people}</td>
            <td>{shekels(o.priceAgorot)}</td>
            <td>
              <span className={`status s-${o.status}`}>{STATUS_LABELS[o.status]}</span>
              {o.status === 'review' && o.flags.length > 0 && (
                <div className="muted small">{o.flags.map((f) => f.message).join('; ')}</div>
              )}
            </td>
            <td>{o.paidAt ? when(o.paidAt) : '—'}</td>
            <td>
              <UsageText u={o.usage} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function OrdersPage() {
  const loc = useLoc()
  if (loc.id) return <OrderDetail key={loc.id} id={Number(loc.id)} back="orders" />
  return <OrdersList />
}

function OrdersList() {
  const loc = useLoc()
  const [status, setStatus] = useState(loc.query.get('status') ?? '')
  const [kind, setKind] = useState(loc.query.get('kind') ?? '')
  const [q, setQ] = useState(loc.query.get('q') ?? '')
  const [data, setData] = useState<{ orders: OrderRow[]; totals: { bought: number; used: number } } | null>(
    null,
  )
  const [error, setError] = useState('')
  useEffect(() => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (kind) p.set('kind', kind)
    if (q.trim()) p.set('q', q.trim())
    const t = setTimeout(() => {
      api<typeof data>(`/orders?${p}`)
        .then((d) => {
          setData(d)
          setError('')
        })
        .catch((e) => setError(errorText(e)))
    }, 200)
    return () => clearTimeout(t)
  }, [status, kind, q])
  return (
    <section className="list">
      <div className="bar">
        <h1>הזמנות</h1>
        <a href="#/test-game">משחק בדיקה חדש</a>
      </div>
      <div className="row filters">
        <Select
          label="סטטוס"
          value={status}
          placeholder="הכול"
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={setStatus}
        />
        <Select
          label="סוג"
          value={kind}
          placeholder="הכול"
          options={[
            { value: 'private', label: 'פרטי' },
            { value: 'company', label: 'חברה' },
          ]}
          onChange={setKind}
        />
        <Text label="חיפוש (מס' הזמנה, קונה, חוגג/ת)" value={q} onChange={setQ} />
      </div>
      {error && <p className="error">{error}</p>}
      {!data ? (
        <p className="muted">טוען…</p>
      ) : data.orders.length === 0 ? (
        <p className="muted">אין הזמנות</p>
      ) : (
        <>
          <p className="muted">
            {data.orders.length} הזמנות. מנות שנוצלו מתוך שנקנו: {data.totals.used} / {data.totals.bought}
          </p>
          <OrdersTable rows={data.orders} base="orders" />
        </>
      )}
    </section>
  )
}

// ---------- Review queue ----------

export function ReviewPage() {
  const loc = useLoc()
  const [rows, setRows] = useState<OrderRow[] | null>(null)
  useEffect(() => {
    if (loc.id) return
    api<{ orders: OrderRow[] }>('/orders?status=review')
      .then((d) => setRows(d.orders))
      .catch(() => setRows([]))
  }, [loc.id])
  if (loc.id) return <OrderDetail key={loc.id} id={Number(loc.id)} back="review" />
  return (
    <section className="list">
      <div className="bar">
        <h1>תור בדיקה</h1>
      </div>
      <p className="muted">
        הזמנות עם תשובות חריגות או תחנה חסומה. מתקנים את התשובות (המשחק נבנה מחדש) או מאשרים כמו שהן.
      </p>
      {!rows ? (
        <p className="muted">טוען…</p>
      ) : rows.length === 0 ? (
        <p className="muted">אין הזמנות לבדיקה</p>
      ) : (
        <OrdersTable rows={rows} base="review" />
      )}
    </section>
  )
}

// ---------- Detail ----------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {children}
    </fieldset>
  )
}

export function RiddleText({ parts }: { parts: TextPart[] }) {
  return (
    <p className="riddle">
      {parts.map((p, i) =>
        p.t === 'slot' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are a fixed sequence
          <span key={i} className="slot" title={p.slot}>
            {p.v}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are a fixed sequence
          <span key={i}>{p.v}</span>
        ),
      )}
    </p>
  )
}

export function GameView({ game }: { game: GameSnapshot }) {
  return (
    <div className="game">
      <p className="muted">
        {game.market.name} · {game.theme.name} · {FORM_LABELS[game.form]} ·{' '}
        {game.people === 1 ? 'משתתף אחד' : `${game.people} אנשים`}
        {game.allergens.length > 0 && ` · אלרגנים: ${game.allergens.join(', ')}`}
        {game.diets.length > 0 && ` · ${game.diets.map((d) => DIET_LABELS[d] ?? d).join(', ')}`} · נבנה{' '}
        {when(game.builtAt)}
      </p>
      <ol className="stops">
        {game.stops.map((s) => (
          <li key={s.index} className="stop">
            <div>
              <strong>{s.stall.name}</strong>
              {s.finale && <span className="finale"> (סיום)</span>}
              {s.swappedToBackup && <span className="error"> הוחלף לדוכן הגיבוי בגלל אלרגנים/תזונה</span>}
              {s.stall.locationHint && <span className="muted"> · {s.stall.locationHint}</span>}
            </div>
            <div>
              טעימה: {s.tasting.name} ({shekels(s.tasting.feeAgorot)} למנה)
              {s.tasting.allergens.length > 0 && (
                <span className="muted"> · אלרגנים: {s.tasting.allergens.join(', ')}</span>
              )}
            </div>
            <RiddleText parts={s.riddle.parts} />
            <div className="muted small">
              תשובה: <strong>{s.riddle.answer}</strong>
              {s.riddle.accepted.length > 0 && ` (גם: ${s.riddle.accepted.join(', ')})`} · רמז:{' '}
              {s.riddle.hint}
            </div>
            <div className="muted small">
              גיבוי:{' '}
              {s.backup ? (
                `${s.backup.stall.name}, ${s.backup.tasting.name}`
              ) : (
                <span className="error">אין</span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {game.letter.notes.length > 0 && (
        <div>
          <strong>מכתב:</strong>
          {game.letter.notes.map((n, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: notes have no id
            <p key={i}>
              {n.text} <em>{n.signature}</em>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function Links({ d }: { d: Detail }) {
  const o = d.order
  const playable = ['ready', 'active', 'done'].includes(o.status)
  return (
    <Section title="קישורים">
      <div className="links">
        <div>
          משחק:{' '}
          <a href={d.links.game} target="_blank" rel="noreferrer" dir="ltr">
            {d.links.game}
          </a>
        </div>
        <div>
          ניהול ללקוח:{' '}
          <a href={d.links.manage} target="_blank" rel="noreferrer" dir="ltr">
            {d.links.manage}
          </a>
        </div>
        {o.kind === 'company' && !o.paidAt && (
          <div>
            תשלום: <span dir="ltr">{d.links.pay}</span>
          </div>
        )}
        {playable && <img className="qr" src={d.links.qr} alt="QR למשחק" width={140} height={140} />}
      </div>
    </Section>
  )
}

function AnswersEditor({
  d,
  onSave,
  doneLabel,
}: {
  d: Detail
  onSave: (v: {
    answers: Record<string, string>
    letterNotes: LetterNote[]
    honoreeName: string
    done: boolean
  }) => Promise<void>
  doneLabel?: string
}) {
  const o = d.order
  const [answers, setAnswers] = useState<Record<string, string>>(o.answers)
  const [notes, setNotes] = useState<LetterNote[]>(o.letterNotes)
  const [honoree, setHonoree] = useState(o.honoreeName)
  const [busy, setBusy] = useState(false)
  const editable = EDITABLE.includes(o.status)
  const known = new Set(d.questions.map((q) => q.slot))
  const extra = Object.keys(answers).filter((k) => !known.has(k))
  const flagged = new Set(o.flags.filter((f) => f.slot && !f.resolved).map((f) => f.slot))
  const save = async (done: boolean) => {
    setBusy(true)
    try {
      await onSave({ answers, letterNotes: notes, honoreeName: honoree, done })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="תשובות">
      {o.kind === 'private' && (
        <Text
          label={o.form === 'group' ? 'שם הקבוצה / המשפחה' : 'שם החוגג/ת'}
          value={honoree}
          onChange={setHonoree}
        />
      )}
      {d.questions
        .filter((q) => ownField(q, o.form, o.kind))
        .map((q) => (
          <label key={q.slot} className={flagged.has(q.slot) ? 'flagged' : ''}>
            {questionText(q, o.form)} {q.required && <span className="error">*</span>}{' '}
            <code className="muted">{q.slot}</code>
            <textarea
              rows={2}
              value={answers[q.slot] ?? ''}
              disabled={!editable}
              onChange={(e) => setAnswers({ ...answers, [q.slot]: e.target.value })}
            />
          </label>
        ))}
      {extra.map((k) => (
        <Text key={k} label={k} value={answers[k]} onChange={(v) => setAnswers({ ...answers, [k]: v })} />
      ))}
      <strong>משפטים למכתב</strong>
      {notes.map((n, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: notes have no id
        <div className="row" key={i}>
          <Text
            label={`משפט ${i + 1}`}
            value={n.text}
            multiline
            onChange={(text) => setNotes(notes.map((x, j) => (j === i ? { ...x, text } : x)))}
          />
          <Text
            label="חתימה"
            value={n.signature}
            onChange={(signature) => setNotes(notes.map((x, j) => (j === i ? { ...x, signature } : x)))}
          />
          <button
            type="button"
            disabled={!editable}
            onClick={() => setNotes(notes.filter((_, j) => j !== i))}
          >
            הסרה
          </button>
        </div>
      ))}
      {editable && (
        <div className="actions">
          <button type="button" onClick={() => setNotes([...notes, { text: '', signature: '' }])}>
            הוספת משפט
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => save(false)}>
            {o.kind === 'company' ? 'שמירה' : 'שמירה ובנייה מחדש'}
          </button>
          {doneLabel && (
            <button type="button" className="primary" disabled={busy} onClick={() => save(true)}>
              {doneLabel}
            </button>
          )}
        </div>
      )}
      {!editable && <p className="muted">המשחק התחיל או הסתיים: התשובות קפואות.</p>}
    </Section>
  )
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="color">
      {label}
      <span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} size={8} />
      </span>
    </label>
  )
}

function CompanyPanel({
  d,
  reload,
  say,
}: {
  d: Detail
  reload: () => Promise<void>
  say: (s: string) => void
}) {
  const o = d.order
  const themes = useList<Theme>('/catalog/themes').items ?? []
  const routes = useList<Route>('/catalog/routes').items ?? []
  const occasions = (useList<Occasion>('/catalog/occasions').items ?? []).filter(
    (x) => x.audience === 'company',
  )
  const [f, setF] = useState({
    companyName: o.companyName ?? '',
    occasionKey: o.occasionKey,
    people: o.people,
    priceAgorot: o.priceAgorot,
    themeId: o.themeId,
    routeId: o.routeId,
    buyerName: o.buyerName,
    buyerPhone: o.buyerPhone,
    buyerEmail: o.buyerEmail,
  })
  const theme = themes.find((t) => t.id === f.themeId)
  const [pal, setPal] = useState<Palette | null>(o.companyPalette)
  const [swatches, setSwatches] = useState<{ hex: string; share: number }[]>([])
  const [payUrl, setPayUrl] = useState('')
  const editable = EDITABLE.includes(o.status)
  const patch = async (body: object, msg = 'נשמר') => {
    try {
      await api(`/orders/${o.id}/company`, { method: 'PATCH', json: body })
      await reload()
      say(msg)
    } catch (e) {
      say(errorText(e))
    }
  }
  return (
    <>
      <Section title="פרטי החברה וההצעה">
        <div className="row">
          <Text
            label="שם החברה"
            value={f.companyName}
            onChange={(companyName) => setF({ ...f, companyName })}
          />
          <Select
            label="סוג אירוע"
            value={f.occasionKey}
            disabled={!!o.paidAt}
            options={occasions.map((x) => ({ value: x.key, label: x.label }))}
            onChange={(occasionKey) => setF({ ...f, occasionKey })}
          />
        </div>
        <div className="row">
          <NumberInput label="אנשים" value={f.people} onChange={(people) => setF({ ...f, people })} />
          <MoneyInput
            label="מחיר"
            agorot={f.priceAgorot}
            onChange={(priceAgorot) => setF({ ...f, priceAgorot })}
          />
        </div>
        <div className="row">
          <Select
            label="עיצוב"
            value={f.themeId}
            options={themes.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(themeId) => setF({ ...f, themeId })}
          />
          <Select
            label="מסלול"
            value={f.routeId}
            options={routes
              .filter((r) => !theme || r.marketId === theme.marketId)
              .map((r) => ({ value: r.id, label: r.name }))}
            onChange={(routeId) => setF({ ...f, routeId })}
          />
        </div>
        <div className="row">
          <Text label="איש קשר" value={f.buyerName} onChange={(buyerName) => setF({ ...f, buyerName })} />
          <Text
            label="טלפון"
            value={f.buyerPhone}
            dir="ltr"
            onChange={(buyerPhone) => setF({ ...f, buyerPhone })}
          />
          <Text
            label="אימייל"
            value={f.buyerEmail}
            dir="ltr"
            onChange={(buyerEmail) => setF({ ...f, buyerEmail })}
          />
        </div>
        {editable && (
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                const { people, priceAgorot, occasionKey, ...rest } = f
                patch(o.paidAt ? rest : { ...rest, people, priceAgorot, occasionKey })
              }}
            >
              שמירת פרטים
            </button>
          </div>
        )}
        {!o.paidAt && ['quoted', 'pending_payment'].includes(o.status) && (
          <div className="actions">
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await api<{ url: string }>(`/orders/${o.id}/payment-link`, {
                    method: 'POST',
                    json: {},
                  })
                  setPayUrl(r.url)
                  await navigator.clipboard?.writeText(r.url).catch(() => {})
                  say('קישור התשלום הועתק')
                } catch (e) {
                  say(errorText(e))
                }
              }}
            >
              קישור לתשלום
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await api<{ url: string }>(`/orders/${o.id}/payment-link`, {
                    method: 'POST',
                    json: { send: true },
                  })
                  setPayUrl(r.url)
                  await reload()
                  say('קישור התשלום נשלח')
                } catch (e) {
                  say(errorText(e))
                }
              }}
            >
              שליחת קישור לתשלום לאיש הקשר
            </button>
            {payUrl && (
              <code dir="ltr" className="pay-url">
                {payUrl}
              </code>
            )}
          </div>
        )}
      </Section>
      <Section title="לוגו וצבעים">
        {o.companyLogo && <img className="logo" src={`/uploads/${o.companyLogo}`} alt="לוגו" />}
        {editable && (
          <label>
            העלאת לוגו (png, jpg, webp)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const fd = new FormData()
                fd.append('file', file)
                try {
                  const r = await api<{ palette: Palette; swatches: { hex: string; share: number }[] }>(
                    `/orders/${o.id}/logo`,
                    { method: 'POST', body: fd },
                  )
                  setPal(r.palette)
                  setSwatches(r.swatches)
                  await reload()
                  say('הלוגו הועלה והצבעים חולצו')
                } catch (err) {
                  say(errorText(err))
                }
              }}
            />
          </label>
        )}
        {swatches.length > 0 && (
          <p>
            צבעים בלוגו:{' '}
            <span className="swatches">
              {swatches.map((s) => (
                <i
                  key={s.hex}
                  style={{ background: s.hex }}
                  title={`${s.hex} ${Math.round(s.share * 100)}%`}
                />
              ))}
            </span>
          </p>
        )}
        {pal ? (
          <>
            <div className="row">
              <ColorInput
                label="הדגשה"
                value={pal.accent}
                onChange={(accent) => setPal({ ...pal, accent })}
              />
              <ColorInput label="דיו" value={pal.ink} onChange={(ink) => setPal({ ...pal, ink })} />
              <ColorInput
                label="רקע"
                value={pal.background}
                onChange={(background) => setPal({ ...pal, background })}
              />
              <ColorInput label="נייר" value={pal.paper} onChange={(paper) => setPal({ ...pal, paper })} />
            </div>
            <div className="palette-preview" style={{ background: pal.background }}>
              <span className="sample" style={{ background: pal.paper, color: pal.ink }}>
                טקסט <b style={{ color: pal.accent }}>{o.companyName}</b>
              </span>
            </div>
            {editable && (
              <div className="actions">
                <button type="button" onClick={() => patch({ companyPalette: pal }, 'הצבעים נשמרו')}>
                  שמירת צבעים
                </button>
                <button type="button" onClick={() => patch({ companyPalette: null }, 'חזרה לצבעי העיצוב')}>
                  צבעי העיצוב
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="muted">אין צבעי חברה: המשחק בצבעי העיצוב.</p>
        )}
      </Section>
    </>
  )
}

function OrderDetail({ id, back }: { id: number; back: string }) {
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const reload = useCallback(async () => {
    try {
      setD(await api<Detail>(`/orders/${id}`))
    } catch (e) {
      setError(errorText(e))
    }
  }, [id])
  useEffect(() => {
    reload()
  }, [reload])
  if (error) return <p className="error">{error}</p>
  if (!d) return <p className="muted">טוען…</p>
  const o = d.order
  const run = async (path: string, ok: string, body: object = {}) => {
    setStatus('')
    try {
      const r = await api<{ refundNeeded?: boolean }>(path, { method: 'POST', json: body })
      await reload()
      setStatus(r.refundNeeded ? `${ok}. ההזמנה שולמה: יש לבצע זיכוי בטרנזילה.` : ok)
      window.dispatchEvent(new Event('orders-changed'))
    } catch (e) {
      setStatus(errorText(e))
    }
  }
  const started = !!d.state?.startedAt
  return (
    <div className="detail">
      <div className="bar">
        <a href={`#/${back}`}>חזרה</a>
        <h1>
          הזמנה <span dir="ltr">{o.orderNo}</span>
        </h1>
        <span className={`status s-${o.status}`}>{STATUS_LABELS[o.status]}</span>
      </div>
      <div className="actions">
        {o.status === 'review' && (
          <button type="button" className="primary" onClick={() => run(`/orders/${id}/approve`, 'אושר')}>
            אישור
          </button>
        )}
        {['awaiting_answers', 'review', 'ready'].includes(o.status) && (
          <button type="button" onClick={() => run(`/orders/${id}/rebuild`, 'נבנה מחדש')}>
            בנייה מחדש
          </button>
        )}
        {['ready', 'active', 'done'].includes(o.status) && (
          <button type="button" onClick={() => run(`/orders/${id}/resend`, 'הקישור נשלח')}>
            שליחת קישור המשחק שוב
          </button>
        )}
        {EDITABLE.includes(o.status) && !started && (
          <button
            type="button"
            className="danger"
            onClick={() => confirm('לבטל את ההזמנה?') && run(`/orders/${id}/cancel`, 'בוטלה')}
          >
            ביטול הזמנה
          </button>
        )}
        {status && <span className={/שגיאה|לא|פג/.test(status) ? 'error' : 'ok'}>{status}</span>}
      </div>
      <p className="muted small">שובר פיצוי (מנות שלא נוצלו) יינתן בהמשך, ידנית על ידי הבעלים.</p>

      {o.flags.length > 0 && (
        <Section title="דגלים">
          <ul className="flags">
            {o.flags.map((f, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: flags have no id
              <li key={i} className={f.resolved ? 'muted' : 'error'}>
                {f.message}
                {f.resolved && ' (אושר)'}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="cols">
        <Section title="פרטים">
          <dl className="facts">
            <dt>סוג</dt>
            <dd>
              {KIND_LABELS[o.kind]} · {d.occasion?.label ?? o.occasionKey} ·{' '}
              {o.recipient ? RECIPIENT_LABELS[o.recipient] : FORM_LABELS[o.form]}
            </dd>
            <dt>{o.kind === 'company' ? 'חברה' : 'חוגג/ת'}</dt>
            <dd>{o.companyName || o.honoreeName}</dd>
            <dt>קונה</dt>
            <dd>
              {o.buyerName} <span dir="ltr">{o.buyerPhone}</span> <span dir="ltr">{o.buyerEmail}</span>
            </dd>
            <dt>אנשים</dt>
            <dd>{o.people}</dd>
            <dt>אלרגנים / תזונה</dt>
            <dd>{[...o.allergens, ...o.diets.map((x) => DIET_LABELS[x] ?? x)].join(', ') || '—'}</dd>
            {(o.hintQuestions?.length ?? 0) > 0 && (
              <>
                <dt>שאלות לרמזים</dt>
                <dd>
                  <ul className="plain">
                    {o.hintQuestions!.map((q, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: questions have no id
                      <li key={i}>
                        {q.question} → {q.answer}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            <dt>מחיר</dt>
            <dd>{shekels(o.priceAgorot)}</dd>
            <dt>נוצרה</dt>
            <dd>{when(o.createdAt)}</dd>
            <dt>שולם</dt>
            <dd>
              {o.paidAt ? when(o.paidAt) : 'לא'} {o.paymentRef && <code dir="ltr">{o.paymentRef}</code>}
            </dd>
            <dt>בתוקף עד</dt>
            <dd>{o.validUntil ?? '—'}</dd>
            <dt>נשלח ללקוח</dt>
            <dd>{o.deliveredAt ? when(o.deliveredAt) : 'לא'}</dd>
            {d.lead && (
              <>
                <dt>ליד</dt>
                <dd>
                  <a href={`#/companies/${d.lead.id}`}>
                    {d.lead.companyName}, {d.lead.contactName}
                  </a>
                </dd>
              </>
            )}
            {o.notes && (
              <>
                <dt>הערה</dt>
                <dd>{o.notes}</dd>
              </>
            )}
          </dl>
        </Section>
        <Section title="נקנה מול נוצל">
          <p className="usage">
            <strong className="big">
              {d.usage.used} / {d.usage.bought}
            </strong>{' '}
            מנות ({d.usage.redeemedStops} מתוך {d.usage.stops} תחנות)
          </p>
          {d.usage.players != null && (
            <p data-testid="players">
              הגיעו {d.usage.players} מתוך {o.game?.people ?? o.people}
            </p>
          )}
          {(d.usage.unused ?? 0) > 0 && (
            <p data-testid="unused">
              מנות שלא נוצלו: <strong>{d.usage.unused}</strong> (לא מוחזרות אוטומטית)
            </p>
          )}
          {d.state && (
            <p className="muted">
              מצב המשחק: תחנה {d.state.stopIndex + 1}, {STEP_LABELS[d.state.step] ?? d.state.step}
              {d.state.pausedAt && ` (בהפסקה מ-${when(d.state.pausedAt)})`} · פעילות אחרונה{' '}
              {when(d.state.lastActivityAt)} · תשובות שגויות {d.state.wrongAnswers}
            </p>
          )}
          {d.redemptions.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>תחנה</th>
                  <th>דוכן</th>
                  <th>טעימה</th>
                  <th>מנות</th>
                  <th>תשלום</th>
                  <th>מתי</th>
                </tr>
              </thead>
              <tbody>
                {d.redemptions.map((r) => (
                  <tr key={r.id}>
                    <td>{r.stopIndex + 1}</td>
                    <td>
                      {r.stallName}
                      {r.usedBackup && ' (גיבוי)'}
                    </td>
                    <td>{r.tastingName}</td>
                    <td>{r.portions}</td>
                    <td>{shekels(r.feeAgorot * r.portions)}</td>
                    <td>{when(r.redeemedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Links d={d} />

      {o.kind === 'company' && <CompanyPanel key={`${o.id}`} d={d} reload={reload} say={setStatus} />}

      <AnswersEditor
        key={`${o.id}:${o.answersSubmittedAt}`}
        d={d}
        doneLabel={o.kind === 'company' && !o.answersSubmittedAt ? 'שמירה וסימון התשובות כגמורות' : undefined}
        onSave={async (v) => {
          setStatus('')
          try {
            if (o.kind === 'company') {
              await api(`/orders/${id}/company-answers`, {
                method: 'PUT',
                json: { answers: v.answers, letterNotes: v.letterNotes, done: v.done },
              })
            } else {
              await api(`/orders/${id}/answers`, {
                method: 'PATCH',
                json: { answers: v.answers, letterNotes: v.letterNotes, honoreeName: v.honoreeName },
              })
            }
            await reload()
            setStatus('נשמר')
            window.dispatchEvent(new Event('orders-changed'))
          } catch (e) {
            setStatus(errorText(e))
          }
        }}
      />
      {o.kind === 'company' && (
        <p className="muted small">
          {o.answersSubmittedAt
            ? `התשובות סומנו כגמורות ${when(o.answersSubmittedAt)}.${o.paidAt ? '' : ' המשחק ייבנה ויישלח אחרי התשלום.'}`
            : 'כשהתשובות גמורות מסמנים אותן. אם ההזמנה שולמה, המשחק נבנה ונשלח.'}
        </p>
      )}

      <Section title="המשחק">
        {o.game ? <GameView game={o.game} /> : <p className="muted">המשחק עוד לא נבנה.</p>}
      </Section>

      <Section title="תשלומים">
        {d.paySessions.length === 0 ? (
          <p className="muted">אין ניסיונות תשלום</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>נפתח</th>
                <th>סכום</th>
                <th>סטטוס</th>
                <th>עסקה</th>
                <th>הוסדר</th>
              </tr>
            </thead>
            <tbody>
              {d.paySessions.map((s) => (
                <tr key={s.id}>
                  <td>{when(s.createdAt)}</td>
                  <td>{shekels(s.amountAgorot)}</td>
                  <td>{s.status}</td>
                  <td dir="ltr">{s.transactionId ?? ''}</td>
                  <td>{when(s.settledAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="הודעות שנשלחו">
        {d.messages.length === 0 ? (
          <p className="muted">לא נשלחו הודעות</p>
        ) : (
          <table className="messages">
            <thead>
              <tr>
                <th>מתי</th>
                <th>ערוץ</th>
                <th>אל</th>
                <th>תבנית</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {d.messages.map((m) => (
                <tr key={m.id}>
                  <td>{when(m.createdAt)}</td>
                  <td>{m.channel === 'email' ? 'אימייל' : 'וואטסאפ'}</td>
                  <td dir="ltr">{m.to}</td>
                  <td dir="ltr">{m.template}</td>
                  <td>
                    {m.status}
                    {m.error && <span className="error"> {m.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

// ---------- Test game ----------

function toggle(list: string[], v: string, on: boolean) {
  return on ? [...new Set([...list, v])] : list.filter((x) => x !== v)
}

export function TestGamePage() {
  const occasions = (useList<Occasion>('/catalog/occasions').items ?? []).filter((o) => o.active)
  const themes = (useList<Theme>('/catalog/themes').items ?? []).filter((t) => t.active)
  const routes = (useList<Route>('/catalog/routes').items ?? []).filter((r) => r.active)
  const palettes = (useList<PaletteRow>('/catalog/palettes').items ?? []).filter((p) => p.active)
  const sets = useList<QuestionSet>('/catalog/question-sets').items ?? []
  const [paletteId, setPaletteId] = useState<number | null>(null)
  const [occasionKey, setOccasionKey] = useState('')
  const [form, setForm] = useState<Form | ''>('')
  const [recipient, setRecipient] = useState<Recipient | ''>('')
  const [themeId, setThemeId] = useState<number | null>(null)
  const [routeId, setRouteId] = useState<number | null>(null)
  const [people, setPeople] = useState(4)
  const [allergens, setAllergens] = useState<string[]>([])
  const [diets, setDiets] = useState<string[]>([])
  const [honoreeName, setHonoreeName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ order: FullOrder; links: Detail['links'] } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const occ = occasions.find((o) => o.key === occasionKey)
  const theme = themes.find((t) => t.id === themeId)
  const marketRoutes = routes.filter((r) => !theme || r.marketId === theme.marketId)
  const themePalettes = palettes.filter((p) => theme && p.themeIds.includes(theme.id))
  const isCompany = occ?.audience === 'company'
  // A private game is for someone (she, he, a couple, a group, a family): that picks its questions.
  const choices = occ ? occasionRecipients(occ) : []
  const choice = choices.find((c) => c.recipient === recipient)
  const questions =
    sets.find(
      (s) => s.id === (isCompany ? occ?.questionSetId : (choice?.questionSetId ?? occ?.questionSetId)),
    )?.questions ?? []
  const f: Form = isCompany ? form || occ?.forms[0] || 'company' : (choice?.form ?? 'she')

  useEffect(() => {
    if (!occ) return
    if (occ.audience === 'company') {
      if (!form || !occ.forms.includes(form)) setForm(occ.forms[0] ?? '')
    } else if (!recipient || !choices.some((c) => c.recipient === recipient))
      setRecipient(choices[0]?.recipient ?? '')
  }, [occ, form, recipient, choices])
  useEffect(() => {
    if (theme && !marketRoutes.some((r) => r.id === routeId)) setRouteId(marketRoutes[0]?.id ?? null)
  }, [theme, marketRoutes, routeId])

  const submit = async () => {
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const r = await api<{ order: FullOrder; links: Detail['links'] }>('/orders/test', {
        method: 'POST',
        json: {
          occasionKey,
          form: f,
          recipient: isCompany ? null : recipient || null,
          honoreeName: isCompany ? '' : honoreeName,
          companyName: isCompany ? companyName : undefined,
          themeId,
          paletteId: themePalettes.some((p) => p.id === paletteId) ? paletteId : null,
          routeId,
          people,
          allergens,
          diets,
          answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim())),
        },
      })
      setResult(r)
      window.dispatchEvent(new Event('orders-changed'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="test-game">
      <div className="bar">
        <h1>משחק בדיקה</h1>
      </div>
      <p className="muted">
        ממלאים תשובות, בונים משחק ופותחים את הקישור בטלפון כדי לשחק. ההזמנה נשמרת כהזמנת בדיקה.
      </p>
      <form
        className="editor"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="row">
          <Select
            label="אירוע"
            value={occasionKey}
            options={occasions.map((o) => ({ value: o.key, label: o.label }))}
            onChange={setOccasionKey}
          />
          {isCompany ? (
            <Select
              label="צורת פנייה"
              value={form}
              options={(occ?.forms ?? []).map((x) => ({ value: x, label: FORM_LABELS[x] }))}
              onChange={(v) => setForm(v as Form)}
            />
          ) : (
            <Select
              label="למי המשחק"
              value={recipient}
              options={choices.map((c) => ({ value: c.recipient, label: RECIPIENT_LABELS[c.recipient] }))}
              onChange={(v) => setRecipient(v as Recipient)}
            />
          )}
        </div>
        <div className="row">
          <Select
            label="עיצוב"
            value={themeId}
            options={themes.map((t) => ({ value: t.id, label: t.name }))}
            onChange={setThemeId}
          />
          <Select
            label="צבעים"
            value={paletteId}
            placeholder="של העיצוב"
            options={themePalettes.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => setPaletteId(v || null)}
          />
          <Select
            label="מסלול"
            value={routeId}
            options={marketRoutes.map((r) => ({ value: r.id, label: r.name }))}
            onChange={setRouteId}
          />
          <NumberInput label="אנשים" value={people} onChange={setPeople} />
        </div>
        {isCompany ? (
          <Text label="שם החברה" value={companyName} onChange={setCompanyName} required />
        ) : (
          <Text
            label={f === 'group' ? 'שם הקבוצה / המשפחה' : 'שם החוגג/ת'}
            value={honoreeName}
            onChange={setHonoreeName}
            required
          />
        )}
        <fieldset>
          <legend>אלרגנים</legend>
          <div className="checks">
            {ALLERGENS.map((a) => (
              <Check
                key={a}
                label={a}
                checked={allergens.includes(a)}
                onChange={(on) => setAllergens(toggle(allergens, a, on))}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>תזונה</legend>
          <div className="checks">
            {DIETS.map((x) => (
              <Check
                key={x}
                label={DIET_LABELS[x]}
                checked={diets.includes(x)}
                onChange={(on) => setDiets(toggle(diets, x, on))}
              />
            ))}
          </div>
        </fieldset>
        {questions.length > 0 && (
          <fieldset>
            <legend>שאלות</legend>
            {questions
              .filter((q) => ownField(q, f, isCompany ? 'company' : 'private'))
              .map((q) => (
                <Text
                  key={q.slot}
                  label={`${questionText(q, f)}${q.required ? ' *' : ''}`}
                  value={answers[q.slot]}
                  onChange={(v) => setAnswers({ ...answers, [q.slot]: v })}
                />
              ))}
          </fieldset>
        )}
        <div className="actions">
          <button type="submit" disabled={busy || !occasionKey || !themeId || !routeId}>
            יצירת משחק
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      </form>
      {result && (
        <section className="result">
          <h2>
            המשחק נוצר: <span dir="ltr">{result.order.orderNo}</span> ({STATUS_LABELS[result.order.status]})
          </h2>
          {result.order.flags.length > 0 && (
            <ul className="flags error">
              {result.order.flags.map((x, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: flags have no id
                <li key={i}>{x.message}</li>
              ))}
            </ul>
          )}
          <p>
            <a href={result.links.game} target="_blank" rel="noreferrer" dir="ltr">
              {result.links.game}
            </a>
          </p>
          <p>
            מתחילים את המשחק מדף ההזמנה (קפטן):{' '}
            <a href={result.links.manage} target="_blank" rel="noreferrer" dir="ltr">
              {result.links.manage}
            </a>
          </p>
          <img className="qr" src={result.links.qr} alt="QR למשחק" width={160} height={160} />
          <p>
            <a href={`#/orders/${result.order.id}`}>לפרטי ההזמנה</a>
          </p>
          {result.order.game && <GameView game={result.order.game} />}
        </section>
      )}
    </div>
  )
}

// ---------- Live ----------

interface LiveGame {
  id: number
  orderNo: string
  honoreeName: string
  companyName: string | null
  people: number
  stopIndex: number
  step: string
  lastActivityAt: string
  startedAt: string | null
  pausedAt: string | null
  totalStops: number
  stallName: string
  usingBackup: boolean
}

export function LivePage() {
  const [games, setGames] = useState<LiveGame[] | null>(null)
  const [at, setAt] = useState(Date.now())
  useEffect(() => {
    let alive = true
    const load = () =>
      api<{ games: LiveGame[] }>('/live')
        .then((r) => {
          if (!alive) return
          setGames(r.games)
          setAt(Date.now())
        })
        .catch(() => alive && setGames((g) => g ?? []))
    load()
    const t = setInterval(load, 15_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return (
    <section className="list">
      <div className="bar">
        <h1>משחקים פעילים</h1>
        <span className="muted small">מתרענן כל 15 שניות</span>
      </div>
      {!games ? (
        <p className="muted">טוען…</p>
      ) : games.length === 0 ? (
        <p className="muted">אין משחקים פעילים כרגע</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>הזמנה</th>
              <th>חוגג/ת</th>
              <th>תחנה</th>
              <th>שלב</th>
              <th>דוכן</th>
              <th>פעילות אחרונה</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id} onClick={() => go(`/orders/${g.id}`)}>
                <td dir="ltr">{g.orderNo}</td>
                <td>{g.companyName || g.honoreeName}</td>
                <td>
                  {g.stopIndex + 1} / {g.totalStops}
                </td>
                <td>
                  {STEP_LABELS[g.step] ?? g.step}
                  {g.pausedAt && ' (בהפסקה)'}
                </td>
                <td>
                  {g.stallName}
                  {g.usingBackup && ' (גיבוי)'}
                </td>
                <td title={when(g.lastActivityAt)}>{ago(g.lastActivityAt, at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
