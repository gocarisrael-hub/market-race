// Admin: orders, test games, review queue, live games, resend and cancel.
import { and, count, desc, eq, gt, ilike, inArray, max, or, sum } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import type { DB } from '../db/index.ts'
import {
  gameStates,
  leads,
  messages,
  occasions,
  orders,
  paySessions,
  redemptions,
  stalls,
  tastings,
  uploads,
} from '../db/schema.ts'
import { recipientForForm } from '../domain/recipient.ts'
import { FORMS, ORDER_STATUSES, RECIPIENT_FORM, RECIPIENTS } from '../domain/types.ts'
import { requireOwner } from '../lib/auth.ts'
import { sendToBuyer } from '../services/delivery.ts'
import {
  approveOrder,
  BuildError,
  buildOrderGame,
  createOrder,
  getOrder,
  type Order,
  questionsForOrder,
  regenerateOrderMinigame,
  updateAnswersAndRebuild,
} from '../services/orders.ts'
import { afterBuilt } from '../services/payments.ts'

const letterNote = z.object({ text: z.string().max(600), signature: z.string().max(60) })

const testGame = z.object({
  occasionKey: z.string().min(1),
  form: z.enum(FORMS),
  // Who a private test game is for; absent: the form's recipient.
  recipient: z.enum(RECIPIENTS).nullable().optional(),
  honoreeName: z.string().max(60).default(''),
  themeId: z.number().int(),
  paletteId: z.number().int().nullable().optional(),
  routeId: z.number().int(),
  people: z.number().int().min(1).max(100),
  allergens: z.array(z.string()).default([]),
  diets: z.array(z.string()).default([]),
  answers: z.record(z.string(), z.string()).default({}),
  letterNotes: z.array(letterNote).default([]),
  companyName: z.string().max(80).optional(),
})

const idParam = z.object({ id: z.coerce.number().int() })

/** Statuses whose game has not started: answers can still change, the order can be cancelled. */
export const EDITABLE = ['quoted', 'pending_payment', 'awaiting_answers', 'review', 'ready'] as const

export function orderLinks(base: string, o: { gameToken: string; manageToken: string }) {
  return {
    game: `${base}/g/${o.gameToken}`,
    manage: `${base}/m/${o.manageToken}`,
    pay: `${base}/pay/${o.manageToken}`,
    qr: `/api/qr/${o.gameToken}.png`,
  }
}

/**
 * Portions bought (people × stops of the frozen game) vs. portions redeemed. `players` is how many
 * arrived (the captain's choice at the start). `unused` counts the portions bought and not served:
 * at the stops redeemed so far, and once the game is over (done or expired) at every stop it did
 * not reach. Unused portions are not refunded automatically; the owner decides.
 */
export function usage(
  o: Pick<Order, 'people' | 'game'> & { status?: Order['status'] },
  used: { portions: number; stops: number },
  players: number | null = null,
) {
  const stops = o.game?.stops.length ?? 0
  const people = o.game?.people ?? o.people
  const bought = people * stops
  const over = o.status === 'done' || o.status === 'expired'
  const unused = Math.max(0, (over ? bought : people * used.stops) - used.portions)
  return { stops, redeemedStops: used.stops, bought, used: used.portions, players, unused }
}

async function usedByOrder(db: DB, ids: number[]) {
  if (!ids.length) return new Map<number, { portions: number; stops: number }>()
  const rows = await db
    .select({ orderId: redemptions.orderId, portions: sum(redemptions.portions), stops: count() })
    .from(redemptions)
    .where(inArray(redemptions.orderId, ids))
    .groupBy(redemptions.orderId)
  return new Map(rows.map((r) => [r.orderId, { portions: Number(r.portions ?? 0), stops: Number(r.stops) }]))
}

