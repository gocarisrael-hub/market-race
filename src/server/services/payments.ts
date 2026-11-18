// Card payments for orders (PeleCard by default, Tranzila kept). Tranzila part: Ported from Dugri's pay/init + decideTranzilaRow + notify,
// against this product's `orders` and `pay_sessions` tables. See docs/PAYMENT.md.
import { and, eq, gt, inArray, lte } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { leads, orders, paySessions, settings } from '../db/schema.ts'
import {
  type AlertItem,
  alertFooter,
  createSweeper,
  type Decision,
  type SweepState,
} from '../payments/sweep.ts'
import { SUCCESS_CODE, type TxRow, verifyTransaction } from '../payments/tranzila.ts'
import { cardEnabled, type Services } from './context.ts'
import { alertOwner, links, sendToBuyer } from './delivery.ts'
import { buildOrderGame, getOrder, type Order } from './orders.ts'
import { getSetting } from './settings.ts'

const SESSION_TTL_MS = 20 * 60_000

export async function priceFor(db: DB, occasionKey: string, people: number): Promise<number | null> {
  const prices = await getSetting(db, 'prices')
  const p = prices[occasionKey]
  if (!p) return null
  const total = Math.round(p.base + p.perPerson * people)
  return total > 0 ? total : null
}

/** "Is this still the same purchase?" A charge from a window opened before a change does not pay. */
export function orderPriceKey(o: Pick<Order, 'priceAgorot' | 'people' | 'occasionKey' | 'kind'>) {
  return `${o.kind}|${o.occasionKey}|${o.people}|${o.priceAgorot}`
}

export class PaymentError extends Error {
  code: string
  constructor(code: string, message = code) {
    super(message)
    this.code = code
  }
}

/** Opens a pay window for an unpaid order with the chosen provider. Returns the iframe URL. */
export async function startPayment(db: DB, svc: Services, base: string, order: Order) {
  if (!cardEnabled(svc)) throw new PaymentError('card_disabled')
  if (order.paidAt) throw new PaymentError('already_paid')
  if (!['pending_payment', 'quoted'].includes(order.status)) throw new PaymentError('not_payable')
  if (!(order.priceAgorot > 0)) throw new PaymentError('no_price')
  // "m" + environment letter + 16 hex: lowercase and 18 chars, so it also fits PeleCard's ParamX.
  const token = svc.tranzila.newSessionToken()
  const brand = await getSetting(db, 'brand_name')
  const back = `${base}/pay/done?o=${encodeURIComponent(order.manageToken)}`
  const provider = svc.paymentProvider
  try {
    let url: string
    let initTransactionId: string | null = null
    if (provider === 'pelecard') {
      const r = await svc.pelecard.init({
        amountAgorot: order.priceAgorot,
        paramToken: token,
        urls: {
          goodUrl: back,
          errorUrl: `${back}&error=1`,
          serverGoodUrl: `${base}/api/payment/pelecard/callback`,
          serverErrorUrl: `${base}/api/payment/pelecard/callback?error=1`,
        },
      })
      url = r.url
      initTransactionId = r.transactionId
    } else {
      const r = await svc.tranzila.init({
        amountAgorot: order.priceAgorot,
        paramToken: token,
        urls: {
          goodUrl: back,
          errorUrl: `${back}&error=1`,
          notifyUrl: `${base}/api/payment/tranzila/notify?t=${encodeURIComponent(token)}`,
        },
        buyer: { email: order.buyerEmail, phone: order.buyerPhone },
        description: `${brand} ${order.orderNo}`,
      })
      url = r.url
    }
    await db.insert(paySessions).values({
      orderId: order.id,
      token,
      amountAgorot: order.priceAgorot,
      priceKey: orderPriceKey(order),
      env: svc.tranzila.envTag(),
      provider,
      raw: initTransactionId ? { initTransactionId } : null,
    })
    return { url, amountAgorot: order.priceAgorot }
  } catch (e) {
    // No window opened and no session recorded: this line is the only trace.
    console.error(
      `[payment] ${order.orderNo}: ${provider} pay/init failed for ${order.priceAgorot} agorot, no window opened: ${(e as Error)?.message ?? e}`,
    )
    throw new PaymentError('init_failed')
  }
}

