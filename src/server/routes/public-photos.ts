// Order photos (up to 5): uploaded by the buyer via the manage token, converted to the
// illustrated style, used in riddles and the final letter. Stored on the volume.
import { randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import { orders, uploads } from '../db/schema.ts'
import { illustrate, normalizePhoto } from '../photos/illustrate.ts'

export const MAX_PHOTOS = 5
const EDITABLE = ['pending_payment', 'awaiting_answers', 'quoted', 'review']
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function publicPhotoRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx
  const params = z.object({ token: z.string().min(10).max(64) })
  const view = (u: typeof uploads.$inferSelect) => ({
    id: u.id,
    url: `/uploads/${u.originalPath}`,
    previewUrl: `/uploads/${u.path}`,
  })
  const findOrder = async (token: string) =>
    (await db.select().from(orders).where(eq(orders.manageToken, token)))[0]

  app.get('/api/orders/:token/photos', async (req, reply) => {
    const { token } = params.parse(req.params)
    const order = await findOrder(token)
    if (!order) return reply.code(404).send({ error: 'not_found' })
    const rows = await db
      .select()
      .from(uploads)
      .where(and(eq(uploads.orderId, order.id), eq(uploads.kind, 'photo')))
    return { photos: rows.map(view) }
  })

  app.post(
    '/api/orders/:token/photos',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token } = params.parse(req.params)
      const order = await findOrder(token)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (!EDITABLE.includes(order.status) || order.game) return reply.code(409).send({ error: 'locked' })
      const existing = await db
        .select({ id: uploads.id })
        .from(uploads)
        .where(and(eq(uploads.orderId, order.id), eq(uploads.kind, 'photo')))
      if (existing.length >= MAX_PHOTOS) return reply.code(400).send({ error: 'too_many' })
      const file = await req.file()
      if (!file) return reply.code(400).send({ error: 'no_file' })
      if (!ACCEPTED.has(file.mimetype)) return reply.code(415).send({ error: 'unsupported_type' })
      const raw = await file.toBuffer()
      let original: Buffer
      let ill: Buffer
      try {
        original = await normalizePhoto(raw)
        ill = await illustrate(original)
      } catch {
        return reply.code(415).send({ error: 'unreadable_image' })
      }
      const name = randomBytes(12).toString('base64url')
      const rel = { original: `photos/${name}.jpg`, ill: `photos/${name}-ill.jpg` }
      await mkdir(path.join(config.uploadDir, 'photos'), { recursive: true })
      await writeFile(path.join(config.uploadDir, rel.original), original)
      await writeFile(path.join(config.uploadDir, rel.ill), ill)
      const [row] = await db
        .insert(uploads)
        .values({ orderId: order.id, kind: 'photo', originalPath: rel.original, path: rel.ill })
        .returning()
      await db
        .update(orders)
        .set({ photos: [...order.photos, rel.ill] })
        .where(eq(orders.id, order.id))
      return { photo: view(row) }
    },
  )

  app.delete('/api/orders/:token/photos/:id', async (req, reply) => {
    const { token, id } = params.extend({ id: z.coerce.number().int() }).parse(req.params)
    const order = await findOrder(token)
    if (!order) return reply.code(404).send({ error: 'not_found' })
    if (!EDITABLE.includes(order.status) || order.game) return reply.code(409).send({ error: 'locked' })
    const [row] = await db
      .delete(uploads)
      .where(and(eq(uploads.id, id), eq(uploads.orderId, order.id), eq(uploads.kind, 'photo')))
      .returning()
    if (!row) return reply.code(404).send({ error: 'not_found' })
    await db
      .update(orders)
      .set({ photos: order.photos.filter((p) => p !== row.path) })
      .where(eq(orders.id, order.id))
    for (const p of [row.path, row.originalPath]) await unlink(path.join(config.uploadDir, p)).catch(() => {})
    return { ok: true }
  })
}
