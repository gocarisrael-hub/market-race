import { describe, expect, it } from 'vitest'
import { createSweeper, type SweepState } from '../../src/server/payments/sweep.ts'
import { normalizeRow } from '../../src/server/payments/tranzila.ts'

function setup(over: Partial<Parameters<typeof createSweeper>[0]> = {}) {
  const st: SweepState = { alerted: {}, alert_queue: [] }
  let saves = 0
  let t = 1_800_000_000_000
  const delivered: string[] = []
  const deps = {
    state: { get: () => st, save: async () => void saves++ },
    listRows: async () => [normalizeRow({ index: 1 }), normalizeRow({ index: 2 })],
    decide: async (tx: { index: string }) =>
      tx.index === '1'
        ? { outcome: 'settled' as const }
        : { outcome: 'rejected' as const, alert: { kind: 'unverified' } },
    deliver: async (items: { index: string }[]) => {
      delivered.push(...items.map((i) => i.index))
      return true as const
    },
    hasRecentUnpaid: async () => false,
    now: () => t,
    ...over,
  }
  const s = createSweeper(deps as Parameters<typeof createSweeper>[0])
  return { s, st, delivered, advance: (ms: number) => (t += ms), saves: () => saves, now: () => t }
}

describe('sweeper', () => {
  it('settles, queues alerts once and delivers them once', async () => {
    const { s, st, delivered, advance } = setup()
    expect(await s.sweep()).toEqual({ rows: 2, settled: 1, queued: 1 })
    expect(delivered).toEqual(['2'])
    expect(st.alerted['2']).toBeDefined()
    advance(60_000)
    await s.sweep()
    expect(delivered).toEqual(['2'])
  })

  it('keeps alerts queued while delivery fails', async () => {
    let ok = false
    const { s, st, advance } = setup({ deliver: async (items) => (ok ? items : []) })
    await s.sweep()
    expect(st.alert_queue).toHaveLength(1)
    ok = true
    advance(60_000)
    await s.sweep()
    expect(st.alert_queue).toHaveLength(0)
  })

  it('alerts after failing for 15 minutes, once, then notes recovery', async () => {
    let fail = true
    const { s, st, delivered, advance } = setup({
      listRows: async () => {
        if (fail) throw new Error('down')
        return []
      },
    })
    await expect(s.sweep()).rejects.toThrow('down')
    expect(delivered).toEqual([])
    advance(16 * 60_000)
    await expect(s.sweep()).rejects.toThrow()
    expect(delivered.filter((d) => d.startsWith('sweep-failing'))).toHaveLength(1)
    advance(60_000)
    await expect(s.sweep()).rejects.toThrow()
    expect(delivered.filter((d) => d.startsWith('sweep-failing'))).toHaveLength(1)
    fail = false
    advance(60_000)
    await s.sweep()
    expect(delivered.some((d) => d.startsWith('sweep-recovered'))).toBe(true)
    expect(st.failing_since).toBeUndefined()
  })

  it('does not move the watermark past a row that throws', async () => {
    const { s, st } = setup({
      decide: async (tx) => {
        if (tx.index === '2') throw new Error('disk')
        return { outcome: 'settled' }
      },
    })
    await expect(s.sweep()).rejects.toThrow('disk')
    expect(st.last_swept_at).toBeUndefined()
  })

  it('reads from the last sweep minus the overlap', async () => {
    const ranges: { startDate: string; endDate: string }[] = []
    const { s, advance } = setup({
      listRows: async (r) => {
        ranges.push(r)
        return []
      },
    })
    await s.sweep()
    advance(3 * 86_400_000)
    await s.sweep()
    expect(ranges[1].startDate < ranges[1].endDate).toBe(true)
  })

  it('serves many notify requests with one sweep', async () => {
    let n = 0
    const { s } = setup({
      listRows: async () => {
        n++
        return []
      },
      setTimer: (fn: () => void) => setTimeout(fn, 0),
    })
    for (let i = 0; i < 20; i++) s.request()
    await new Promise((r) => setTimeout(r, 20))
    await s.whenIdle()
    expect(n).toBe(1)
  })
})
