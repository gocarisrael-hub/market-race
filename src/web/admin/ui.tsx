// Shared admin building blocks: hash router, list loading, a generic list + edit page, small inputs.
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import type {
  Decor,
  Form,
  MarketHours,
  OccasionRecipients,
  Palette,
  Question,
  Recipient,
  RecipientLabels,
  RiddleTemplates,
  RouteStop,
  ThemeStyle,
} from '../../server/domain/types.ts'
import { ApiError, api, type Issue } from './api.ts'

// ---------- Row types (as the API returns them) ----------

export interface Market {
  id: number
  name: string
  hours: MarketHours
  active: boolean
}
export interface Stall {
  id: number
  marketId: number
  name: string
  locationHint: string
  phone: string
  active: boolean
  closedOn: string | null
  closedNote: string
  closedToday: boolean
}
export interface Tasting {
  id: number
  stallId: number
  name: string
  teaser: string
  teaserIcon: string | null
  allergens: string[]
  diets: string[]
  feeAgorot: number
  active: boolean
}
export interface Riddle {
  id: number
  stallId: number
  title: string
  answer: string
  accepted: string[]
  hint: string
  templates: RiddleTemplates
  afterText: string
  active: boolean
}
export interface QuestionSet {
  id: number
  name: string
  questions: Question[]
}
export interface Occasion {
  id: number
  key: string
  label: string
  audience: 'private' | 'company'
  questionSetId: number | null
  forms: Form[]
  /** Who a private game can be for, each with its question set (null: questionSetId). */
  recipients: OccasionRecipients
  /** The occasion's own name for a recipient on the order (e.g. "לילדה"); empty: the default. */
  recipientLabels?: RecipientLabels
  playersFeminine: boolean
  decor: Decor
  sort: number
  active: boolean
}
export interface Route {
  id: number
  marketId: number
  name: string
  stops: RouteStop[]
  active: boolean
}
export interface PaletteRow {
  id: number
  name: string
  palette: Palette
  themeIds: number[]
  sort: number
  active: boolean
}
export const DECOR_LABELS: Record<Decor, string> = {
  birthday: 'יום הולדת (בלונים, עוגה, כובע, קונפטי)',
  kids: 'יום הולדת לילדים (בלונים, עוגה, כתרים, כוכבים)',
  love: 'אהבה (לבבות, טבעת, נשיקה, פרחים)',
  anniversary: 'יום נישואים (טבעות, לבבות, הרמת כוסית)',
  family: 'משפחה (בית, משפחה, לב)',
  friends: 'חברים וקבוצות (כיף, דגל, כוכבים)',
  company: 'חברה (תיק, טיל, קפה)',
  generic: 'כללי (כוכבים, נצנצים)',
}
export interface Theme {
  id: number
  /** Stable key of a seeded style (read only); null for the owner's own. */
  key?: string | null
  name: string
  marketId: number
  mapFile: string
  palette: Palette
  pins: Record<string, { x: number; y: number }>
  /** Fonts, treatment, illustrations and fixed colors. */
  style: ThemeStyle
  /** The occasions and recipients it is offered for; empty: every one. */
  occasionKeys: string[]
  recipients: Recipient[]
  sort: number
  active: boolean
}

export const FORM_LABELS: Record<Form, string> = {
  she: 'היא',
  he: 'הוא',
  couple: 'זוג',
  group: 'קבוצה',
  company: 'חברה',
}
export const RECIPIENT_LABELS: Record<Recipient, string> = {
  she: 'למישהי (היא)',
  he: 'למישהו (הוא)',
  couple: 'לזוג',
  group: 'לקבוצה',
  family: 'למשפחה',
}
export const DIET_LABELS: Record<string, string> = {
  vegan: 'טבעוני',
  vegetarian: 'צמחוני',
  gluten_free: 'ללא גלוטן',
}

// ---------- Router ----------

export interface Loc {
  section: string
  id: string | null
  query: URLSearchParams
}

