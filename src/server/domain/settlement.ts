// Monthly settlement per stall. Pure: the caller loads the month's redemptions.
// A redemption freezes the fee per portion and the number of portions: total = fee × portions.
// A mixed stop (the regular tasting and an alternative for some of the group) has a row per
// tasting, each with its own fee; it counts as one redemption (a visit) of the stall.

export interface SettlementRow {
  redemptionId: number
  redeemedAt: Date
  orderId: number
  /** The stop: rows of one order and stop are one visit. Absent: each row is a visit. */
  stopIndex?: number
  orderNo: string
  stallId: number
  stallName: string
  tastingName: string
  portions: number
  feeAgorot: number
  usedBackup: boolean
}

export type SettlementLine = SettlementRow & { date: string; totalAgorot: number }

export interface StallSettlement {
  stallId: number
  stallName: string
  /** Visits: an order's stop counts once, whatever tastings it served. */
  redemptions: number
  portions: number
  totalAgorot: number
  /** Portions per tasting and fee, so a mixed stop is paid what each tasting costs. */
  byTasting: { tastingName: string; feeAgorot: number; portions: number; totalAgorot: number }[]
  rows: SettlementLine[]
}

export interface Settlement {
  month: string
  stalls: StallSettlement[]
  totals: { redemptions: number; portions: number; totalAgorot: number }
}

/** Groups a month's redemptions per stall. `dateOf` renders the redemption day (Israel time). */
export function summarize(month: string, rows: SettlementRow[], dateOf: (d: Date) => string): Settlement {
  const by = new Map<number, StallSettlement>()
  const visits = new Map<number, Set<string>>()
  const sorted = [...rows].sort((a, b) => a.redeemedAt.getTime() - b.redeemedAt.getTime())
  for (const r of sorted) {
    let s = by.get(r.stallId)
    if (!s) {
      s = {
        stallId: r.stallId,
        stallName: r.stallName,
        redemptions: 0,
        portions: 0,
        totalAgorot: 0,
        byTasting: [],
        rows: [],
      }
      by.set(r.stallId, s)
      visits.set(r.stallId, new Set())
    }
    const total = r.feeAgorot * r.portions
    const seen = visits.get(r.stallId)!
    const visit = r.stopIndex == null ? `r${r.redemptionId}` : `${r.orderId}:${r.stopIndex}`
    if (!seen.has(visit)) {
      seen.add(visit)
      s.redemptions += 1
    }
    s.portions += r.portions
    s.totalAgorot += total
    const t = s.byTasting.find((x) => x.tastingName === r.tastingName && x.feeAgorot === r.feeAgorot)
    if (t) {
      t.portions += r.portions
      t.totalAgorot += total
    } else
      s.byTasting.push({
        tastingName: r.tastingName,
        feeAgorot: r.feeAgorot,
        portions: r.portions,
        totalAgorot: total,
      })
    s.rows.push({ ...r, date: dateOf(r.redeemedAt), totalAgorot: total })
  }
  const stalls = [...by.values()].sort((a, b) => a.stallName.localeCompare(b.stallName, 'he'))
  return {
    month,
    stalls,
    totals: {
      redemptions: stalls.reduce((n, s) => n + s.redemptions, 0),
      portions: stalls.reduce((n, s) => n + s.portions, 0),
      totalAgorot: stalls.reduce((n, s) => n + s.totalAgorot, 0),
    },
  }
}

const shekels = (agorot: number) => (agorot / 100).toFixed(2)

function cell(v: string | number): string {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CSV_HEADER = ['דוכן', 'תאריך', 'הזמנה', 'טעימה', 'מנות', 'תשלום למנה', 'סה"כ', 'גיבוי']

/** CSV for Excel: UTF-8 with BOM, CRLF. One row per redemption, then a total row per stall. */
export function settlementCsv(s: Settlement): string {
  const lines: (string | number)[][] = [CSV_HEADER]
  for (const st of s.stalls) {
    for (const r of st.rows)
      lines.push([
        st.stallName,
        r.date,
        r.orderNo,
        r.tastingName,
        r.portions,
        shekels(r.feeAgorot),
        shekels(r.totalAgorot),
        r.usedBackup ? 'כן' : '',
      ])
    lines.push([
      `סה"כ ${st.stallName}`,
      '',
      '',
      `${st.redemptions} מימושים`,
      st.portions,
      '',
      shekels(st.totalAgorot),
      '',
    ])
  }
  lines.push([
    'סה"כ החודש',
    s.month,
    '',
    `${s.totals.redemptions} מימושים`,
    s.totals.portions,
    '',
    shekels(s.totals.totalAgorot),
    '',
  ])
  return `﻿${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n`
}
