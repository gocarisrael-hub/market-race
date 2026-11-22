// Redraws every order photo in the live game-photo look (look.ts), with and without background
// (the latter from the stored browser cutout). New file names, so browsers holding the old drawing
// (uploads are cached for 30 days) fetch the new one; the order's photo list and its frozen game
// follow, and the old files are removed. Run once by scripts/rerender-photos.ts.
import { randomBytes } from 'node:crypto'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { orders, uploads } from '../db/schema.ts'
import { syncPhotos } from '../routes/public-photos.ts'
import { photoLook, renderGamePhoto } from './look.ts'

export async function rerenderPhotos(
  db: DB,
  uploadDir: string,
  opts: { dry?: boolean; log?: (line: string) => void } = {},
) {
  const log = opts.log ?? (() => {})
  const file = (p: string) => path.join(uploadDir, p)
  const name = () => randomBytes(12).toString('base64url')
  const rows = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.kind, 'photo'), isNotNull(uploads.orderId)))
    .orderBy(asc(uploads.id))
  const byOrder = new Map<number, (typeof rows)[number][]>()
  for (const r of rows) byOrder.set(r.orderId!, [...(byOrder.get(r.orderId!) ?? []), r])

  let done = 0
  let failed = 0
  for (const [orderId, list] of byOrder) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    if (!order) continue
    const look = await photoLook(db, order)
    const stale: string[] = []
    for (const u of list) {
      try {
        const bg = `photos/${name()}-ill.jpg`
        const bgJpg = await renderGamePhoto(await readFile(file(u.originalPath)), 'bg', u.id, look)
        let cut: string | null = null
        let cutJpg: Buffer | null = null
        if (u.cutoutPath) {
          cut = `photos/${name()}-cut-ill.jpg`
          cutJpg = await renderGamePhoto(await readFile(file(u.cutoutPath)), 'cut', u.id, look)
        }
        const shown = u.background === 'remove' && cut ? cut : bg
        log(`order ${order.orderNo} photo ${u.id}: ${u.path} -> ${shown}${opts.dry ? ' (dry)' : ''}`)
        if (opts.dry) continue
        await writeFile(file(bg), bgJpg)
        if (cut && cutJpg) await writeFile(file(cut), cutJpg)
        await db
          .update(uploads)
          .set({ bgPath: bg, path: shown, ...(cut ? { cutPath: cut } : {}) })
          .where(eq(uploads.id, u.id))
        for (const p of [u.bgPath, u.cutPath, u.path]) if (p && p !== u.originalPath) stale.push(p)
        done++
      } catch (e) {
        failed++
        log(`order ${order.orderNo} photo ${u.id} failed: ${(e as Error).message}`)
      }
    }
    if (opts.dry) continue
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
      if (fresh) await syncPhotos(tx, fresh)
    })
    for (const p of new Set(stale)) await unlink(file(p)).catch(() => {})
  }
  return { done, failed }
}
