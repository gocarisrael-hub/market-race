import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import { login, logout, requireOwner, SESSION_COOKIE } from '../lib/auth.ts'

export async function adminAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  const secure = ctx.config.env === 'production' || ctx.config.env === 'staging'

  app.post(
    '/admin/api/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid' })
      const token = await login(ctx.db, body.data.email, body.data.password)
      if (!token) return reply.code(401).send({ error: 'wrong_credentials' })
      reply.setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure,
        maxAge: 30 * 86400,
      })
      return { ok: true }
    },
  )

  app.post('/admin/api/logout', async (req, reply) => {
    await logout(ctx.db, req.cookies[SESSION_COOKIE])
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/admin/api/me', { preHandler: requireOwner(ctx.db) }, async (req) => ({ owner: req.owner }))
}
