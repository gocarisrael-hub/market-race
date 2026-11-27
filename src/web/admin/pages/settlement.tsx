// Monthly settlement per stall (Israel-time months), drill-down and CSV export.
import { Fragment, useEffect, useState } from 'react'
import { api } from '../api.ts'
import { errorText, shekels, useLoc } from '../ui.tsx'

interface Line {
  redemptionId: number
  date: string
  orderId: number
  orderNo: string
  tastingName: string
  portions: number
  feeAgorot: number
  totalAgorot: number
  usedBackup: boolean
}
interface StallRow {
  stallId: number
  stallName: string
  redemptions: number
  portions: number
  totalAgorot: number
  /** Portions per tasting (a mixed stop serves two tastings, each at its own fee). */
  byTasting?: { tastingName: string; feeAgorot: number; portions: number; totalAgorot: number }[]
  rows: Line[]
}
interface Data {
  month: string
  stalls: StallRow[]
  totals: { redemptions: number; portions: number; totalAgorot: number }
}

function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7)
}

export function SettlementPage() {
  const loc = useLoc()
  const [month, setMonth] = useState(loc.query.get('month') ?? currentMonth())
  const [data, setData] = useState<Data | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return
    setError('')
    api<Data>(`/settlement?month=${month}`)
      .then(setData)
      .catch((e) => setError(errorText(e)))
  }, [month])
  return (
    <section className="settlement">
      <div className="bar">
        <h1>התחשבנות עם דוכנים</h1>
        <label>
          חודש
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <a className="button" href={`/admin/api/settlement.csv?month=${month}`} download>
          ייצוא ל-CSV
        </a>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <p className="muted">
            חודש {data.month} לפי שעון ישראל. סה"כ = תשלום למנה × מנות, כפי שנקבע ברגע המימוש.
          </p>
          {data.stalls.length === 0 ? (
            <p className="muted">אין מימושים בחודש הזה</p>
          ) : (
            <table className="totals">
              <thead>
                <tr>
                  <th>דוכן</th>
                  <th>מימושים</th>
                  <th>מנות</th>
                  <th>סה"כ לתשלום</th>
                </tr>
              </thead>
              <tbody>
                {data.stalls.map((s) => (
                  <Fragment key={s.stallId}>
                    <tr className="clickable" onClick={() => setOpen(open === s.stallId ? null : s.stallId)}>
                      <td>
                        {open === s.stallId ? '▾' : '▸'} {s.stallName}
                      </td>
                      <td>{s.redemptions}</td>
                      <td>{s.portions}</td>
                      <td>{shekels(s.totalAgorot)}</td>
                    </tr>
                    {open === s.stallId && (
                      <tr className="drill">
                        <td colSpan={4}>
                          {(s.byTasting?.length ?? 0) > 1 && (
                            <p className="muted" data-testid="by-tasting">
                              {s
                                .byTasting!.map(
                                  (t) =>
                                    `${t.portions} × ${t.tastingName} (${shekels(t.feeAgorot)}) = ${shekels(t.totalAgorot)}`,
                                )
                                .join(' · ')}
                            </p>
                          )}
                          <table>
                            <thead>
                              <tr>
                                <th>תאריך</th>
                                <th>הזמנה</th>
                                <th>טעימה</th>
                                <th>מנות</th>
                                <th>למנה</th>
                                <th>סה"כ</th>
                                <th>גיבוי</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.rows.map((r) => (
                                <tr key={r.redemptionId}>
                                  <td dir="ltr">{r.date.split('-').reverse().join('.')}</td>
                                  <td>
                                    <a href={`#/orders/${r.orderId}`} dir="ltr">
                                      {r.orderNo}
                                    </a>
                                  </td>
                                  <td>{r.tastingName}</td>
                                  <td>{r.portions}</td>
                                  <td>{shekels(r.feeAgorot)}</td>
                                  <td>{shekels(r.totalAgorot)}</td>
                                  <td>{r.usedBackup ? 'כן' : ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>סה"כ</th>
                  <th>{data.totals.redemptions}</th>
                  <th>{data.totals.portions}</th>
                  <th>{shekels(data.totals.totalAgorot)}</th>
                </tr>
              </tfoot>
            </table>
          )}
        </>
      )}
    </section>
  )
}
