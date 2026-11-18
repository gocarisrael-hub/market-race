// Order photos (up to 5): uploaded by the buyer via the manage token, converted to the
// illustrated style, used in riddles and the final letter. Stored on the volume.
// Photos can change until the game starts: a built game that has not started gets the new photos
// in its frozen snapshot (riddles and letter), without being rebuilt from the catalog.
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { and, asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import type { DB } from '../db/index.ts'
import { orders, uploads } from '../db/schema.ts'
import { attachPhotos, MAX_GAME_PHOTOS } from '../domain/builder.ts'
import { type OrderStatus, PHOTO_BACKGROUNDS } from '../domain/types.ts'
import { checkCutout, illustrate, illustrateCutout, normalizePhoto } from '../photos/illustrate.ts'

export const MAX_PHOTOS = MAX_GAME_PHOTOS
/** Statuses before the game starts. Later, a game in play or done keeps its photos. */
export const PHOTOS_EDITABLE: OrderStatus[] = [
  'pending_payment',
  'awaiting_answers',
  'quoted',
  'review',
  'ready',
]
const editable = (o: { status: OrderStatus }) => PHOTOS_EDITABLE.includes(o.status)

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

/**
 * Writes the order's photo list from its uploads (the source of truth, in upload order) and, when
 * the game is already built, into the frozen game. Runs inside the caller's transaction, after the
 * order row was locked, so concurrent uploads never lose each other.
 */
async function syncPhotos(tx: Tx, order: typeof orders.$inferSelect) {
  const rows = await tx
    .select({ path: uploads.path })
    .from(uploads)
    .where(and(eq(uploads.orderId, order.id), eq(uploads.kind, 'photo')))
    .orderBy(asc(uploads.id))
  const photos = rows.map((r) => r.path)
  await tx
    .update(orders)
    .set({ photos, ...(order.game ? { game: attachPhotos(order.game, photos) } : {}) })
    .where(eq(orders.id, order.id))
}

async function lockOrder(tx: Tx, id: number) {
  return (await tx.select().from(orders).where(eq(orders.id, id)).for('update'))[0]
}
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function publicPhotoRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx
  const params = z.object({ token: z.string().min(10).max(64) })
  const view = (u: typeof uploads.$inferSelect) => ({
    id: u.id,
    url: `/uploads/${u.originalPath}`,
    previewUrl: `/uploads/${u.path}`,
    background: u.background,
    hasCutout: !!u.cutPath,
    cutFailed: u.cutFailed,
  })
  const unlinkAll = async (paths: (string | null)[]) => {
    for (const p of new Set(paths)) if (p) await unlink(path.join(config.uploadDir, p)).catch(() => {})
  }
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
      .orderBy(asc(uploads.id))
    return { photos: rows.map(view), paid: !!order.paidAt, editable: editable(order) }
  })

  app.post(
    '/api/orders/:token/photos',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token } = params.parse(req.params)
      const order = await findOrder(token)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (!editable(order)) return reply.code(409).send({ error: 'locked' })
      if (order.photos.length >= MAX_PHOTOS) return reply.code(400).send({ error: 'too_many' })
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
      // Converting takes a moment: re-check under the lock (the game may have started meanwhile,
      // or another upload filled the last place).
      const result = await db.transaction(async (tx) => {
        const fresh = await lockOrder(tx, order.id)
        if (!fresh || !editable(fresh)) return 'locked' as const
        const n = await tx
          .select({ id: uploads.id })
          .from(uploads)
          .where(and(eq(uploads.orderId, order.id), eq(uploads.kind, 'photo')))
        if (n.length >= MAX_PHOTOS) return 'too_many' as const
        const [row] = await tx
          .insert(uploads)
          .values({
            orderId: order.id,
            kind: 'photo',
            originalPath: rel.original,
            path: rel.ill,
            bgPath: rel.ill,
          })
          .returning()
        await syncPhotos(tx, fresh)
        return row
      })
      if (typeof result === 'string') {
        for (const p of [rel.original, rel.ill]) await unlink(path.join(config.uploadDir, p)).catch(() => {})
        return reply.code(result === 'locked' ? 409 : 400).send({ error: result })
      }
      const row = result
      return { photo: view(row) }
    },
  )

  app.delete('/api/orders/:token/photos/:id', async (req, reply) => {
    const { token, id } = params.extend({ id: z.coerce.number().int() }).parse(req.params)
    const order = await findOrder(token)
    if (!order) return reply.code(404).send({ error: 'not_found' })
    if (!editable(order)) return reply.code(409).send({ error: 'locked' })
    const row = await db.transaction(async (tx) => {
      const fresh = await lockOrder(tx, order.id)
      if (!fresh || !editable(fresh)) return 'locked' as const
      const [deleted] = await tx
        .delete(uploads)
        .where(and(eq(uploads.id, id), eq(uploads.orderId, order.id), eq(uploads.kind, 'photo')))
        .returning()
      if (deleted) await syncPhotos(tx, fresh)
      return deleted
    })
    if (row === 'locked') return reply.code(409).send({ error: 'locked' })
    if (!row) return reply.code(404).send({ error: 'not_found' })
    await unlinkAll([row.path, row.originalPath, row.bgPath, row.cutoutPath, row.cutPath])
    return { ok: true }
  })

  // The buyer's choice for one photo: keep its background, or cut the subject out. The cut is
  // made in the buyer's browser (src/web/shared/cutout.ts) and sent here as a transparent PNG
  // (multipart part "cutout"); once stored, switching back and forth needs no new cut. A cut the
  // browser could not make arrives as `failed`: recorded, and the photo keeps its background.
  const choice = z.object({
    background: z.enum(PHOTO_BACKGROUNDS),
    failed: z.union([z.boolean(), z.enum(['1', 'true'])]).optional(),
  })
  app.put(
    '/api/orders/:token/photos/:id/background',
    { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token, id } = params.extend({ id: z.coerce.number().int() }).parse(req.params)
      const order = await findOrder(token)
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (!editable(order)) return reply.code(409).send({ error: 'locked' })
      const fields: Record<string, string> = {}
      let cutout: Buffer | null = null
      if (req.isMultipart()) {
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            if (part.fieldname === 'cutout') cutout = await part.toBuffer()
            else await part.toBuffer()
          } else fields[part.fieldname] = String(part.value)
        }
      }
      const parsed = choice.safeParse(req.isMultipart() ? fields : req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid' })
      const { background } = parsed.data
      const failed =
        parsed.data.failed === true || parsed.data.failed === '1' || parsed.data.failed === 'true'
      const [row] = await db
        .select()
        .from(uploads)
        .where(and(eq(uploads.id, id), eq(uploads.orderId, order.id), eq(uploads.kind, 'photo')))
      if (!row) return reply.code(404).send({ error: 'not_found' })

      // A new cutout: check it against the original, store it and its illustration.
      let fresh: { cutoutPath: string; cutPath: string } | null = null
      if (background === 'remove' && cutout) {
        let original: Buffer
        try {
          original = await readFile(path.join(config.uploadDir, row.originalPath))
        } catch {
          return reply.code(409).send({ error: 'original_missing' })
        }
        const refused = await checkCutout(cutout, original)
        if (refused) return reply.code(415).send({ error: refused })
        let ill: Buffer
        try {
          ill = await illustrateCutout(cutout)
        } catch {
          return reply.code(415).send({ error: 'no_subject' })
        }
        const name = randomBytes(12).toString('base64url')
        fresh = { cutoutPath: `photos/${name}-cut.png`, cutPath: `photos/${name}-cut-ill.jpg` }
        await mkdir(path.join(config.uploadDir, 'photos'), { recursive: true })
        await writeFile(path.join(config.uploadDir, fresh.cutoutPath), cutout)
        await writeFile(path.join(config.uploadDir, fresh.cutPath), ill)
      }

      const result = await db.transaction(async (tx) => {
        const lockedOrder = await lockOrder(tx, order.id)
        if (!lockedOrder || !editable(lockedOrder)) return 'locked' as const
        const [cur] = await tx
          .select()
          .from(uploads)
          .where(and(eq(uploads.id, id), eq(uploads.orderId, order.id), eq(uploads.kind, 'photo')))
          .for('update')
        if (!cur) return 'not_found' as const
        // Rows from before the choice have no bgPath: their `path` is the with-background one.
        const bgPath = cur.bgPath ?? (cur.background === 'keep' ? cur.path : cur.originalPath)
        const cutPath = fresh?.cutPath ?? cur.cutPath
        let set: Partial<typeof uploads.$inferInsert>
        if (background === 'keep') set = { background: 'keep', path: bgPath, bgPath }
        else if (cutPath)
          set = {
            background: 'remove',
            path: cutPath,
            bgPath,
            cutFailed: false,
            ...(fresh ? { cutoutPath: fresh.cutoutPath, cutPath: fresh.cutPath } : {}),
          }
        else if (failed) set = { background: 'keep', path: bgPath, bgPath, cutFailed: true }
        else return 'no_cutout' as const
        const [updated] = await tx.update(uploads).set(set).where(eq(uploads.id, cur.id)).returning()
        await syncPhotos(tx, lockedOrder)
        return { updated, replaced: fresh ? [cur.cutoutPath, cur.cutPath] : [] }
      })
      if (typeof result === 'string') {
        if (fresh) await unlinkAll([fresh.cutoutPath, fresh.cutPath])
        const code = result === 'locked' ? 409 : result === 'not_found' ? 404 : 400
        return reply.code(code).send({ error: result })
      }
      await unlinkAll(result.replaced)
      return { photo: view(result.updated) }
    },
  )
}
