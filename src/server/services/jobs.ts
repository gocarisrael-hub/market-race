// Background housekeeping, run on an interval by the server entry.
import { and, inArray, isNotNull, lt } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { orders } from '../db/schema.ts'
import { israelDate } from '../domain/dates.ts'
import type { Services } from './context.ts'
import { alertOwner } from './delivery.ts'

/** Orders past their validity that were never finished become `expired`. Returns how many. */
export async function expireOrders(db: DB, now = new Date()): Promise<number> {
  const today = israelDate(now)
  const rows = await db
    .update(orders)
    .set({ status: 'expired' })
    .where(
      and(
        inArray(orders.status, ['ready', 'active']),
        isNotNull(orders.validUntil),
        lt(orders.validUntil, today),
      ),
    )
    .returning({ id: orders.id })
  return rows.length
}

/** Tells the owner about server errors, at most one message per `windowMs`, with a count. */
export function createErrorAlerter(svc: Services, windowMs = 15 * 60_000, now = Date.now) {
  let lastSent = 0
  let pending: string[] = []
  return async function report(message: string) {
    pending.push(message.slice(0, 300))
    if (now() - lastSent < windowMs) return false
    const batch = pending
    pending = []
    lastSent = now()
    return alertOwner(svc, `שגיאות בשרת (${batch.length})`, batch.slice(-10))
  }
}