export async function adminOrderRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx
  const base = ctx.config.publicBaseUrl
  await app.register(async (r) => {
    r.addHook('preHandler', requireOwner(db))
    const fail = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) => {
      if (err instanceof BuildError) return reply.code(400).send({ error: err.message })
      throw err
    }

    r.get('/admin/api/orders', async (req, reply) => {
      const parsed = z
        .object({
          status: z.enum(ORDER_STATUSES).optional(),
          kind: z.enum(['private', 'company']).optional(),
          q: z.string().trim().max(80).optional(),
        })
        .safeParse(req.query)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid' })
      const q = parsed.data
      const like = q.q ? `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null
      const rows = await db
        .select()
        .from(orders)
        .where(
          and(
            q.status ? eq(orders.status, q.status) : undefined,
            q.kind ? eq(orders.kind, q.kind) : undefined,
            like
              ? or(
                  ilike(orders.orderNo, like),
                  ilike(orders.buyerName, like),
                  ilike(orders.buyerEmail, like),
                  ilike(orders.buyerPhone, like),
                  ilike(orders.honoreeName, like),
                  ilike(orders.companyName, like),
                )
              : undefined,
          ),
        )
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(500)
      const used = await usedByOrder(
        db,
        rows.map((o) => o.id),
      )
      const totals = { bought: 0, used: 0 }
      const list = rows.map(({ game, ...o }) => {
        const u = usage(
          { people: o.people, game, status: o.status },
          used.get(o.id) ?? { portions: 0, stops: 0 },
        )
        totals.bought += u.bought
        totals.used += u.used
        return { ...o, hasGame: !!game, usage: u }
      })
      return { orders: list, totals }
    })

    // Counts per status, for the nav badge (review queue).
    r.get('/admin/api/orders/summary', async () => {
      const rows = await db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status)
      return { counts: Object.fromEntries(rows.map((x) => [x.status, Number(x.n)])) }
    })

    r.get('/admin/api/orders/:id', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const order = await getOrder(db, id)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      const [[state], used, msgs, sessions, files, [lead], [occasion], questions] = await Promise.all([
        db.select().from(gameStates).where(eq(gameStates.orderId, id)),
        db
          .select({
            id: redemptions.id,
            stopIndex: redemptions.stopIndex,
            stallId: redemptions.stallId,
            stallName: stalls.name,
            tastingId: redemptions.tastingId,
            tastingName: tastings.name,
            portions: redemptions.portions,
            feeAgorot: redemptions.feeAgorot,
            usedBackup: redemptions.usedBackup,
            redeemedAt: redemptions.redeemedAt,
          })
          .from(redemptions)
          .innerJoin(stalls, eq(stalls.id, redemptions.stallId))
          .innerJoin(tastings, eq(tastings.id, redemptions.tastingId))
          .where(eq(redemptions.orderId, id))
          .orderBy(redemptions.stopIndex),
        db.select().from(messages).where(eq(messages.orderId, id)).orderBy(desc(messages.id)),
        db
          .select({
            id: paySessions.id,
            amountAgorot: paySessions.amountAgorot,
            env: paySessions.env,
            status: paySessions.status,
            transactionId: paySessions.transactionId,
            createdAt: paySessions.createdAt,
            settledAt: paySessions.settledAt,
          })
          .from(paySessions)
          .where(eq(paySessions.orderId, id))
          .orderBy(desc(paySessions.createdAt)),
        db.select().from(uploads).where(eq(uploads.orderId, id)).orderBy(desc(uploads.createdAt)),
        db.select().from(leads).where(eq(leads.orderId, id)),
        db.select().from(occasions).where(eq(occasions.key, order.occasionKey)),
        questionsForOrder(db, order),
      ])
      const portions = used.reduce((n, x) => n + x.portions, 0)
      return {
        order,
        state: state ?? null,
        redemptions: used,
        usage: usage(order, { portions, stops: used.length }, state?.players ?? null),
        messages: msgs,
        paySessions: sessions,
        uploads: files,
        lead: lead ?? null,
        occasion: occasion ? { key: occasion.key, label: occasion.label, audience: occasion.audience } : null,
        questions,
        links: orderLinks(base, order),
      }
    })

    // Phase 1 "done": generate a game from test answers.
    r.post('/admin/api/orders/test', async (req, reply) => {
      const body = testGame.safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues })
      const b = body.data
      const kind = b.companyName ? 'company' : 'private'
      const [occ] = await db.select().from(occasions).where(eq(occasions.key, b.occasionKey))
      const recipient = kind === 'company' ? null : (b.recipient ?? recipientForForm(b.form, occ?.decor))
      try {
        const order = await createOrder(db, {
          kind,
          status: 'awaiting_answers',
          ...b,
          form: recipient ? RECIPIENT_FORM[recipient] : b.form,
          recipient,
          companyName: b.companyName ?? null,
          notes: 'test game',
        })
        // The owner entered the answers here, so they count as submitted.
        await db.update(orders).set({ answersSubmittedAt: new Date() }).where(eq(orders.id, order.id))
        const built = await buildOrderGame(db, order.id)
        return { order: built, links: orderLinks(base, built) }
      } catch (err) {
        return fail(reply, err)
      }
    })

    r.patch('/admin/api/orders/:id/answers', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const body = z
        .object({
          answers: z.record(z.string(), z.string()).optional(),
          letterNotes: z.array(letterNote).optional(),
          honoreeName: z.string().max(60).optional(),
        })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid' })
      try {
        const order = await updateAnswersAndRebuild(db, id, body.data)
        // The owner is looking at it: deliver when clean, no review alert.
        if (order.status === 'ready') await afterBuilt(db, ctx.services, base, order)
        return { order: (await getOrder(db, id)) ?? order }
      } catch (err) {
        return fail(reply, err)
      }
    })

    r.post('/admin/api/orders/:id/rebuild', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const order = await getOrder(db, id)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (!['awaiting_answers', 'review', 'ready'].includes(order.status))
        return reply.code(400).send({ error: `order is ${order.status}; a started game is frozen` })
      try {
        return { order: await buildOrderGame(db, id) }
      } catch (err) {
        return fail(reply, err)
      }
    })

    // Rebuilds one mini-game (another type or other choices) until the group reaches it.
    r.post('/admin/api/orders/:id/minigames/:index/regenerate', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const index = z.coerce
        .number()
        .int()
        .min(0)
        .safeParse((req.params as { index?: string }).index)
      if (!index.success) return reply.code(400).send({ error: 'invalid' })
      try {
        return { order: await regenerateOrderMinigame(db, id, index.data) }
      } catch (err) {
        return fail(reply, err)
      }
    })

    r.post('/admin/api/orders/:id/approve', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      try {
        const order = await approveOrder(db, id)
        // A paid order that waited for review goes out now.
        await afterBuilt(db, ctx.services, base, order)
        return { order: (await getOrder(db, id)) ?? order }
      } catch (err) {
        return fail(reply, err)
      }
    })

    // Sends the game link again (email, and WhatsApp when allowed).
    r.post('/admin/api/orders/:id/resend', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const order = await getOrder(db, id)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (!order.game || !['ready', 'active', 'done'].includes(order.status))
        return reply.code(400).send({ error: 'not_ready' })
      if (!order.buyerEmail && !order.buyerPhone) return reply.code(400).send({ error: 'no_contact' })
      const [{ last }] = await db
        .select({ last: max(messages.id) })
        .from(messages)
        .where(eq(messages.orderId, id))
      await sendToBuyer(db, ctx.services, base, order, 'game_ready')
      if (!order.deliveredAt)
        await db.update(orders).set({ deliveredAt: new Date() }).where(eq(orders.id, id))
      const sent = await db
        .select()
        .from(messages)
        .where(and(eq(messages.orderId, id), gt(messages.id, last ?? 0)))
      return { messages: sent }
    })

    // Cancels an order whose game has not started. A refund, if any, is done in My Tranzila.
    r.post('/admin/api/orders/:id/cancel', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const order = await getOrder(db, id)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      const [state] = await db.select().from(gameStates).where(eq(gameStates.orderId, id))
      if (!(EDITABLE as readonly string[]).includes(order.status) || state?.startedAt)
        return reply
          .code(400)
          .send({ error: `order is ${order.status}; only an order not started can be cancelled` })
      const [row] = await db
        .update(orders)
        .set({ status: 'cancelled' })
        .where(and(eq(orders.id, id), inArray(orders.status, [...EDITABLE])))
        .returning()
      if (!row) return reply.code(409).send({ error: 'changed' })
      return { order: row, refundNeeded: !!row.paidAt }
    })

    r.get('/admin/api/live', async () => {
      const active = await db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          honoreeName: orders.honoreeName,
          companyName: orders.companyName,
          people: orders.people,
          players: gameStates.players,
          stopIndex: gameStates.stopIndex,
          step: gameStates.step,
          lastActivityAt: gameStates.lastActivityAt,
          startedAt: gameStates.startedAt,
          pausedAt: gameStates.pausedAt,
          backupStops: gameStates.backupStops,
          game: orders.game,
        })
        .from(orders)
        .innerJoin(gameStates, eq(gameStates.orderId, orders.id))
        .where(inArray(orders.status, ['active']))
        .orderBy(desc(gameStates.lastActivityAt))
      return {
        games: active.map(({ game, backupStops, ...g }) => {
          const stop = game?.stops[g.stopIndex]
          const backup = !!stop?.backup && backupStops.includes(g.stopIndex)
          return {
            ...g,
            totalStops: game?.stops.length ?? 0,
            stallName: (backup ? stop?.backup?.stall.name : stop?.stall.name) ?? '',
            usingBackup: backup,
          }
        }),
      }
    })
  })
}
