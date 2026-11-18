// Settles Tranzila payments from the only thing that proves a charge: the terminal's own
// rows in the Reports API. Ported from Dugri (server/tranzila-sweep.js), made async.
//
// A notify for a real, unpaid session only ASKS for a sweep; the sweep reads every row since
// the last one (persisted `last_swept_at` minus an overlap), matches each row to a pay session
// by its token, verifies and settles idempotently, and queues an alert for approved rows that
// do not settle. An index is marked reported only once an alert really went out.
import type { TxRow } from './tranzila.ts'

export function israelDateMs(ms: number) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export interface AlertItem {
  kind: string
  index: string
  queued_at: number
  [k: string]: unknown
}

export interface SweepState {
  last_swept_at?: number
  last_saved_at?: number
  last_settled_at?: number
  failing_since?: number
  failure_alerted_at?: number
  alerted: Record<string, number>
  alert_queue: AlertItem[]
  stale?: {
    since: number | null
    orders: string[]
    count: number
    alerted_at?: number
    alerted_count?: number
  }
  stale_checked_until?: number
  alert_sends?: number[]
}

export type Decision = {
  outcome: 'settled' | 'used' | 'ignored' | 'rejected' | 'other_env'
  alert?: Record<string, unknown> & { kind: string }
}

export interface SweeperDeps {
  state: { get: () => SweepState; save: () => Promise<void> }
  listRows: (range: { startDate: string; endDate: string }) => Promise<TxRow[]>
  decide: (tx: TxRow) => Promise<Decision>
  deliver: (items: AlertItem[]) => Promise<AlertItem[] | true>
  hasRecentUnpaid: (atMs: number) => Promise<boolean>
  staleUnpaid?: ((fromMs: number, toMs: number) => Promise<{ order: string; initiated_at: string }[]>) | null
  overlapMs?: number
  bootstrapMs?: number
  failAlertAfterMs?: number
  failRepeatMs?: number
  maxLookbackMs?: number
  minSpacingMs?: number
  activeEveryMs?: number
  idleEveryMs?: number
  saveEveryMs?: number
  keepAlertedMs?: number
  staleAfterMs?: number
  staleRepeatMs?: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  onError?: (e: unknown) => void
}

