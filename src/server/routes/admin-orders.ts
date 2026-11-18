// Admin: orders, test games, review queue, live games.
import { desc, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import { gameStates, orders, redemptions } from '../db/schema.ts'
import { FORMS, ORDER_STATUSES } from '../domain/types.ts'
import { requireOwner } from '../lib/auth.ts'
import {
  approveOrder,
  BuildError,
  buildOrderGame,
  createOrder,
  getOrder,
  updateAnswersAndRebuild,
} from '../services/orders.ts'

const letterNote = z.object({ text: z.string().max(600), signature: z.string().max(60) })

const testGame = z.object({
  occasionKey: z.string().min(1),
  form: z.enum(FORMS),
  honoreeName: z.string().max(60).default(''),
  themeId: z.number().int(),
  routeId: z.number().int(),
  people: z.number().int().min(1).max(100),
  allergens: z.array(z.string()).default([]),
  diets: z.array(z.string()).default([]),
  answers: z.record(z.string(), z.string()).default({}),
  letterNotes: z.array(letterNote).default([]),
  companyName: z.string().max(80).optional(),
})

export function orderLinks(base: string, o: { gameToken: string; manageToken: string }) {
  return { game: `${base}/g/${o.gameToken}`, manage: `${base}/m/${o.manageToken}` }
}

export async function adminOrderRoutes(app: FastifyInstance, ctx: AppContext) {
  await app.register(async (r) => {
    r.addHook('preHandler', requireOwner(ctx.db))
    const fail = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) => {
      if (err instanceof BuildError) return reply.code(400).send({ error: err.message })
      throw err
    }

    r.get('/admin/api/orders', async (req) => {
      const q = z.object({ status: z.enum(ORDER_STATUSES).optional() }).parse(req.query)
      const rows = await ctx.db
        .select()
        .from(orders)
        .where(q.status ? eq(orders.status, q.status) : undefined)
        .orderBy(desc(orders.createdAt))
        .limit(500)
      return { orders: rows.map((o) => ({ ...o, game: undefined, hasGame: !!o.game })) }
    })

    r.get('/admin/api/orders/:id', async (req, reply) => {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params)
      const order = await getOrder(ctx.db, id)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      const [state] = await ctx.db.select().from(gameStates).where(eq(gameStates.orderId, id))
      const used = await ctx.db.select().from(redemptions).where(eq(redemptions.orderId, id))
      return {
        order,
        state: state ?? null,
        redemptions: used,
        links: orderLinks(ctx.config.publicBaseUrl, order),
      }
    })

    // Phase 1 "done": generate a game from test answers.
    r.post('/admin/api/orders/test', async (req, reply) => {
      const body = testGame.safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues })
      const b = body.data
      try {
        const order = await createOrder(ctx.db, {
          kind: b.companyName ? 'company' : 'private',
          status: 'awaiting_answers',
          ...b,
          companyName: b.companyName ?? null,
          notes: 'test game',
        })
        const built = await buildOrderGame(ctx.db, order.id)
        return { order: built, links: orderLinks(ctx.config.publicBaseUrl, built) }
      } catch (err) {
        return fail(reply, err)
      }
    })

    r.patch('/admin/api/orders/:id/answers', async (req, reply) => {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params)
      const body = z
        .object({
          answers: z.record(z.string(), z.string()).optional(),
          letterNotes: z.array(letterNote).optional(),
          honoreeName: z.string().max(60).optional(),
        })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid' })
      try {
        return { order: await updateAnswersAndRebuild(ctx.db, id, body.data) }
      } catch (err) {
        return fail(reply, err)
      }
    })

    r.post('/admin/api/orders/:id/rebuild', async (req, reply) => {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params)
      const order = await getOrder(ctx.db, id)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (!['awaiting_answers', 'review', 'ready'].includes(order.status))
        return reply.code(400).send({ error: `order is ${order.status}; a started game is frozen` })
      try {
        return { order: await buildOrderGame(ctx.db, id) }
      } catch (err) {
        return fail(reply, err)
      }
    })

    r.post('/admin/api/orders/:id/approve', async (req, reply) => {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params)
      try {
        return { order: await approveOrder(ctx.db, id) }
      } catch (err) {
        return fail(reply, err)
      }
    })

    r.get('/admin/api/live', async () => {
      const active = await ctx.db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          honoreeName: orders.honoreeName,
          companyName: orders.companyName,
          people: orders.people,
          stopIndex: gameStates.stopIndex,
          step: gameStates.step,
          lastActivityAt: gameStates.lastActivityAt,
          startedAt: gameStates.startedAt,
          game: orders.game,
        })
        .from(orders)
        .innerJoin(gameStates, eq(gameStates.orderId, orders.id))
        .where(inArray(orders.status, ['active']))
        .orderBy(desc(gameStates.lastActivityAt))
      return {
        games: active.map(({ game, ...g }) => ({
          ...g,
          totalStops: game?.stops.length ?? 0,
          stallName: game?.stops[g.stopIndex]?.stall.name ?? '',
        })),
      }
    })
  })
}
