import { describe, expect, it } from 'vitest'
import { israelDate, israelMidnight, israelMonth, israelMonthRange } from '../../src/server/domain/dates.ts'
import { type SettlementRow, settlementCsv, summarize } from '../../src/server/domain/settlement.ts'

describe('Israel month boundaries', () => {
  it('starts a winter month at 22:00 UTC the day before (UTC+2)', () => {
    const { from, to } = israelMonthRange('2026-01')
    expect(from.toISOString()).toBe('2025-12-31T22:00:00.000Z')
    expect(to.toISOString()).toBe('2026-01-31T22:00:00.000Z')
  })

  it('starts a summer month at 21:00 UTC the day before (UTC+3)', () => {
    const { from, to } = israelMonthRange('2026-07')
    expect(from.toISOString()).toBe('2026-06-30T21:00:00.000Z')
    expect(to.toISOString()).toBe('2026-07-31T21:00:00.000Z')
  })

  it('wraps December into January', () => {
    expect(israelMonthRange('2026-12').to.toISOString()).toBe('2026-12-31T22:00:00.000Z')
  })

  it('handles the DST switch month (late March)', () => {
    // April 1st is already summer time; March 1st is winter time.
    const { from, to } = israelMonthRange('2026-03')
    expect(from.toISOString()).toBe('2026-02-28T22:00:00.000Z')
    expect(to.toISOString()).toBe('2026-03-31T21:00:00.000Z')
    expect(israelMidnight(2026, 3, 31).toISOString()).toBe('2026-03-30T21:00:00.000Z')
  })

  it('puts 23:30 UTC on the last day of a month into the next month in Israel', () => {
    const at = new Date('2026-11-30T23:30:00Z')
    expect(israelMonth(at)).toBe('2026-12')
    expect(israelDate(at)).toBe('2026-12-01')
    const nov = israelMonthRange('2026-11')
    expect(at >= nov.to).toBe(true)
  })

  it('rejects a bad month', () => {
    expect(() => israelMonthRange('2026-13')).toThrow()
    expect(() => israelMonthRange('nope')).toThrow()
  })
})

const row = (over: Partial<SettlementRow>): SettlementRow => ({
  redemptionId: 1,
  redeemedAt: new Date('2026-11-10T10:00:00Z'),
  orderId: 1,
  orderNo: 'MR-AAAAAA',
  stallId: 1,
  stallName: 'המיצים',
  tastingName: 'מיץ תפוזים',
  portions: 4,
  feeAgorot: 800,
  usedBackup: false,
  ...over,
})

describe('settlement summary', () => {
  const rows = [
    row({ redemptionId: 1 }),
    row({ redemptionId: 2, orderNo: 'MR-BBBBBB', portions: 3, redeemedAt: new Date('2026-11-12T10:00:00Z') }),
    row({
      redemptionId: 3,
      stallId: 2,
      stallName: 'בירה, "בסוף"',
      tastingName: 'בירה',
      portions: 2,
      feeAgorot: 1250,
      usedBackup: true,
    }),
  ]
  const s = summarize('2026-11', rows, israelDate)

  it('totals fee × portions per stall', () => {
    const juice = s.stalls.find((x) => x.stallId === 1)!
    expect(juice).toMatchObject({ redemptions: 2, portions: 7, totalAgorot: 7 * 800 })
    expect(juice.rows.map((r) => r.totalAgorot)).toEqual([3200, 2400])
    const beer = s.stalls.find((x) => x.stallId === 2)!
    expect(beer).toMatchObject({ redemptions: 1, portions: 2, totalAgorot: 2500 })
    expect(s.totals).toEqual({ redemptions: 3, portions: 9, totalAgorot: 5600 + 2500 })
  })

  it('writes a CSV Excel reads as Hebrew', () => {
    const csv = settlementCsv(s)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines[0]).toBe('דוכן,תאריך,הזמנה,טעימה,מנות,תשלום למנה,"סה""כ",גיבוי')
    expect(lines).toContain('"בירה, ""בסוף""",2026-11-10,MR-AAAAAA,בירה,2,12.50,25.00,כן')
    expect(lines).toContain('המיצים,2026-11-12,MR-BBBBBB,מיץ תפוזים,3,8.00,24.00,')
    expect(lines).toContain('"סה""כ המיצים",,,2 מימושים,7,,56.00,')
    expect(lines.at(-1)).toBe('"סה""כ החודש",2026-11,,3 מימושים,9,,81.00,')
  })

  it('is empty for a month with nothing', () => {
    const e = summarize('2026-10', [], israelDate)
    expect(e.stalls).toEqual([])
    expect(settlementCsv(e).split('\r\n')).toHaveLength(3)
  })
})