/** After a verified payment: build and deliver, or ask for the answers. Never throws. */
export async function onOrderPaid(db: DB, svc: Services, base: string, orderId: number) {
  try {
    let order = await getOrder(db, orderId)
    if (!order) return
    if (order.answersSubmittedAt) {
      order = await buildOrderGame(db, orderId)
      await afterBuilt(db, svc, base, order)
    } else if (order.kind === 'company') {
      // Company answers are filled by the owner with the company in the admin.
      await alertOwner(svc, `הזמנת חברה ${order.orderNo} שולמה: נשאר למלא את השאלות`, [
        `${base}/admin#/orders/${order.id}`,
      ])
    } else {
      await sendToBuyer(db, svc, base, order, 'paid_answers_needed')
    }
    if (order.kind === 'company')
      await db.update(leads).set({ status: 'won' }).where(eq(leads.orderId, orderId))
  } catch (e) {
    console.error(`[payment] after-paid for order ${orderId} failed: ${(e as Error)?.message ?? e}`)
  }
}

/** A freshly built order: deliver when ready, tell the owner when it waits for review. */
export async function afterBuilt(db: DB, svc: Services, base: string, order: Order) {
  if (order.status === 'ready' && !order.deliveredAt && order.paidAt) {
    await sendToBuyer(db, svc, base, order, 'game_ready')
    await db.update(orders).set({ deliveredAt: new Date() }).where(eq(orders.id, order.id))
  } else if (order.status === 'review') {
    await alertOwner(svc, `הזמנה ${order.orderNo} ממתינה לבדיקה`, [
      ...order.flags.map((f) => `- ${f.message}`),
      `${base}/admin#/orders/${order.id}`,
    ])
  }
}

const REFUND_TYPES = new Set(['CREDIT', 'CANCEL', 'REFUTE', 'REVERSAL'])
const CHARGE_ATTEMPT_TYPES = new Set(['DEBIT', 'FORCE', 'VERIFY', 'J5', 'J2'])

/**
 * Decides one terminal row: settles what verifies, and returns an alert for an approved row a
 * person has to look at. Rows whose token was minted in another environment are ignored.
 */