export function createSweeper(deps: SweeperDeps) {
  const {
    state,
    listRows,
    decide,
    deliver,
    hasRecentUnpaid,
    staleUnpaid = null,
    overlapMs = HOUR,
    bootstrapMs = 2 * DAY,
    failAlertAfterMs = 15 * MIN,
    failRepeatMs = 3 * HOUR,
    maxLookbackMs = 30 * DAY,
    minSpacingMs = 10_000,
    activeEveryMs = MIN,
    idleEveryMs = 10 * MIN,
    saveEveryMs = 10 * MIN,
    keepAlertedMs = 90 * DAY,
    staleAfterMs = 30 * MIN,
    staleRepeatMs = DAY,
    now = Date.now,
    setTimer = (fn, ms) => {
      const t = setTimeout(fn, ms)
      t.unref?.()
      return t
    },
    onError = (e) => console.error(`[tranzila] sweep failed: ${(e as Error)?.message ?? e}`),
  } = deps

  let running: Promise<unknown> | null = null
  let lastStartedAt = 0
  let wanted = false
  let timer: unknown = null
  let firing: Promise<void> | null = null

  function stateNow() {
    const st = state.get()
    if (!st.alerted || typeof st.alerted !== 'object') st.alerted = {}
    if (!Array.isArray(st.alert_queue)) st.alert_queue = []
    return st
  }
  async function safeSave() {
    try {
      await state.save()
    } catch (e) {
      onError(e)
    }
  }

  async function flush(at: number) {
    const st = stateNow()
    if (!st.alert_queue.length) return false
    const batch = st.alert_queue.slice()
    let result: AlertItem[] | true
    try {
      result = await deliver(batch)
    } catch {
      result = []
    }
    const sent = result === true ? batch : Array.isArray(result) ? result : []
    if (!sent.length) return false
    for (const item of sent) st.alerted[item.index] = at
    st.alert_queue = st.alert_queue.filter((q) => !sent.includes(q))
    for (const [index, when] of Object.entries(st.alerted))
      if (at - Number(when) > keepAlertedMs) delete st.alerted[index]
    await safeSave()
    return true
  }

  async function noteFailure(st: SweepState, at: number, e: unknown) {
    if (!st.failing_since) {
      st.failing_since = at
      await safeSave()
    }
    const since = Number(st.failing_since)
    if (at - since < failAlertAfterMs) return
    if (st.failure_alerted_at && at - Number(st.failure_alerted_at) < failRepeatMs) return
    st.failure_alerted_at = at
    st.alert_queue.push({
      kind: 'sweep_failing',
      index: `sweep-failing-${at}`,
      since,
      error: String((e as Error)?.message ?? e).slice(0, 200),
      queued_at: at,
    })
    await safeSave()
  }

  async function noteRecovery(st: SweepState, at: number) {
    if (!st.failing_since) return
    const since = Number(st.failing_since)
    const told = !!st.failure_alerted_at
    delete st.failing_since
    delete st.failure_alerted_at
    if (told)
      st.alert_queue.push({ kind: 'sweep_recovered', index: `sweep-recovered-${at}`, since, queued_at: at })
    await safeSave()
  }

  // Pay windows that aged out with nothing settled: a streak, not a per-window alert.
  async function noteStale(st: SweepState, at: number, settled: number) {
    let changed = false
    if (settled) {
      st.last_settled_at = at
      delete st.stale
      changed = true
    }
    if (typeof staleUnpaid !== 'function') return changed
    const until = at - staleAfterMs
    if (!st.stale_checked_until) {
      st.stale_checked_until = until
      return true
    }
    const from = Number(st.stale_checked_until)
    if (until <= from) return changed
    st.stale_checked_until = until
    const settledAt = Number(st.last_settled_at) || 0
    const fresh = ((await staleUnpaid(from, until)) || []).filter(
      (s) => s && Date.parse(s.initiated_at) > settledAt,
    )
    if (fresh.length) {
      const streak = st.stale || { since: null, orders: [], count: 0 }
      for (const s of fresh) {
        const order = String(s.order)
        if (streak.orders.includes(order)) continue
        streak.orders.push(order)
        streak.count += 1
        const t = Date.parse(s.initiated_at)
        if (!streak.since || t < streak.since) streak.since = t
        changed = true
      }
      if (streak.orders.length > 200) streak.orders = streak.orders.slice(-200)
      st.stale = streak
    }
    const streak = st.stale
    if (
      streak &&
      streak.count > (Number(streak.alerted_count) || 0) &&
      (!streak.alerted_at || at - Number(streak.alerted_at) >= staleRepeatMs)
    ) {
      streak.alerted_at = at
      streak.alerted_count = streak.count
      st.alert_queue.push({
        kind: 'stale_unpaid',
        index: `stale-unpaid-${at}`,
        since: streak.since,
        count: streak.count,
        orders: streak.orders.slice(-10),
        queued_at: at,
      })
      changed = true
    }
    return changed
  }

  async function run(at: number) {
    lastStartedAt = at
    const st = stateNow()
    try {
      const since = st.last_swept_at ? Number(st.last_swept_at) - overlapMs : at - bootstrapMs
      const from = Math.max(at - maxLookbackMs, Math.min(since, at))
      let result: { rows: number; settled: number; queued: number }
      try {
        const rows = (await listRows({ startDate: israelDateMs(from), endDate: israelDateMs(at) })) || []
        let settled = 0
        let queued = 0
        let rowError: unknown = null
        for (const tx of rows) {
          let d: Decision
          try {
            d = (await decide(tx)) || { outcome: 'ignored' }
          } catch (e) {
            rowError = rowError || e
            continue
          }
          if (d.outcome === 'settled') settled += 1
          if (d.alert) {
            const index = String(tx.index)
            if (!st.alerted[index] && !st.alert_queue.some((q) => q.index === index)) {
              st.alert_queue.push({ ...d.alert, index, queued_at: at })
              queued += 1
            }
          }
        }
        if (rowError) {
          if (settled || queued) await safeSave()
          throw rowError
        }
        st.last_swept_at = at
        const staleChanged = await noteStale(st, at, settled)
        if (
          settled ||
          queued ||
          staleChanged ||
          !st.last_saved_at ||
          at - Number(st.last_saved_at) >= saveEveryMs
        ) {
          st.last_saved_at = at
          await state.save()
        }
        result = { rows: rows.length, settled, queued }
      } catch (e) {
        await noteFailure(st, at, e)
        throw e
      }
      await noteRecovery(st, at)
      return result
    } finally {
      await flush(at)
    }
  }

  async function sweep(
    at = now(),
  ): Promise<{ rows: number; settled: number; queued: number } | { skipped: true }> {
    if (running) {
      await running.catch(() => {})
      return { skipped: true }
    }
    const p = run(at)
    running = p
    try {
      return await p
    } finally {
      running = null
    }
  }

  async function fire() {
    timer = null
    if (!wanted) return
    if (running) await running.catch(() => {})
    const wait = lastStartedAt + minSpacingMs - now()
    if (wait > 0) {
      schedule(wait)
      return
    }
    wanted = false
    try {
      await sweep(now())
    } catch (e) {
      onError(e)
    }
    if (wanted) schedule(Math.max(0, lastStartedAt + minSpacingMs - now()))
  }

  function schedule(wait: number) {
    if (timer) return
    timer = setTimer(() => {
      firing = fire().finally(() => {
        firing = null
      })
    }, wait)
  }

  /** A notify's request: at most one sweep per minSpacingMs however many arrive. */
  function request() {
    wanted = true
    schedule(Math.max(0, lastStartedAt + minSpacingMs - now()))
  }

  /** Periodic cadence: often while a buyer may be paying, rarely otherwise. */
  async function tick(at = now()) {
    const every = (await hasRecentUnpaid(at)) ? activeEveryMs : idleEveryMs
    if (running || at - lastStartedAt < every) return { skipped: true as const }
    return sweep(at)
  }

  async function whenIdle() {
    for (let i = 0; i < 10000; i++) {
      if (running) await running.catch(() => {})
      else if (firing) await firing
      else if (timer) await new Promise((r) => setTimeout(r, 2))
      else return
    }
  }

  return { sweep, request, tick, whenIdle }
}

const SWEEP_STATUS_KINDS = new Set(['sweep_failing', 'sweep_recovered'])
export const FOOTER_MONEY = 'לבדוק ב-My Tranzila אם נגבה כסף, ולזכות או לסמן ידנית לפי הצורך.'
export const FOOTER_FAILING =
  'אין כאן עסקה לבדוק או לזכות. כשהבדיקה תחזור לעבוד, תשלומים מהזמן הזה ייבדקו ויסומנו מעצמם; אם זה נמשך, לבדוק שהמסוף והמפתחות של טרנזילה תקינים.'
export const FOOTER_RECOVERED = 'אין צורך לעשות דבר.'
export function alertFooter(items: { kind: string }[]) {
  const kinds = (items || []).map((i) => i?.kind)
  if (kinds.some((k) => !SWEEP_STATUS_KINDS.has(k))) return FOOTER_MONEY
  if (kinds.includes('sweep_failing')) return FOOTER_FAILING
  return FOOTER_RECOVERED
}
