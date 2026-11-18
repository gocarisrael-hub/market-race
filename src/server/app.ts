// Builds the Fastify app. Used by the server entry and by tests (app.inject).
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import type { Config } from './config.ts'
import type { DB } from './db/index.ts'
import { adminAuthRoutes } from './routes/admin-auth.ts'
import { adminCatalogRoutes } from './routes/admin-catalog.ts'
import { adminOrderRoutes } from './routes/admin-orders.ts'
import { publicGameRoutes } from './routes/public-game.ts'
import { publicOrderRoutes } from './routes/public-orders.ts'
import { publicPhotoRoutes } from './routes/public-photos.ts'
import type { Services } from './services/context.ts'
import type { PaymentSweeper } from './services/payments.ts'

export interface AppContext {
  db: DB
  config: Config
  services: Services
  sweeper?: PaymentSweeper | null
}

const root = fileURLToPath(new URL('../..', import.meta.url))
const webDist = path.join(root, 'dist/web')

export async function buildApp(ctx: AppContext) {
  const app = Fastify({
    logger: ctx.config.env === 'test' ? false : { level: 'info' },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  })

  await app.register(cookie)
  await app.register(formbody)
  await app.register(rateLimit, { global: false })
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 5 } })
  await mkdir(ctx.config.uploadDir, { recursive: true })

  app.get('/healthz', async () => ({ ok: true, env: ctx.config.env }))

  await adminAuthRoutes(app, ctx)
  await adminCatalogRoutes(app, ctx)
  await adminOrderRoutes(app, ctx)
  await publicGameRoutes(app, ctx)
  await publicOrderRoutes(app, ctx)
  await publicPhotoRoutes(app, ctx)

  // Illustrations shipped with the code (maps, icons).
  await app.register(fastifyStatic, {
    root: path.join(root, 'assets'),
    prefix: '/static/',
    decorateReply: false,
    maxAge: '7d',
  })
  // Uploaded files on the Railway volume. File names are random, never guessable.
  await app.register(fastifyStatic, {
    root: path.resolve(ctx.config.uploadDir),
    prefix: '/uploads/',
    decorateReply: false,
    maxAge: '30d',
  })

  // Built web bundles (player, site, admin), with SPA fallbacks.
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false })
    app.setNotFoundHandler((req, reply) => {
      const url = req.url
      if (url.startsWith('/api/') || url.startsWith('/admin/api/')) {
        return reply.code(404).send({ error: 'not_found' })
      }
      if (req.method !== 'GET') return reply.code(404).send({ error: 'not_found' })
      if (url.startsWith('/admin')) return reply.sendFile('admin/index.html')
      if (url.startsWith('/g/')) return reply.sendFile('player/index.html')
      return reply.sendFile('site/index.html')
    })
  }

  return app
}
