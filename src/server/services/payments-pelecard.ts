// PeleCard settlement. Ported from Dugri's /api/payment/callback.
//
// The callback body is untrusted: only the TransactionId is taken from it, and the transaction
// is re-fetched from PeleCard with our secret credentials. It settles only when the lookup
// succeeded, SHVA approved, and the amount equals that pay window's own amount.
//
// Unlike Tranzila, nothing re-reads PeleCard later, so a verified charge for an order that
// changed after its window opened still SETTLES and the owner is told: refusing here would leave
// the buyer charged and the order unpaid with nothing to recover from. (Dugri: "refuse only where
// something will retry".) As a second path for a lost callback, the server also checks a recent
// open window when the buyer's page polls the order after returning from the pay window.
import { and, desc, eq, gt } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { paySessions } from '../db/schema.ts'
import { type PelecardTx, parseCallback, verifyFailure } from '../payments/pelecard.ts'
import type { Services } from './context.ts'
import { alertOwner } from './delivery.ts'
import { getOrder, type Order } from './orders.ts'
import { onOrderPaid, orderPriceKey, settle } from './payments.ts'

type Session = typeof paySessions.$inferSelect

const ref = (tx: PelecardTx) =>
  `pelecard:${tx.transactionId}${tx.approvalNo ? `/${tx.approvalNo}` : ''}${tx.voucherNo ? `/v${tx.voucherNo}` : ''}`

/** Settles one authoritative transaction, or reports why it did not. Idempotent. */
export async function settlePelecardTx(db: DB, svc: Services, base: string, tx: PelecardTx) {
  const [session] = tx.paramX
    ? await db.select().from(paySessions).where(eq(paySessions.token, tx.paramX))
    : []
  if (!session || session.provider !== 'pelecard') {
    console.error(
      `[payment] pelecard transaction ${tx.transactionId} matches no pelecard pay window of ours (foreign, forged, or another environment)`,
    )
    return 'no_session' as const
  }
  const order = await getOrder(db, session.orderId)
  if (!order) return 'no_session' as const
  const failure = verifyFailure(tx, { amountAgorot: session.amountAgorot })
  if (failure === 'declined' || failure === 'lookup_status') return failure
  if (failure) {
    // Money may have cleared for a sum this window never quoted: a person must look.
    await alertOwner(svc, `פלאקארד: עסקה ${tx.transactionId} לא אומתה`, [
      `הזמנה ${order.orderNo}: חלון התשלום היה על ${(session.amountAgorot / 100).toFixed(2)} ₪, נגבו ${tx.debitTotalAgorot != null ? (tx.debitTotalAgorot / 100).toFixed(2) : '?'} ₪ (${failure}).`,
      'לבדוק בפלאקארד ולזכות או לסמן ידנית לפי הצורך.',
    ])
    return failure
  }
  const txKey = `pc:${tx.transactionId}`
  if (session.status === 'paid')
    return session.transactionId === txKey ? ('already' as const) : ('other' as const)
  if (order.paidAt) {
    await alertOwner(svc, `פלאקארד: חיוב נוסף על הזמנה ${order.orderNo}`, [
      `עסקה ${tx.transactionId} על ${(session.amountAgorot / 100).toFixed(2)} ₪ שולמה מחלון נוסף, וההזמנה כבר שולמה.`,
      'לבדוק בפלאקארד ולזכות לפי הצורך.',
    ])
    return 'second_charge' as const
  }
  const settled = await settle(db, session.id, order.id, {
    transactionId: txKey,
    paymentRef: ref(tx),
    raw: tx.raw,
  })
  if (!settled) return 'already' as const
  if (session.priceKey !== orderPriceKey(order)) {
    await alertOwner(svc, `פלאקארד: הזמנה ${order.orderNo} השתנתה אחרי פתיחת התשלום`, [
      `נגבו ${(session.amountAgorot / 100).toFixed(2)} ₪ לפי החלון שנפתח; מחיר ההזמנה עכשיו ${(order.priceAgorot / 100).toFixed(2)} ₪. התשלום נקלט, כדאי לבדוק.`,
    ])
  }
  await onOrderPaid(db, svc, base, order.id)
  return 'settled' as const
}

/**
 * The server-side callback. Returns 'retry' when PeleCard could not be asked (the route answers
 * 502 so PeleCard retries), otherwise the outcome.
 */
export async function handlePelecardCallback(
  db: DB,
  svc: Services,
  base: string,
  body: Record<string, unknown>,
) {
  if (!svc.pelecard.isConfigured()) return 'off' as const
  const parsed = parseCallback(body)
  let transactionId = parsed.transactionId
  if (!transactionId && parsed.paramX) {
    const [s] = await db.select().from(paySessions).where(eq(paySessions.token, parsed.paramX))
    transactionId = initTransactionId(s)
  }
  if (!transactionId) return 'ignored' as const
  let tx: PelecardTx
  try {
    tx = await svc.pelecard.getTransaction(transactionId)
  } catch (e) {
    console.error(
      `[payment] pelecard callback: could not fetch transaction ${transactionId}, answering 502 so PeleCard retries; the charge is still pending: ${(e as Error)?.message ?? e}`,
    )
    return 'retry' as const
  }
  return settlePelecardTx(db, svc, base, tx)
}

function initTransactionId(s: Session | undefined): string | null {
  const raw = s?.raw as { initTransactionId?: string } | null | undefined
  return raw?.initTransactionId ?? null
}

const lastCheck = new Map<number, number>()

/**
 * A second path for a lost callback: while the buyer's page waits for "paid", look up the order's
 * most recent open PeleCard window directly, at most once per 10 seconds per window.
 */
export async function checkPelecardReturn(
  db: DB,
  svc: Services,
  base: string,
  order: Order,
  now = Date.now(),
) {
  if (order.paidAt || !svc.pelecard.isConfigured()) return
  const [s] = await db
    .select()
    .from(paySessions)
    .where(
      and(
        eq(paySessions.orderId, order.id),
        eq(paySessions.provider, 'pelecard'),
        eq(paySessions.status, 'open'),
        gt(paySessions.createdAt, new Date(now - 60 * 60_000)),
      ),
    )
    .orderBy(desc(paySessions.createdAt))
    .limit(1)
  const txId = initTransactionId(s)
  if (!s || !txId) return
  if (now - (lastCheck.get(s.id) ?? 0) < 10_000) return
  lastCheck.set(s.id, now)
  try {
    const tx = await svc.pelecard.getTransaction(txId)
    // An unpaid window answers "not approved": nothing to report from a poll.
    if (verifyFailure(tx, { amountAgorot: s.amountAgorot }) === null)
      await settlePelecardTx(db, svc, base, tx)
  } catch {
    // The callback path still stands; a failed poll changes nothing.
  }
}
