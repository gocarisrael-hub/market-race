import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders } from '../../src/server/db/schema.ts'
import { illustrate } from '../../src/server/photos/illustrate.ts'
import { photoLook, renderGamePhoto } from '../../src/server/photos/look.ts'
import { buildOrderGame } from '../../src/server/services/orders.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

async function testPng(w = 240, h = 300) {
  // A two-tone image with a hard edge, so outlines have something to find.
  const left = await sharp({ create: { width: w / 2, height: h, channels: 3, background: '#3a7bd5' } })
    .png()
    .toBuffer()
  return sharp({ create: { width: w, height: h, channels: 3, background: '#f2c94c' } })
    .composite([{ input: left, left: 0, top: 0 }])
    .png()
    .toBuffer()
}

function multipart(buf: Buffer, type: string, name = 'p.png') {
  const boundary = 'XBOUNDARY'
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`
  return {
    payload: Buffer.concat([Buffer.from(head), buf, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

describe('illustrate', () => {
  it('returns a 4:5 JPEG with dark ink along the edge', async () => {
    const out = await illustrate(await testPng())
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect([meta.width, meta.height]).toEqual([240, 300])
    const { data, info } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true })
    const at = (x: number, y: number) => data[y * info.width + x]
    expect(at(120, 150)).toBeLessThan(at(60, 150))
    expect(at(120, 150)).toBeLessThan(at(180, 150))
  })

  it('crops landscape and tall photos to a 4:5 portrait, never enlarging', async () => {
    for (const [w, h] of [
      [1600, 900],
      [600, 1400],
      [100, 80],
    ]) {
      const meta = await sharp(await illustrate(await testPng(w, h))).metadata()
      expect(meta.width! / meta.height!).toBeCloseTo(0.8, 1)
      expect(meta.height).toBeLessThanOrEqual(Math.min(h, 1000))
    }
    const big = await sharp(await illustrate(await testPng(3000, 4000))).metadata()
    expect([big.width, big.height]).toEqual([800, 1000])
  })

  it('keeps busy textures (grass, gravel) mostly free of ink specks', async () => {
    // Random high-frequency noise around a mid green: a texture, not a subject.
    const w = 400
    const h = 500
    const px = Buffer.alloc(w * h * 3)
    let r = 42
    for (let i = 0; i < w * h; i++) {
      r = (r * 1103515245 + 12345) & 0x7fffffff
      const n = (r % 90) - 45
      px[i * 3] = 70 + n
      px[i * 3 + 1] = 140 + n
      px[i * 3 + 2] = 60 + n
    }
    const noise = await sharp(px, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer()
    const out = await illustrate(noise)
    const { data } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true })
    const inked = data.filter((v) => v < 60).length / data.length
    expect(inked).toBeLessThan(0.01)
  })

  it('paints on a warm paper tone', async () => {
    const white = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer()
    const { data } = await sharp(await illustrate(white))
      .raw()
      .toBuffer({ resolveWithObject: true })
    let red = 0
    let blue = 0
    for (let i = 0; i < data.length; i += 3) {
      red += data[i]
      blue += data[i + 2]
    }
    expect(red / blue).toBeGreaterThan(1.02)
  })
})

describe('photo upload', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let token: string
  beforeAll(async () => {
    t = await makeTestApp()
    const ids = await seedDemo(t.db)
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        occasionKey: 'birthday_friend',
        form: 'he',
        honoreeName: 'דני',
        themeId: ids.carmelThemeId,
        people: 3,
        buyer: { name: 'רון', phone: '0501234567', email: 'ron@example.com' },
      },
    })
    token = res.json().manageToken
  })
  afterAll(() => t.close())

  it('converts, stores, lists and deletes photos, up to five', async () => {
    const png = await testPng()
    const up = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart(png, 'image/png'),
    })
    expect(up.statusCode).toBe(200)
    const { photo } = up.json()
    expect(photo.previewUrl).toMatch(/^\/uploads\/photos\/.+-ill\.jpg$/)
    expect(existsSync(path.join(t.config.uploadDir, photo.previewUrl.slice('/uploads/'.length)))).toBe(true)
    const served = await t.app.inject({ url: photo.previewUrl })
    expect(served.statusCode).toBe(200)
    // Drawn in the live look (the doodle frame), seeded by the photo's id, in the order's look.
    const [ord] = await t.db.select().from(orders).where(eq(orders.manageToken, token))
    const look = await photoLook(t.db, ord)
    expect(look.decor).not.toBe('')
    const original = readFileSync(path.join(t.config.uploadDir, photo.url.slice('/uploads/'.length)))
    const expected = await renderGamePhoto(original, 'bg', photo.id, look)
    expect(served.rawPayload.equals(expected)).toBe(true)

    for (let i = 0; i < 4; i++)
      await t.app.inject({
        method: 'POST',
        url: `/api/orders/${token}/photos`,
        ...multipart(png, 'image/png'),
      })
    const sixth = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart(png, 'image/png'),
    })
    expect(sixth.json().error).toBe('too_many')

    const list = await t.app.inject({ url: `/api/orders/${token}/photos` })
    expect(list.json().photos).toHaveLength(5)
    const del = await t.app.inject({ method: 'DELETE', url: `/api/orders/${token}/photos/${photo.id}` })
    expect(del.json().ok).toBe(true)
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, token))
    expect(o.photos).toHaveLength(4)
    expect(o.photos).not.toContain(photo.previewUrl.slice('/uploads/'.length))
  })

  it('rejects other types and broken images', async () => {
    const gif = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart(Buffer.from('GIF89a'), 'image/gif'),
    })
    expect(gif.statusCode).toBe(415)
    const junk = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart(Buffer.from('not an image'), 'image/jpeg'),
    })
    expect(junk.json().error).toBe('unreadable_image')
  })

  it('puts photos into riddles and the letter, and keeps them editable until the game starts', async () => {
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, token))
    const built = await buildOrderGame(t.db, o.id)
    expect(['ready', 'review']).toContain(built.status)
    expect(built.game!.stops[0].photo).toBe(o.photos[0])
    expect(built.game!.letter.photos).toEqual(o.photos)

    // Built but not started: a new photo goes into the frozen game, on the next riddle stop.
    const late = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart(await testPng(), 'image/png'),
    })
    expect(late.statusCode).toBe(200)
    const [after] = await t.db.select().from(orders).where(eq(orders.id, o.id))
    expect(after.photos).toHaveLength(5)
    expect(after.game!.letter.photos).toEqual(after.photos)
    expect(after.game!.stops.filter((s) => !s.finale).map((s) => s.photo)).toEqual(
      after.photos.slice(0, after.game!.stops.length - 1),
    )
    expect(after.game!.stops.at(-1)!.photo).toBeNull()

    // Removing one shifts the rest in the game too.
    const list = (await t.app.inject({ url: `/api/orders/${token}/photos` })).json()
    expect(list.paid).toBe(false)
    expect(list.editable).toBe(true)
    await t.app.inject({ method: 'DELETE', url: `/api/orders/${token}/photos/${list.photos[0].id}` })
    const [shifted] = await t.db.select().from(orders).where(eq(orders.id, o.id))
    expect(shifted.game!.stops[0].photo).toBe(after.photos[1])
    expect(shifted.game!.letter.photos).toEqual(after.photos.slice(1))

    // Started: locked.
    await t.db.update(orders).set({ status: 'active' }).where(eq(orders.id, o.id))
    const locked = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart(await testPng(), 'image/png'),
    })
    expect(locked.statusCode).toBe(409)
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/orders/${token}/photos/${list.photos[1].id}`,
    })
    expect(del.statusCode).toBe(409)
    const manage = (await t.app.inject({ url: `/api/manage/${token}` })).json()
    expect(manage.photos).toEqual({ count: 4, editable: false })
  })

  it('keeps every photo when several upload at once', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        occasionKey: 'birthday_friend',
        form: 'he',
        honoreeName: 'דני',
        themeId: (await t.db.select().from(orders))[0].themeId,
        people: 3,
      },
    })
    const tok = res.json().manageToken
    const png = await testPng()
    const ups = await Promise.all(
      [0, 1, 2].map(() =>
        t.app.inject({ method: 'POST', url: `/api/orders/${tok}/photos`, ...multipart(png, 'image/png') }),
      ),
    )
    expect(ups.map((u) => u.statusCode)).toEqual([200, 200, 200])
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, tok))
    expect(o.photos).toHaveLength(3)
    expect(new Set(o.photos).size).toBe(3)
    const manage = (await t.app.inject({ url: `/api/manage/${tok}` })).json()
    expect(manage.photos).toEqual({ count: 3, editable: true })
  })
})

describe('transparent photos', () => {
  it('turn transparent areas into paper, not black', async () => {
    const png = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()
    const out = await illustrate(png)
    const { data } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true })
    const mean = data.reduce((s, v) => s + v, 0) / data.length
    expect(mean).toBeGreaterThan(200)
  })
})