function parseHash(hash: string): Loc {
  const [p, q = ''] = hash.replace(/^#\/?/, '').split('?')
  const [section = '', id = null] = p.split('/')
  return { section, id: id || null, query: new URLSearchParams(q) }
}

export function useLoc(): Loc {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const f = () => setHash(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return parseHash(hash)
}

export function go(path: string) {
  location.hash = path
}

// ---------- Data ----------

export function useList<T>(path: string) {
  const [items, setItems] = useState<T[] | null>(null)
  const reload = useCallback(async () => {
    const r = await api<{ items: T[] }>(path)
    setItems(r.items)
  }, [path])
  useEffect(() => {
    reload().catch(() => setItems([]))
  }, [reload])
  return { items, reload }
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'הפריט בשימוש ואי אפשר למחוק אותו. אפשר לסמן אותו כלא פעיל.'
    if (e.status === 401) return 'פג תוקף הכניסה, יש להתחבר מחדש'
    if (e.issues.length) return 'יש שגיאות בטופס'
    return `שגיאה: ${e.message}`
  }
  return 'שגיאה'
}

export function Issues({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null
  return (
    <ul className="error issues">
      {issues.map((i) => (
        <li key={`${i.path}:${i.message}`}>
          {i.path && <code>{i.path}</code>} {i.message}
        </li>
      ))}
    </ul>
  )
}

// ---------- Generic list + edit page ----------

export interface EditorProps<T> {
  value: Partial<T>
  set: (patch: Partial<T>) => void
  isNew: boolean
  issues: Issue[]
}

interface CrudProps<T extends { id: number }> {
  section: string
  title: string
  path: string
  columns: { label: string; render: (row: T, reload: () => Promise<void>) => ReactNode }[]
  blank: () => Partial<T>
  Editor: (p: EditorProps<T>) => ReactNode
  toBody?: (v: Partial<T>) => unknown
  newLabel?: string
}

export function CrudPage<T extends { id: number }>(props: CrudProps<T>) {
  const { section, title, path, columns, blank, Editor, toBody = (v) => v } = props
  const loc = useLoc()
  const { items, reload } = useList<T>(path)
  const [draft, setDraft] = useState<Partial<T> | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [status, setStatus] = useState('')
  const isNew = loc.id === 'new'

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the draft only when the selection or data change
  useEffect(() => {
    setIssues([])
    if (!loc.id) return setDraft(null)
    if (isNew) return setDraft(blank())
    const row = items?.find((x) => String(x.id) === loc.id)
    setDraft(row ? structuredClone(row) : null)
  }, [loc.id, items])

  const save = async () => {
    if (!draft) return
    setStatus('')
    setIssues([])
    try {
      const body = toBody(draft)
      const row = isNew
        ? await api<T>(path, { method: 'POST', json: body })
        : await api<T>(`${path}/${loc.id}`, { method: 'PATCH', json: body })
      await reload()
      setStatus('נשמר')
      if (isNew) go(`/${section}/${row.id}`)
    } catch (e) {
      setIssues(e instanceof ApiError ? e.issues : [])
      setStatus(errorText(e))
    }
  }

  const remove = async () => {
    if (!confirm('למחוק לצמיתות?')) return
    try {
      await api(`${path}/${loc.id}`, { method: 'DELETE' })
      await reload()
      go(`/${section}`)
    } catch (e) {
      setStatus(errorText(e))
    }
  }

  return (
    <div className="crud">
      <section className="list">
        <div className="bar">
          <h1>{title}</h1>
          <button type="button" onClick={() => go(`/${section}/new`)}>
            {props.newLabel ?? 'חדש'}
          </button>
        </div>
        {items === null ? (
          <p className="muted">טוען…</p>
        ) : items.length === 0 ? (
          <p className="muted">אין עדיין פריטים</p>
        ) : (
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  className={String(row.id) === loc.id ? 'selected' : ''}
                  onClick={() => go(`/${section}/${row.id}`)}
                >
                  {columns.map((c) => (
                    <td key={c.label}>{c.render(row, reload)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {draft && (
        <form
          className="editor"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <h2>{isNew ? 'חדש' : `עריכה #${loc.id}`}</h2>
          <Editor
            value={draft}
            set={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            isNew={isNew}
            issues={issues}
          />
          <Issues issues={issues} />
          <div className="actions">
            <button type="submit">שמירה</button>
            {!isNew && (
              <button type="button" className="danger" onClick={remove}>
                מחיקה
              </button>
            )}
            <button type="button" onClick={() => go(`/${section}`)}>
              סגירה
            </button>
            {status && <span className={status === 'נשמר' ? 'ok' : 'error'}>{status}</span>}
          </div>
        </form>
      )}
    </div>
  )
}

// ---------- Inputs ----------

export function Text(p: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  dir?: 'ltr' | 'rtl'
  required?: boolean
  multiline?: boolean
  placeholder?: string
}) {
  return (
    <label>
      {p.label}
      {p.multiline ? (
        <textarea
          value={p.value ?? ''}
          onChange={(e) => p.onChange(e.target.value)}
          dir={p.dir}
          rows={3}
          placeholder={p.placeholder}
        />
      ) : (
        <input
          value={p.value ?? ''}
          onChange={(e) => p.onChange(e.target.value)}
          dir={p.dir}
          required={p.required}
          placeholder={p.placeholder}
        />
      )}
    </label>
  )
}

export function NumberInput(p: { label: string; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <label>
      {p.label}
      <input
        type="number"
        step={1}
        value={p.value ?? 0}
        onChange={(e) => p.onChange(Number.parseInt(e.target.value || '0', 10))}
        dir="ltr"
      />
    </label>
  )
}

export function Check(p: { label: string; checked: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      {p.label}
    </label>
  )
}

export function Select<V extends string | number>(p: {
  label: string
  value: V | null | undefined
  options: { value: V; label: string }[]
  onChange: (v: V) => void
  disabled?: boolean
  placeholder?: string
}) {
  const numeric = typeof p.options[0]?.value === 'number'
  return (
    <label>
      {p.label}
      <select
        value={p.value == null ? '' : String(p.value)}
        disabled={p.disabled}
        onChange={(e) => p.onChange((numeric ? Number(e.target.value) : e.target.value) as V)}
      >
        <option value="">{p.placeholder ?? 'בחרו…'}</option>
        {p.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Shekels with decimals in the UI, agorot (integer) in the data. */
export function MoneyInput(p: { label: string; agorot: number | undefined; onChange: (a: number) => void }) {
  const [text, setText] = useState(((p.agorot ?? 0) / 100).toFixed(2))
  useEffect(() => {
    const cur = Math.round(Number.parseFloat(text || '0') * 100)
    if (cur !== (p.agorot ?? 0)) setText(((p.agorot ?? 0) / 100).toFixed(2))
  }, [p.agorot, text])
  return (
    <label>
      {p.label}
      <span className="money">
        <input
          inputMode="decimal"
          value={text}
          dir="ltr"
          onChange={(e) => {
            const v = e.target.value.replace(',', '.')
            if (!/^\d*(\.\d{0,2})?$/.test(v)) return
            setText(v)
            p.onChange(Math.round(Number.parseFloat(v || '0') * 100))
          }}
        />
        ₪
      </span>
    </label>
  )
}

export function shekels(agorot: number): string {
  return `₪${(agorot / 100).toFixed(2)}`
}

export function mapUrl(mapFile: string): string {
  return mapFile.startsWith('builtin:') ? `/static/maps/${mapFile.slice(8)}` : `/uploads/${mapFile}`
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
