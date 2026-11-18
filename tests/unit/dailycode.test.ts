import { describe, expect, it } from 'vitest'
import { dailyCode } from '../../src/server/domain/dailycode.ts'
import { addYears, israelDate } from '../../src/server/domain/dates.ts'

describe('dailyCode', () => {
  it('is 4 digits, stable per day and secret, and changes between days', () => {
    const a = dailyCode('secret', '2026-11-18')
    expect(a).toMatch(/^\d{4}$/)
    expect(dailyCode('secret', '2026-11-18')).toBe(a)
    const week = ['19', '20', '21', '22', '23', '24'].map((d) => dailyCode('secret', `2026-11-${d}`))
    expect(new Set([a, ...week]).size).toBeGreaterThan(4)
    expect(dailyCode('other', '2026-11-18')).not.toBe(a)
  })
})

describe('dates', () => {
  it('uses Israel time for the market day', () => {
    // 23:30 UTC on 17 Nov is already 18 Nov in Israel (UTC+2).
    expect(israelDate(new Date('2026-11-17T23:30:00Z'))).toBe('2026-11-18')
  })
  it('adds a year, clamping 29 Feb', () => {
    expect(addYears('2026-11-18', 1)).toBe('2027-11-18')
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28')
  })
})
