// Player API, addressed by the game token. Public, except pausing: that needs the captain token,
// which only the manage page hands out (the bare game link never grants it).
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import { orders } from '../db/schema.ts'
import { isCaptainToken } from '../lib/tokens.ts'
import { sendToBuyer } from '../services/delivery.ts'
import { act, getView, type PlayAction, pauseGame } from '../services/play.ts'
import { getSetting } from '../services/settings.ts'

/** The header the captain's phone sends its captain token in. */
export const CAPTAIN_HEADER = 'x-captain'

// No "start": only the captain starts the game, from the manage page (POST /api/manage/:token/start).
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), stopIndex: z.number().int().min(0), answer: z.string().max(200) }),
  z.object({
    type: z.literal('hint'),
    stopIndex: z.number().int().min(0),
    answer: z.string().max(200).optional(),
  }),
  z.object({ type: z.literal('arrived'), stopIndex: z.number().int().min(0) }),
  z.object({ type: z.literal('redeemed'), stopIndex: z.number().int().min(0) }),
  z.object({
    type: z.literal('stall_closed'),
    stopIndex: z.number().int().min(0),
    stallId: z.number().int().optional(),
  }),
  z.object({
    type: z.literal('minigame'),
    stopIndex: z.number().int().min(0),
    game: z.number().int().min(0),
    answer: z.object({
      option: z.number().int().min(0).max(10).optional(),
      truths: z.array(z.boolean()).max(10).optional(),
      text: z.string().max(200).optional(),
    }),
  }),
  z.object({
    type: z.literal('minigame_continue'),
    stopIndex: z.number().int().min(0),
    game: z.number().int().min(0),
  }),
  // The captain's only: the route checks the captain token.
  z.object({
    type: z.literal('minigame_skip'),
    stopIndex: z.number().int().min(0),
    game: z.number().int().min(0),
  }),
])

export async function publicGameRoutes(app: FastifyInstance, ctx: AppContext) {
  const token = z.object({ token: z.string().min(10).max(64) })

  /** The order behind a game link, when the request carries its captain token. */
  async function captainOrder(gameToken: string, header: unknown) {
    if (typeof header !== 'string' || header.length > 64) return null
    const [order] = await ctx.db.select().from(orders).where(eq(orders.gameToken, gameToken))
    return order && isCaptainToken(order.manageToken, header) ? order : null
  }

  app.get(
    '/api/game/:token',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const p = token.safeParse(req.params)
      if (!p.success) return reply.code(404).send({ error: 'not_found' })
      const view = await getView(ctx.db, p.data.token, await getSetting(ctx.db, 'poll_seconds'))
      if (view === 'not_found') return reply.code(404).send({ error: 'not_found' })
      if (view === 'not_ready') return reply.code(409).send({ error: 'not_ready' })
      reply.header('cache-control', 'no-store')
      // The owner's text overrides ride along with the view (PlayerView itself stays unchanged).
      // The brand name setting fills the "brand" text unless player_texts overrides it.
      const texts = {
        brand: await getSetting(ctx.db, 'brand_name'),
        ...(await getSetting(ctx.db, 'player_texts')),
      }
      // The help button: who to reach on WhatsApp, and the prefilled text.
      const support = {
        whatsapp: await getSetting(ctx.db, 'support_whatsapp'),
        message: await getSetting(ctx.db, 'support_message'),
      }
      // Only the captain's phone (holding the captain token) gets the pause control.
      const captain = !!(await captainOrder(p.data.token, req.headers[CAPTAIN_HEADER]))
      return { ...view, texts, support, captain }
    },
  )

  app.post(
    '/api/game/:token/action',
    { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const p = token.safeParse(req.params)
      const body = actionSchema.safeParse(req.body)
      if (!p.success) return reply.code(404).send({ error: 'not_found' })
      if (!body.success) return reply.code(400).send({ error: 'invalid' })
      if (
        body.data.type === 'minigame_skip' &&
        !(await captainOrder(p.data.token, req.headers[CAPTAIN_HEADER]))
      )
        return reply.code(403).send({ error: 'not_captain' })
      const res = await act(
        ctx.db,
        p.data.token,
        body.data as PlayAction,
        await getSetting(ctx.db, 'poll_seconds'),
        undefined,
        ctx.services,
      )
      if (!res.ok) {
        if (res.error === 'not_found') return reply.code(404).send({ error: res.error })
        if (res.error === 'not_ready') return reply.code(409).send({ error: res.error })
        // stale / expired: return the current view so the client can catch up.
        return reply.code(409).send({ error: res.error, view: res.view })
      }
      return { view: res.view, correct: res.correct, noBackup: res.noBackup }
    },
  )

  // "עוצרים להיום": the captain pauses the game for everyone. Resuming is on the manage link.
  app.post(
    '/api/game/:token/pause',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const p = token.safeParse(req.params)
      if (!p.success) return reply.code(404).send({ error: 'not_found' })
      const order = await captainOrder(p.data.token, req.headers[CAPTAIN_HEADER])
      if (!order) return reply.code(403).send({ error: 'not_captain' })
      const res = await pauseGame(ctx.db, p.data.token, {
        pollSeconds: await getSetting(ctx.db, 'poll_seconds'),
      })
      if (!res.ok) return reply.code(res.error === 'not_found' ? 404 : 409).send({ error: res.error })
      if (res.changed) {
        try {
          await sendToBuyer(ctx.db, ctx.services, ctx.config.publicBaseUrl, order, 'game_paused', {
            stop: String(res.view.stopIndex + 1),
            total: String(res.view.totalStops),
          })
        } catch (e) {
          console.error('[pause] email failed', e)
        }
      }
      return { view: res.view }
    },
  )
}
