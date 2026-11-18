// Player API, addressed by the game token. Public.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import { act, getView, type PlayAction } from '../services/play.ts'
import { getSetting } from '../services/settings.ts'

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
])

export async function publicGameRoutes(app: FastifyInstance, ctx: AppContext) {
  const token = z.object({ token: z.string().min(10).max(64) })

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
      return { ...view, texts, support }
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
}
