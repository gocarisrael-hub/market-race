// Mock payment for staging (PAYMENT_PROVIDER=mock): our own page stands in for the card page.
// No money moves. Refused whenever the environment is production.
import { eq } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { orders, paySessions } from '../db/schema.ts'
import type { Services } from './context.ts'
import { onOrderPaid, settle } from './payments.ts'

async function mockSession(db: DB, svc: Services, token: string) {
  if (!svc.mockAllowed) return null
  const [s] = await db.select().from(paySessions).where(eq(paySessions.token, token))
  if (!s || s.provider !== 'mock') return null
  const [o] = await db.select().from(orders).where(eq(orders.id, s.orderId))
  return o ? { session: s, order: o } : null
}

/** What the mock page shows. */
export async function mockPaymentInfo(db: DB, svc: Services, token: string) {
  const m = await mockSession(db, svc, token)
  if (!m) return null
  return {
    orderNo: m.order.orderNo,
    amountAgorot: m.session.amountAgorot,
    manageToken: m.order.manageToken,
    paid: m.session.status === 'paid',
  }
}

/** "Pay" on the mock page: settles through the same path as a real charge. Idempotent. */
export async function completeMockPayment(db: DB, svc: Services, base: string, token: string) {
  const m = await mockSession(db, svc, token)
  if (!m) return null
  if (m.session.status === 'open' && !m.order.paidAt) {
    const settled = await settle(db, m.session.id, m.order.id, {
      transactionId: `mock:${token}`,
      paymentRef: `mock:${token}`,
      raw: { mock: true },
    })
    if (settled) await onOrderPaid(db, svc, base, m.order.id)
  }
  return { manageToken: m.order.manageToken }
}
