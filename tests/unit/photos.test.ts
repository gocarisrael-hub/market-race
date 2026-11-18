import { existsSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders } from '../../src/server/db/schema.ts'
import { illustrate } from '../../src/server/photos/illustrate.ts'
import { buildOrderGame } from '../../src/server/services/orders.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

async function testPng(w = 320, h = 240) {
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
  it('returns a JPEG of the same aspect, with dark ink along the edge', async () => {
    const out = await illustrate(await testPng())
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect([meta.width, meta.height]).toEqual([320, 240])
    const { data, info } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true })
    const at = (x: number, y: number) => data[y * info.width + x]
    expect(at(160, 120)).toBeLessThan(at(80, 120))
    expect(at(160, 120)).toBeLessThan(at(240, 120))
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

  it('puts photos into riddles and the letter, and locks them once the game is built', async () => {
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, token))
    const built = await buildOrderGame(t.db, o.id)
    expect(built.game!.stops[0].photo).toBe(o.photos[0])
    expect(built.game!.letter.photos).toEqual(o.photos)
    const late = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart(await testPng(), 'image/png'),
    })
    expect(late.statusCode).toBe(409)
  })
})