export async function decideRow(db: DB, svc: Services, base: string, tx: TxRow): Promise<Decision> {
  if (tx.responseCode !== SUCCESS_CODE) return { outcome: 'ignored' }
  const [used] = await db
    .select({ id: paySessions.id })
    .from(paySessions)
    .where(eq(paySessions.transactionId, tx.index))
  if (used) return { outcome: 'used' }
  if (tx.txnType && REFUND_TYPES.has(tx.txnType)) return { outcome: 'ignored' }

  const env = svc.tranzila.envTag()
  const tokens = svc.tranzila.sessionTokenValues(tx.raw)
  const mine = tokens.filter((t) => svc.tranzila.tokenEnv(t) === env)
  if (tokens.length && !mine.length) return { outcome: 'other_env' }
  const sessions = mine.length
    ? await db.select().from(paySessions).where(inArray(paySessions.token, mine))
    : []
  const matches: { session: typeof paySessions.$inferSelect; order: Order }[] = []
  for (const s of sessions) {
    const order = await getOrder(db, s.orderId)
    if (order) matches.push({ session: s, order })
  }

  const repriced: typeof matches = []
  for (const m of matches) {
    if (m.order.paidAt) continue
    if (!verifyTransaction(tx, { amountAgorot: m.session.amountAgorot, token: m.session.token })) continue
    if (!m.session.priceKey || m.session.priceKey !== orderPriceKey(m.order)) {
      repriced.push(m)
      continue
    }
    const settled = await settle(db, m.session.id, m.order.id, {
      transactionId: tx.index,
      paymentRef: `tranzila:${tx.index}${tx.approvalNo ? `/${tx.approvalNo}` : ''}`,
      raw: tx.raw,
    })
    if (settled) await onOrderPaid(db, svc, base, m.order.id)
    return { outcome: 'settled' }
  }

  const info = {
    amount: tx.amountAgorot,
    type: tx.txnType,
    mode: tx.tranmode,
    date: tx.raw?.transaction_date ? String(tx.raw.transaction_date) : null,
  }
  if (repriced.length) {
    return {
      outcome: 'rejected',
      alert: {
        ...info,
        kind: 'order_changed',
        orders: repriced.map((m) => m.order.orderNo),
        expected: repriced.map((m) => m.session.amountAgorot),
        now: repriced.map((m) => m.order.priceAgorot),
      },
    }
  }
  if (
    matches.length &&
    tx.txnType &&
    !CHARGE_ATTEMPT_TYPES.has(tx.txnType) &&
    matches.every((m) => m.order.paidAt)
  ) {
    // Our token, approved, a type not known as a charge, on purchases already paid: money going back.
    return { outcome: 'ignored' }
  }
  if (matches.length) {
    console.error(
      `[tranzila] index ${tx.index} carries a session token but did not settle: type=${tx.txnType} mode=${tx.tranmode} currency=${tx.currency} amount=${tx.amountAgorot}`,
    )
    return {
      outcome: 'rejected',
      alert: {
        ...info,
        kind: matches.every((m) => m.order.paidAt) ? 'second_charge' : 'unverified',
        orders: matches.map((m) => m.order.orderNo),
      },
    }
  }
  if (tokens.length === 0 && env === 'p' && (!tx.txnType || !REFUND_TYPES.has(tx.txnType))) {
    return { outcome: 'rejected', alert: { ...info, kind: 'no_session' } }
  }
  return { outcome: 'ignored' }
}

/** Marks session and order paid in one transaction. A transaction id can pay only one session. */
export async function settle(
  db: DB,
  sessionId: number,
  orderId: number,
  paid: { transactionId: string; paymentRef: string; raw: unknown },
): Promise<boolean> {
  return db.transaction(async (trx) => {
    const now = new Date()
    const s = await trx
      .update(paySessions)
      .set({ status: 'paid', transactionId: paid.transactionId, raw: paid.raw, settledAt: now })
      .where(and(eq(paySessions.id, sessionId), eq(paySessions.status, 'open')))
      .returning()
    if (!s.length) return false
    const o = await trx
      .update(orders)
      .set({ paidAt: now, paymentRef: paid.paymentRef, status: 'awaiting_answers' })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ['pending_payment', 'quoted'])))
      .returning()
    if (!o.length) throw new Error(`order ${orderId} not payable at settle`)
    return true
  })
}

export function describeAlert(a: AlertItem): string {
  const nis = (ag: unknown) => (typeof ag === 'number' ? `${(ag / 100).toFixed(2)} ₪` : '?')
  const ords = Array.isArray(a.orders) ? (a.orders as string[]).join(', ') : ''
  switch (a.kind) {
    case 'order_changed':
      return `עסקה ${a.index}: ${nis(a.amount)} שולמו על הזמנה שהשתנתה מאז (${ords})`
    case 'second_charge':
      return `עסקה ${a.index}: חיוב נוסף ${nis(a.amount)} על הזמנה ששולמה כבר (${ords})`
    case 'unverified':
      return `עסקה ${a.index}: ${nis(a.amount)} לא אומתה (סוג ${a.type ?? '?'}, מצב ${a.mode ?? '?'}) (${ords})`
    case 'no_session':
      return `עסקה ${a.index}: ${nis(a.amount)} בלי הזמנה מתאימה`
    case 'sweep_failing':
      return `בדיקת התשלומים מול טרנזילה נכשלת מאז ${new Date(Number(a.since)).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}: ${a.error}`
    case 'sweep_recovered':
      return 'בדיקת התשלומים מול טרנזילה חזרה לעבוד.'
    case 'stale_unpaid':
      return `${a.count} חלונות תשלום נפתחו ולא שולמו מאז ${new Date(Number(a.since)).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })} (קונה שעזב, או שהדיווח מטרנזילה לא מגיע): ${ords}`
    default:
      return `${a.kind} ${a.index}`
  }
}

