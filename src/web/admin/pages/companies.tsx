// Companies: leads from the site, notes and status, and a quote (company order) from a lead.
import { useEffect, useState } from 'react'
import type { OrderStatus } from '../../../server/domain/types.ts'
import { api } from '../api.ts'
import {
  errorText,
  go,
  MoneyInput,
  NumberInput,
  type Occasion,
  type Route,
  Select,
  Text,
  type Theme,
  useList,
  useLoc,
} from '../ui.tsx'
import { STATUS_LABELS, when } from './orders.tsx'

type LeadStatus = 'new' | 'quoted' | 'won' | 'lost'
const LEAD_LABELS: Record<LeadStatus, string> = {
  new: 'חדש',
  quoted: 'נשלחה הצעה',
  won: 'נסגר',
  lost: 'לא נסגר',
}

interface Lead {
  id: number
  companyName: string
  contactName: string
  phone: string
  email: string
  occasionKey: string | null
  people: number | null
  preferredDate: string
  message: string
  status: LeadStatus
  notes: string
  orderId: number | null
  createdAt: string
  order: { orderNo: string; status: OrderStatus; paid: boolean } | null
}

export function CompaniesPage() {
  const loc = useLoc()
  const [filter, setFilter] = useState('')
  const { items, reload } = useList<Lead>(`/leads${filter ? `?status=${filter}` : ''}`)
  const occasions = useList<Occasion>('/catalog/occasions').items ?? []
  const selected = items?.find((l) => String(l.id) === loc.id) ?? null
  return (
    <div className="crud">
      <section className="list">
        <div className="bar">
          <h1>חברות: לידים והצעות</h1>
          <Select
            label="סטטוס"
            value={filter}
            placeholder="הכול"
            options={Object.entries(LEAD_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={setFilter}
          />
        </div>
        {items === null ? (
          <p className="muted">טוען…</p>
        ) : items.length === 0 ? (
          <p className="muted">אין לידים</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>חברה</th>
                <th>איש קשר</th>
                <th>טלפון</th>
                <th>התקבל</th>
                <th>סטטוס</th>
                <th>הזמנה</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr
                  key={l.id}
                  className={String(l.id) === loc.id ? 'selected' : ''}
                  onClick={() => go(`/companies/${l.id}`)}
                >
                  <td>{l.companyName || '—'}</td>
                  <td>{l.contactName || '—'}</td>
                  <td dir="ltr">{l.phone}</td>
                  <td>{when(l.createdAt)}</td>
                  <td>{LEAD_LABELS[l.status]}</td>
                  <td>
                    {l.order && (
                      <>
                        <span dir="ltr">{l.order.orderNo}</span> {STATUS_LABELS[l.order.status]}
                        {l.order.paid && ', שולם'}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {selected && <LeadEditor key={selected.id} lead={selected} reload={reload} occasions={occasions} />}
    </div>
  )
}

function LeadEditor({
  lead,
  reload,
  occasions,
}: {
  lead: Lead
  reload: () => Promise<void>
  occasions: Occasion[]
}) {
  const [status, setStatus] = useState<LeadStatus>(lead.status)
  const [notes, setNotes] = useState(lead.notes)
  const [msg, setMsg] = useState('')
  const themes = (useList<Theme>('/catalog/themes').items ?? []).filter((t) => t.active)
  const routes = (useList<Route>('/catalog/routes').items ?? []).filter((r) => r.active)
  const companyOccasions = occasions.filter((o) => o.audience === 'company' && o.active)
  const occLabel = (k: string) => occasions.find((o) => o.key === k)?.label ?? k
  const [q, setQ] = useState({
    occasionKey: lead.occasionKey ?? '',
    people: lead.people ?? 10,
    priceAgorot: 0,
    themeId: null as number | null,
    routeId: null as number | null,
  })
  const theme = themes.find((t) => t.id === q.themeId)
  const marketRoutes = routes.filter((r) => !theme || r.marketId === theme.marketId)
  useEffect(() => {
    if (theme && !marketRoutes.some((r) => r.id === q.routeId))
      setQ((x) => ({ ...x, routeId: marketRoutes[0]?.id ?? null }))
  }, [theme, marketRoutes, q.routeId])

  const save = async () => {
    try {
      await api(`/leads/${lead.id}`, { method: 'PATCH', json: { status, notes } })
      await reload()
      setMsg('נשמר')
    } catch (e) {
      setMsg(errorText(e))
    }
  }
  const quote = async () => {
    setMsg('')
    try {
      const r = await api<{ order: { id: number } }>(`/leads/${lead.id}/quote`, { method: 'POST', json: q })
      await reload()
      go(`/orders/${r.order.id}`)
    } catch (e) {
      setMsg(errorText(e))
    }
  }
  return (
    <div className="editor">
      <h2>{lead.companyName || lead.contactName || lead.phone}</h2>
      <dl className="facts">
        <dt>איש קשר</dt>
        <dd>{lead.contactName || '—'}</dd>
        <dt>טלפון</dt>
        <dd dir="ltr">{lead.phone}</dd>
        <dt>אימייל</dt>
        <dd dir="ltr">{lead.email || '—'}</dd>
        {/* Older leads were sent with an occasion, a group size and a date. */}
        {lead.occasionKey && (
          <>
            <dt>אירוע</dt>
            <dd>{occLabel(lead.occasionKey)}</dd>
          </>
        )}
        {lead.people != null && (
          <>
            <dt>אנשים</dt>
            <dd>{lead.people}</dd>
          </>
        )}
        {lead.preferredDate && (
          <>
            <dt>תאריך מועדף</dt>
            <dd>{lead.preferredDate}</dd>
          </>
        )}
        <dt>הודעה</dt>
        <dd className="pre">{lead.message || '—'}</dd>
      </dl>
      <Select
        label="סטטוס הליד"
        value={status}
        options={Object.entries(LEAD_LABELS).map(([value, label]) => ({ value: value as LeadStatus, label }))}
        onChange={setStatus}
      />
      <Text label="הערות" value={notes} onChange={setNotes} multiline />
      <div className="actions">
        <button type="button" onClick={save}>
          שמירה
        </button>
        {msg && <span className={msg === 'נשמר' ? 'ok' : 'error'}>{msg}</span>}
      </div>
      {lead.orderId ? (
        <p>
          <a href={`#/orders/${lead.orderId}`}>להזמנת החברה {lead.order?.orderNo}</a>
        </p>
      ) : (
        <fieldset>
          <legend>הצעת מחיר</legend>
          <Select
            label="סוג אירוע"
            value={q.occasionKey}
            options={companyOccasions.map((o) => ({ value: o.key, label: o.label }))}
            onChange={(occasionKey) => setQ({ ...q, occasionKey })}
          />
          <div className="row">
            <NumberInput label="אנשים" value={q.people} onChange={(people) => setQ({ ...q, people })} />
            <MoneyInput
              label="מחיר כולל"
              agorot={q.priceAgorot}
              onChange={(priceAgorot) => setQ({ ...q, priceAgorot })}
            />
          </div>
          <div className="row">
            <Select
              label="עיצוב"
              value={q.themeId}
              options={themes.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(themeId) => setQ({ ...q, themeId })}
            />
            <Select
              label="מסלול"
              value={q.routeId}
              options={marketRoutes.map((r) => ({ value: r.id, label: r.name }))}
              onChange={(routeId) => setQ({ ...q, routeId })}
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={!q.occasionKey || !q.themeId || !q.routeId || !(q.priceAgorot > 0)}
              onClick={quote}
            >
              יצירת הצעה
            </button>
          </div>
        </fieldset>
      )}
    </div>
  )
}
