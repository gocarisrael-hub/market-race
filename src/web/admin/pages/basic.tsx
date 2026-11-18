// Markets (with the printable daily-code sheet), stalls, tastings, occasions, settings.
import { useEffect, useState } from 'react'
import { ALLERGENS, DECORS, DIETS, FORMS, type Form, type MarketHours } from '../../../server/domain/types.ts'
import { ApiError, api, type Issue } from '../api.ts'
import {
  Check,
  CrudPage,
  DECOR_LABELS,
  DIET_LABELS,
  type EditorProps,
  errorText,
  FORM_LABELS,
  Issues,
  type Market,
  MoneyInput,
  NumberInput,
  type Occasion,
  type QuestionSet,
  Select,
  type Stall,
  shekels,
  type Tasting,
  Text,
  useList,
  useLoc,
} from '../ui.tsx'

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
type DayKey = keyof MarketHours

function useNames<T extends { id: number; name: string }>(path: string) {
  const { items } = useList<T>(path)
  return { items: items ?? [], name: (id: number) => items?.find((x) => x.id === id)?.name ?? `#${id}` }
}

function activeLabel(a: boolean) {
  return a ? 'פעיל' : 'לא פעיל'
}

// ---------- Markets ----------

function MarketEditor({ value, set, isNew }: EditorProps<Market>) {
  const hours = value.hours ?? {}
  const setDay = (d: DayKey, v: { open: string; close: string } | undefined) => {
    const next = { ...hours }
    if (v) next[d] = v
    else delete next[d]
    set({ hours: next })
  }
  return (
    <>
      <Text label="שם" value={value.name} onChange={(name) => set({ name })} required />
      <Check label="פעיל" checked={value.active} onChange={(active) => set({ active })} />
      <fieldset>
        <legend>שעות פתיחה</legend>
        <table className="hours">
          <tbody>
            {WEEKDAYS.map((label, i) => {
              const d = String(i) as DayKey
              const h = hours[d]
              return (
                <tr key={d}>
                  <td>
                    <Check
                      label={label}
                      checked={!!h}
                      onChange={(on) => setDay(d, on ? { open: '08:00', close: '18:00' } : undefined)}
                    />
                  </td>
                  <td>
                    {h && (
                      <>
                        <input
                          type="time"
                          aria-label={`פתיחה ${label}`}
                          value={h.open}
                          onChange={(e) => setDay(d, { ...h, open: e.target.value })}
                        />{' '}
                        עד{' '}
                        <input
                          type="time"
                          aria-label={`סגירה ${label}`}
                          value={h.close}
                          onChange={(e) => setDay(d, { ...h, close: e.target.value })}
                        />
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </fieldset>
      {!isNew && (
        <p>
          <a href={`#/codes/${value.id}`}>דף קודים יומיים לדוכנים (להדפסה)</a>
        </p>
      )}
    </>
  )
}

export function MarketsPage() {
  return (
    <CrudPage<Market>
      section="markets"
      title="שווקים"
      path="/catalog/markets"
      newLabel="שוק חדש"
      blank={() => ({ name: '', hours: {}, active: true })}
      columns={[
        { label: 'שם', render: (m) => m.name },
        { label: 'מצב', render: (m) => activeLabel(m.active) },
      ]}
      Editor={MarketEditor}
    />
  )
}

// Printable sheet for vendors: the code of each day of a month. Rules text comes from settings.vendor_rules.
export function CodesPage() {
  const loc = useLoc()
  const now = new Date()
  const defMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth] = useState(loc.query.get('month') ?? defMonth)
  const [data, setData] = useState<{
    market: { name: string }
    days: { date: string; weekday: number; code: string }[]
  } | null>(null)
  const [rules, setRules] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setError('')
    api<typeof data>(`/catalog/markets/${loc.id}/codes?month=${month}`)
      .then(setData)
      .catch((e) => setError(errorText(e)))
  }, [loc.id, month])
  useEffect(() => {
    api<{ items: { key: string; value: unknown }[] }>('/catalog/settings').then((r) => {
      const v = r.items.find((s) => s.key === 'vendor_rules')?.value
      setRules(typeof v === 'string' ? v : '')
    })
  }, [])
  return (
    <div className="codes">
      <div className="bar no-print">
        <a href="#/markets">חזרה לשווקים</a>
        <label>
          חודש
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button type="button" onClick={() => window.print()}>
          הדפסה
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <h1>
            קודים יומיים: {data.market.name}, {month}
          </h1>
          {rules && <p className="rules">{rules}</p>}
          <table>
            <thead>
              <tr>
                <th>תאריך</th>
                <th>יום</th>
                <th>קוד</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date}>
                  <td dir="ltr">{d.date.split('-').reverse().join('.')}</td>
                  <td>{WEEKDAYS[d.weekday]}</td>
                  <td className="code" dir="ltr">
                    {d.code}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ---------- Stalls ----------

function StallEditor({ value, set, isNew }: EditorProps<Stall>) {
  const mk = useNames<Market>('/catalog/markets')
  return (
    <>
      <Select
        label="שוק"
        value={value.marketId}
        disabled={!isNew}
        options={mk.items.map((m) => ({ value: m.id, label: m.name }))}
        onChange={(marketId) => set({ marketId })}
      />
      <Text label="שם" value={value.name} onChange={(name) => set({ name })} required />
      <Text
        label="איך מוצאים"
        value={value.locationHint}
        onChange={(locationHint) => set({ locationHint })}
      />
      <Text label="טלפון" value={value.phone} onChange={(phone) => set({ phone })} dir="ltr" />
      <Check label="פעיל" checked={value.active} onChange={(active) => set({ active })} />
      <Check label="סגור היום" checked={value.closedToday} onChange={(closedToday) => set({ closedToday })} />
      <Text label="הערת סגירה" value={value.closedNote} onChange={(closedNote) => set({ closedNote })} />
    </>
  )
}

export function StallsPage() {
  const mk = useNames<Market>('/catalog/markets')
  return (
    <CrudPage<Stall>
      section="stalls"
      title="דוכנים"
      path="/catalog/stalls"
      newLabel="דוכן חדש"
      blank={() => ({ marketId: mk.items[0]?.id, name: '', locationHint: '', phone: '', active: true })}
      columns={[
        { label: 'שם', render: (s) => s.name },
        { label: 'שוק', render: (s) => mk.name(s.marketId) },
        { label: 'מצב', render: (s) => activeLabel(s.active) },
        {
          label: 'סגור היום',
          render: (s, reload) => (
            <input
              type="checkbox"
              aria-label={`סגור היום: ${s.name}`}
              checked={s.closedToday}
              onClick={(e) => e.stopPropagation()}
              onChange={async (e) => {
                await api(`/catalog/stalls/${s.id}`, {
                  method: 'PATCH',
                  json: { closedToday: e.target.checked },
                })
                await reload()
              }}
            />
          ),
        },
      ]}
      Editor={StallEditor}
    />
  )
}

// ---------- Tastings ----------

function toggle<T>(list: T[] | undefined, v: T, on: boolean): T[] {
  const s = new Set(list ?? [])
  if (on) s.add(v)
  else s.delete(v)
  return [...s]
}

function useStallOptions() {
  const mk = useNames<Market>('/catalog/markets')
  const st = useNames<Stall>('/catalog/stalls')
  return {
    stalls: st.items,
    name: st.name,
    options: st.items.map((s) => ({ value: s.id, label: `${s.name} (${mk.name(s.marketId)})` })),
  }
}

function TastingEditor({ value, set, isNew }: EditorProps<Tasting>) {
  const st = useStallOptions()
  const icons = useList<string>('/catalog/icons').items ?? []
  return (
    <>
      <Select
        label="דוכן"
        value={value.stallId}
        disabled={!isNew}
        options={st.options}
        onChange={(stallId) => set({ stallId })}
      />
      <Text label="שם" value={value.name} onChange={(name) => set({ name })} required />
      <Text label="תיאור לקונים" value={value.teaser} onChange={(teaser) => set({ teaser })} />
      <p className="muted">מוצג לקונים לפני הרכישה. לא לכתוב את שם הדוכן או משהו שמסגיר חידה.</p>
      <div className="row">
        <Select
          label="איור לתיאור"
          value={value.teaserIcon ?? ''}
          placeholder="בלי איור"
          options={icons.map((i) => ({ value: i, label: i }))}
          onChange={(v) => set({ teaserIcon: v || null })}
        />
        {value.teaserIcon && (
          <img src={`/static/icons/${value.teaserIcon}.png`} alt="" width={48} height={48} />
        )}
      </div>
      <fieldset>
        <legend>אלרגנים</legend>
        {ALLERGENS.map((a) => (
          <Check
            key={a}
            label={a}
            checked={value.allergens?.includes(a)}
            onChange={(on) => set({ allergens: toggle(value.allergens, a, on) })}
          />
        ))}
      </fieldset>
      <fieldset>
        <legend>מתאים ל</legend>
        {DIETS.map((d) => (
          <Check
            key={d}
            label={DIET_LABELS[d]}
            checked={value.diets?.includes(d)}
            onChange={(on) => set({ diets: toggle(value.diets, d, on) })}
          />
        ))}
      </fieldset>
      <MoneyInput
        label="תשלום לדוכן למנה"
        agorot={value.feeAgorot}
        onChange={(feeAgorot) => set({ feeAgorot })}
      />
      <Check label="פעיל" checked={value.active} onChange={(active) => set({ active })} />
    </>
  )
}

export function TastingsPage() {
  const st = useStallOptions()
  return (
    <CrudPage<Tasting>
      section="tastings"
      title="טעימות"
      path="/catalog/tastings"
      newLabel="טעימה חדשה"
      blank={() => ({
        stallId: st.stalls[0]?.id,
        name: '',
        teaser: '',
        teaserIcon: null,
        allergens: [],
        diets: [],
        feeAgorot: 0,
        active: true,
      })}
      columns={[
        { label: 'שם', render: (t) => t.name },
        { label: 'תיאור לקונים', render: (t) => t.teaser || <span className="muted">חסר</span> },
        { label: 'דוכן', render: (t) => st.name(t.stallId) },
        { label: 'תשלום', render: (t) => shekels(t.feeAgorot) },
        { label: 'מצב', render: (t) => activeLabel(t.active) },
      ]}
      Editor={TastingEditor}
    />
  )
}

// ---------- Occasions ----------

function OccasionEditor({ value, set }: EditorProps<Occasion>) {
  const qs = useList<QuestionSet>('/catalog/question-sets')
  return (
    <>
      <Text label="מפתח (באנגלית)" value={value.key} onChange={(key) => set({ key })} dir="ltr" required />
      <Text label="שם" value={value.label} onChange={(label) => set({ label })} required />
      <Select
        label="קהל"
        value={value.audience}
        options={[
          { value: 'private', label: 'פרטי' },
          { value: 'company', label: 'חברה' },
        ]}
        onChange={(audience) => set({ audience })}
      />
      <Select
        label="שאלון"
        value={value.questionSetId}
        placeholder="ללא"
        options={(qs.items ?? []).map((q) => ({ value: q.id, label: q.name }))}
        onChange={(v) => set({ questionSetId: v || null })}
      />
      <fieldset>
        <legend>צורות פנייה</legend>
        {FORMS.map((f) => (
          <Check
            key={f}
            label={FORM_LABELS[f]}
            checked={value.forms?.includes(f)}
            onChange={(on) => set({ forms: toggle<Form>(value.forms, f, on) })}
          />
        ))}
      </fieldset>
      <Select
        label="קישוטים (ציורים סביב המשחק והאתר)"
        value={value.decor ?? 'generic'}
        options={DECORS.map((d) => ({ value: d, label: DECOR_LABELS[d] }))}
        onChange={(decor) => set({ decor })}
      />
      <NumberInput label="סדר" value={value.sort} onChange={(sort) => set({ sort })} />
      <Check label="פעיל" checked={value.active} onChange={(active) => set({ active })} />
    </>
  )
}

export function OccasionsPage() {
  return (
    <CrudPage<Occasion>
      section="occasions"
      title="אירועים"
      path="/catalog/occasions"
      newLabel="אירוע חדש"
      blank={() => ({
        key: '',
        label: '',
        audience: 'private',
        questionSetId: null,
        forms: ['she'],
        decor: 'generic',
        sort: 0,
        active: true,
      })}
      columns={[
        { label: 'שם', render: (o) => o.label },
        { label: 'מפתח', render: (o) => o.key },
        { label: 'קישוטים', render: (o) => DECOR_LABELS[o.decor]?.split(' (')[0] ?? o.decor },
        { label: 'קהל', render: (o) => (o.audience === 'company' ? 'חברה' : 'פרטי') },
        { label: 'מצב', render: (o) => activeLabel(o.active) },
      ]}
      Editor={OccasionEditor}
    />
  )
}

// ---------- Settings ----------

export function SettingsPage() {
  const loc = useLoc()
  const { items, reload } = useList<{ key: string; value: unknown }>('/catalog/settings')
  const [key, setKey] = useState('')
  const [text, setText] = useState('')
  const [issues, setIssues] = useState<Issue[]>([])
  const [status, setStatus] = useState('')
  const isNew = loc.id === 'new'
  const selected = loc.id ? decodeURIComponent(loc.id) : null

  useEffect(() => {
    setStatus('')
    setIssues([])
    if (isNew) {
      setKey('')
      setText('""')
    } else if (selected) {
      const row = items?.find((s) => s.key === selected)
      setKey(selected)
      setText(row ? JSON.stringify(row.value, null, 2) : '')
    }
  }, [isNew, selected, items])

  let jsonError = ''
  try {
    JSON.parse(text)
  } catch {
    jsonError = 'JSON לא תקין'
  }

  const save = async () => {
    if (jsonError) return
    setIssues([])
    try {
      await api(`/catalog/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        json: { value: JSON.parse(text) },
      })
      await reload()
      setStatus('נשמר')
      if (isNew) location.hash = `/settings/${encodeURIComponent(key)}`
    } catch (e) {
      setIssues(e instanceof ApiError ? e.issues : [])
      setStatus(errorText(e))
    }
  }

  const remove = async () => {
    if (!confirm('למחוק לצמיתות?')) return
    await api(`/catalog/settings/${encodeURIComponent(key)}`, { method: 'DELETE' })
    await reload()
    location.hash = '/settings'
  }

  return (
    <div className="crud">
      <section className="list">
        <div className="bar">
          <h1>הגדרות</h1>
          <button type="button" onClick={() => (location.hash = '/settings/new')}>
            הגדרה חדשה
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>מפתח</th>
              <th>ערך</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((s) => (
              <tr
                key={s.key}
                className={s.key === selected ? 'selected' : ''}
                onClick={() => (location.hash = `/settings/${encodeURIComponent(s.key)}`)}
              >
                <td dir="ltr">{s.key}</td>
                <td className="truncate" dir="ltr">
                  {JSON.stringify(s.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {(isNew || selected) && (
        <form
          className="editor"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {isNew ? (
            <Text label="מפתח" value={key} onChange={setKey} dir="ltr" required />
          ) : (
            <h2 dir="ltr">{key}</h2>
          )}
          <label>
            ערך (JSON)
            <textarea value={text} onChange={(e) => setText(e.target.value)} dir="ltr" rows={12} />
          </label>
          {jsonError && <p className="error">{jsonError}</p>}
          <Issues issues={issues} />
          <div className="actions">
            <button type="submit" disabled={!!jsonError}>
              שמירה
            </button>
            {!isNew && (
              <button type="button" className="danger" onClick={remove}>
                מחיקה
              </button>
            )}
            {status && <span className={status === 'נשמר' ? 'ok' : 'error'}>{status}</span>}
          </div>
        </form>
      )}
    </div>
  )
}
