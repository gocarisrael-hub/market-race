// Admin: monthly settlement per stall (Israel-time months), as JSON and as CSV for Excel.
import { and, eq, gte, lt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import type { DB } from '../db/index.ts'
import { orders, redemptions, stalls, tastings } from '../db/schema.ts'
import { israelDate, israelMonth, israelMonthRange } from '../domain/dates.ts'
import { type Settlement, settlementCsv, summarize } from '../domain/settlement.ts'
import { requireOwner } from '../lib/auth.ts'

const monthQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
})

export async function loadSettlement(db: DB, month: string): Promise<Settlement> {
  const { from, to } = israelMonthRange(month)
  const rows = await db
    .select({
      redemptionId: redemptions.id,
      redeemedAt: redemptions.redeemedAt,
      orderId: redemptions.orderId,
      stopIndex: redemptions.stopIndex,
      orderNo: orders.orderNo,
      stallId: redemptions.stallId,
      stallName: stalls.name,
      tastingName: tastings.name,
      portions: redemptions.portions,
      feeAgorot: redemptions.feeAgorot,
      usedBackup: redemptions.usedBackup,
    })
    .from(redemptions)
    .innerJoin(orders, eq(orders.id, redemptions.orderId))
    .innerJoin(stalls, eq(stalls.id, redemptions.stallId))
    .innerJoin(tastings, eq(tastings.id, redemptions.tastingId))
    .where(and(gte(redemptions.redeemedAt, from), lt(redemptions.redeemedAt, to)))
  return summarize(month, rows, (d) => israelDate(d))
}

export async function adminSettlementRoutes(app: FastifyInstance, ctx: AppContext) {
  await app.register(async (r) => {
    r.addHook('preHandler', requireOwner(ctx.db))

    r.get('/admin/api/settlement', async (req, reply) => {
      const q = monthQuery.safeParse(req.query)
      if (!q.success) return reply.code(400).send({ error: 'invalid_month' })
      return loadSettlement(ctx.db, q.data.month ?? israelMonth())
    })

    r.get('/admin/api/settlement.csv', async (req, reply) => {
      const q = monthQuery.safeParse(req.query)
      if (!q.success) return reply.code(400).send({ error: 'invalid_month' })
      const month = q.data.month ?? israelMonth()
      const csv = settlementCsv(await loadSettlement(ctx.db, month))
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="settlement-${month}.csv"`)
        .send(csv)
    })
  })
}