const SWEEP_KEY = '_tranzila_sweep'

/** The sweeper wired to the DB. State lives in memory and is persisted to `settings`. */
export async function createPaymentSweeper(db: DB, svc: Services, base: string) {
  const [row] = await db.select().from(settings).where(eq(settings.key, SWEEP_KEY))
  const st: SweepState = (row?.value as SweepState | undefined) ?? { alerted: {}, alert_queue: [] }
  const save = async () => {
    await db
      .insert(settings)
      .values({ key: SWEEP_KEY, value: st })
      .onConflictDoUpdate({ target: settings.key, set: { value: st, updatedAt: new Date() } })
  }
  const capFull = (at: number) => {
    st.alert_sends ??= []
    while (st.alert_sends.length && at - st.alert_sends[0] >= 3_600_000) st.alert_sends.shift()
    return st.alert_sends.length >= 5
  }
  return createSweeper({
    state: { get: () => st, save },
    listRows: (range) => svc.tranzila.listTransactions(range),
    decide: (tx) => decideRow(db, svc, base, tx),
    deliver: async (items) => {
      const at = Date.now()
      if (capFull(at)) return []
      const delivered: AlertItem[] = []
      for (let i = 0; i < items.length; i += 15) {
        const part = items.slice(i, i + 15)
        const ok = await alertOwner(svc, `טרנזילה: ${items.length} פריטים לבדיקה`, [
          ...part.map(describeAlert),
          alertFooter(part),
        ])
        if (ok) delivered.push(...part)
      }
      if (delivered.length) st.alert_sends!.push(at)
      return delivered
    },
    hasRecentUnpaid: async (at) => {
      const rows = await db
        .select({ id: paySessions.id })
        .from(paySessions)
        .where(and(eq(paySessions.status, 'open'), gt(paySessions.createdAt, new Date(at - 30 * 60_000))))
        .limit(1)
      return rows.length > 0
    },
    staleUnpaid:
      svc.tranzila.envTag() === 'p'
        ? async (from, to) => {
            const rows = await db
              .select({ orderNo: orders.orderNo, createdAt: paySessions.createdAt, paidAt: orders.paidAt })
              .from(paySessions)
              .innerJoin(orders, eq(orders.id, paySessions.orderId))
              .where(and(gt(paySessions.createdAt, new Date(from)), lte(paySessions.createdAt, new Date(to))))
            return rows
              .filter((r) => !r.paidAt)
              .map((r) => ({ order: r.orderNo, initiated_at: r.createdAt.toISOString() }))
          }
        : null,
  })
}

export type PaymentSweeper = Awaited<ReturnType<typeof createPaymentSweeper>>

/** Notify: unsigned, decides nothing. A real, recent, unpaid session asks for a sweep. */
export async function handleNotify(
  db: DB,
  svc: Services,
  sweeper: PaymentSweeper | null,
  body: Record<string, unknown>,
  query: Record<string, unknown>,
) {
  const parsed = svc.tranzila.parseNotify(body, query)
  const failed = parsed.response && parsed.response !== SUCCESS_CODE
  if (!svc.tranzila.isConfigured() || !parsed.token || failed || !sweeper) return
  const [s] = await db.select().from(paySessions).where(eq(paySessions.token, parsed.token))
  if (!s) return
  const order = await getOrder(db, s.orderId)
  if (order && !order.paidAt && Date.now() - s.createdAt.getTime() < SESSION_TTL_MS) sweeper.request()
}

export { links }
