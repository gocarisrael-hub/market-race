// The "without background" choice: Dugri's cutout logic (src/web/shared/cutout-mask.ts), the
// server's check and illustration of a cutout, and the per-photo choice route.
// tests/fixtures/dog-on-grass-cut.png is the real output of the browser cutout (MediaPipe
// selfie_multiclass, src/web/shared/cutout.ts) on tests/fixtures/dog-on-grass.jpg.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders, uploads } from '../../src/server/db/schema.ts'
import { alphaBox, checkCutout, illustrateCutout, subjectWindow } from '../../src/server/photos/illustrate.ts'
import { photoLook, renderGamePhoto } from '../../src/server/photos/look.ts'
import { rerenderPhotos } from '../../src/server/photos/rerender.ts'
import { buildOrderGame } from '../../src/server/services/orders.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { largestBlob, MIN_COVERAGE, maskToRgba, personMask } from '../../src/web/shared/cutout-mask.ts'
import { makeTestApp } from '../helpers/app.ts'

const DOG = readFileSync('tests/fixtures/dog-on-grass.jpg')
const DOG_CUT = readFileSync('tests/fixtures/dog-on-grass-cut.png')

/** Multipart body; parts are files ({ name, data, type }) or fields ({ name, value }). */
function multipart(
  parts: ({ name: string; data: Buffer; type: string } | { name: string; value: string })[],
) {
  const boundary = 'XBOUNDARY'
  const chunks: Buffer[] = []
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    if ('data' in p) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"; filename="${p.name}.bin"\r\nContent-Type: ${p.type}\r\n\r\n`,
        ),
        p.data,
        Buffer.from('\r\n'),
      )
    } else chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

describe('cutout mask (Dugri pawn-cutout rules)', () => {
  it('keeps only the largest blob', () => {
    const w = 10
    const h = 4
    const m = new Uint8Array(w * h)
    for (const i of [0, 1, 10]) m[i] = 1 // a 3-pixel speck
    for (let y = 0; y < 4; y++) for (let x = 5; x < 9; x++) m[y * w + x] = 1 // a 16-pixel subject
    const out = largestBlob(m, w, h)
    expect(out.reduce((s, v) => s + v, 0)).toBe(16)
    expect(out[0]).toBe(0)
    expect(out[5]).toBe(1)
  })

  it('treats every class but background as the subject, and misses under 2% coverage', () => {
    const w = 100
    const h = 100
    const cat = new Uint8Array(w * h)
    // hair (1), face skin (3) and clothes (4) touching: one subject.
    for (let y = 10; y < 40; y++) for (let x = 40; x < 60; x++) cat[y * w + x] = y < 20 ? 1 : y < 30 ? 3 : 4
    const mask = personMask(cat, w, h)!
    expect(mask.reduce((s, v) => s + v, 0)).toBe(600)
    const tiny = new Uint8Array(w * h)
    for (let i = 0; i < w * h * MIN_COVERAGE - 1; i++) tiny[i] = 2
    expect(personMask(tiny, w, h)).toBeNull()
  })

  it('paints the mask as white RGBA, opaque on the subject', () => {
    const rgba = maskToRgba(new Uint8Array([0, 1]), 2, 1)
    expect(Array.from(rgba)).toEqual([255, 255, 255, 0, 255, 255, 255, 255])
  })
})

describe('the cutout fixture', () => {
  it('is a transparent PNG of the dog, the shape of the original', async () => {
    const meta = await sharp(DOG_CUT).metadata()
    const orig = await sharp(DOG).metadata()
    expect(meta.format).toBe('png')
    expect(meta.hasAlpha).toBe(true)
    expect([meta.width, meta.height]).toEqual([orig.width, orig.height])
    const { data, info } = await sharp(DOG_CUT).raw().toBuffer({ resolveWithObject: true })
    const box = alphaBox(data, info.width, info.height)!
    // The dog lies in the middle of the lawn, the corners are grass.
    expect(box.x0).toBeGreaterThan(20)
    expect(box.x1).toBeLessThan(info.width - 20)
    expect(data[3]).toBe(0)
    expect(data[(info.width * info.height - 1) * 4 + 3]).toBe(0)
  })

  it('passes the server check; opaque, empty and mismatched PNGs do not', async () => {
    expect(await checkCutout(DOG_CUT, DOG)).toBeNull()
    expect(await checkCutout(await sharp(DOG).png().toBuffer(), DOG)).toBe('not_a_cutout')
    expect(await checkCutout(await sharp(DOG).ensureAlpha().png().toBuffer(), DOG)).toBe('no_subject')
    const square = await sharp(DOG_CUT).resize(300, 300, { fit: 'fill' }).png().toBuffer()
    expect(await checkCutout(square, DOG)).toBe('shape_mismatch')
    expect(await checkCutout(Buffer.from('nope'), DOG)).toBe('not_a_cutout')
  })
})

describe('illustrateCutout', () => {
  it('frames the subject on paper, 4:5, with an ink contour', async () => {
    const out = await illustrateCutout(DOG_CUT)
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width! / meta.height!).toBeCloseTo(0.8, 2)
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * 3
      return [data[i], data[i + 1], data[i + 2]]
    }
    // Corners: warm paper, not grass.
    for (const [x, y] of [
      [3, 3],
      [info.width - 4, 3],
      [3, info.height - 4],
    ]) {
      const [r, g, b] = px(x, y)
      expect(r).toBeGreaterThan(225)
      expect(g).toBeGreaterThan(215)
      expect(r).toBeGreaterThanOrEqual(b)
    }
    // Some dark ink (the contour) and some colour (the dog) are there.
    const { data: grey } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true })
    expect(grey.filter((v) => v < 80).length / grey.length).toBeGreaterThan(0.003)
    expect(grey.filter((v) => v < 200).length / grey.length).toBeGreaterThan(0.08)
  })

  it('refuses an empty cutout', async () => {
    const empty = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()
    await expect(illustrateCutout(empty)).rejects.toThrow()
  })

  it('anchors the frame to a photo edge that cut the subject', () => {
    // A head and shoulders running off the bottom of a 1000x1000 photo.
    const win = subjectWindow({ x0: 300, y0: 200, x1: 700, y1: 1000 }, 1000, 1000)
    expect(win.top + win.height).toBe(1000)
    expect(win.width / win.height).toBeCloseTo(0.8, 2)
    // A subject floating in the middle is centred.
    const mid = subjectWindow({ x0: 400, y0: 400, x1: 600, y1: 600 }, 1000, 1000)
    expect(mid.left + mid.width / 2).toBeCloseTo(500, 0)
    expect(mid.top + mid.height / 2).toBeCloseTo(500, 0)
  })
})

describe('photo background route', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let token: string
  let photoId: number
  const put = (id: number, body: Parameters<typeof multipart>[0] | Record<string, unknown>) =>
    Array.isArray(body)
      ? t.app.inject({
          method: 'PUT',
          url: `/api/orders/${token}/photos/${id}/background`,
          ...multipart(body),
        })
      : t.app.inject({ method: 'PUT', url: `/api/orders/${token}/photos/${id}/background`, payload: body })
  const file = (p: string) => path.join(t.config.uploadDir, p.replace(/^\/uploads\//, ''))

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
    const up = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart([{ name: 'file', data: DOG, type: 'image/jpeg' }]),
    })
    expect(up.statusCode).toBe(200)
    const { photo } = up.json()
    expect(photo).toMatchObject({ background: 'keep', hasCutout: false, cutFailed: false })
    photoId = photo.id
  })
  afterAll(() => t.close())

  it('cuts with the browser cutout, switches back and forth, and the game follows', async () => {
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, token))
    await buildOrderGame(t.db, o.id)
    const withBg = o.photos[0]
    expect(withBg).toMatch(/-ill\.jpg$/)

    // Without background, with a cutout: stored, illustrated, and used everywhere.
    const cut = await put(photoId, [
      { name: 'background', value: 'remove' },
      { name: 'cutout', data: DOG_CUT, type: 'image/png' },
    ])
    expect(cut.statusCode).toBe(200)
    const p = cut.json().photo
    expect(p).toMatchObject({ background: 'remove', hasCutout: true, cutFailed: false })
    expect(p.previewUrl).toMatch(/-cut-ill\.jpg$/)
    expect(existsSync(file(p.previewUrl))).toBe(true)
    // The live look, from the cutout, seeded by the photo's id.
    const look = await photoLook(t.db, o)
    expect(
      readFileSync(file(p.previewUrl)).equals(await renderGamePhoto(DOG_CUT, 'cut', photoId, look)),
    ).toBe(true)
    const [row] = await t.db.select().from(uploads).where(eq(uploads.id, photoId))
    expect(existsSync(file(row.cutoutPath!))).toBe(true)
    expect((await sharp(file(row.cutoutPath!)).metadata()).hasAlpha).toBe(true)
    let [after] = await t.db.select().from(orders).where(eq(orders.id, o.id))
    expect(after.photos).toEqual([row.cutPath])
    expect(after.game!.stops[0].photo).toBe(row.cutPath)
    expect(after.game!.letter.photos).toEqual([row.cutPath])

    // Back to the background: no cut needed, the first illustration comes back.
    const keep = await put(photoId, { background: 'keep' })
    expect(keep.json().photo).toMatchObject({ background: 'keep', hasCutout: true })
    ;[after] = await t.db.select().from(orders).where(eq(orders.id, o.id))
    expect(after.photos).toEqual([withBg])
    expect(after.game!.stops[0].photo).toBe(withBg)

    // And without again, from the stored cutout.
    const again = await put(photoId, { background: 'remove' })
    expect(again.json().photo.previewUrl).toBe(p.previewUrl)

    // The list reports the choice.
    const list = (await t.app.inject({ url: `/api/orders/${token}/photos` })).json()
    expect(list.photos[0]).toMatchObject({ background: 'remove', hasCutout: true })
  })

  it('records a cut the browser could not make and keeps the background', async () => {
    const up = await t.app.inject({
      method: 'POST',
      url: `/api/orders/${token}/photos`,
      ...multipart([{ name: 'file', data: DOG, type: 'image/jpeg' }]),
    })
    const id = up.json().photo.id
    expect((await put(id, { background: 'remove' })).json().error).toBe('no_cutout')
    const failed = await put(id, { background: 'remove', failed: true })
    expect(failed.statusCode).toBe(200)
    expect(failed.json().photo).toMatchObject({ background: 'keep', cutFailed: true, hasCutout: false })
  })

  it('refuses a cutout that is not one, or the wrong photo', async () => {
    const opaque = await put(photoId, [
      { name: 'background', value: 'remove' },
      { name: 'cutout', data: await sharp(DOG).png().toBuffer(), type: 'image/png' },
    ])
    expect(opaque.statusCode).toBe(415)
    const square = await put(photoId, [
      { name: 'background', value: 'remove' },
      { name: 'cutout', data: await sharp(DOG_CUT).resize(200, 200).png().toBuffer(), type: 'image/png' },
    ])
    expect(square.json().error).toBe('shape_mismatch')
    expect((await put(photoId, { background: 'sideways' })).statusCode).toBe(400)
    expect((await put(999999, { background: 'keep' })).statusCode).toBe(404)
  })

  it('deletes every file of a photo, and is locked once the game starts', async () => {
    const [row] = await t.db.select().from(uploads).where(eq(uploads.id, photoId))
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, token))
    await t.db.update(orders).set({ status: 'active' }).where(eq(orders.id, o.id))
    expect((await put(photoId, { background: 'keep' })).statusCode).toBe(409)
    await t.db.update(orders).set({ status: 'ready' }).where(eq(orders.id, o.id))
    const del = await t.app.inject({ method: 'DELETE', url: `/api/orders/${token}/photos/${photoId}` })
    expect(del.json().ok).toBe(true)
    for (const p of [row.originalPath, row.bgPath!, row.cutoutPath!, row.cutPath!])
      expect(existsSync(file(p))).toBe(false)
  })
})

describe('redrawing existing photos', () => {
  it('redraws both versions under new names, and the order and its game follow', async () => {
    const t = await makeTestApp()
    try {
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
      const tok = res.json().manageToken
      const up = async () =>
        (
          await t.app.inject({
            method: 'POST',
            url: `/api/orders/${tok}/photos`,
            ...multipart([{ name: 'file', data: DOG, type: 'image/jpeg' }]),
          })
        ).json().photo.id as number
      const [kept, cut] = [await up(), await up()]
      await t.app.inject({
        method: 'PUT',
        url: `/api/orders/${tok}/photos/${cut}/background`,
        ...multipart([
          { name: 'background', value: 'remove' },
          { name: 'cutout', data: DOG_CUT, type: 'image/png' },
        ]),
      })
      const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, tok))
      await buildOrderGame(t.db, o.id)
      const before = await t.db.select().from(uploads).where(eq(uploads.orderId, o.id))
      const file = (p: string) => path.join(t.config.uploadDir, p)

      const dry = await rerenderPhotos(t.db, t.config.uploadDir, { dry: true })
      expect(dry.failed).toBe(0)
      expect(await t.db.select().from(uploads).where(eq(uploads.orderId, o.id))).toEqual(before)

      const r = await rerenderPhotos(t.db, t.config.uploadDir)
      expect(r).toEqual({ done: 2, failed: 0 })
      const after = await t.db.select().from(uploads).where(eq(uploads.orderId, o.id))
      const look = await photoLook(t.db, (await t.db.select().from(orders).where(eq(orders.id, o.id)))[0])
      for (const u of after) {
        const old = before.find((b) => b.id === u.id)!
        expect(u.bgPath).not.toBe(old.bgPath)
        expect(existsSync(file(old.bgPath!))).toBe(false)
        const original = readFileSync(file(u.originalPath))
        expect(readFileSync(file(u.bgPath!)).equals(await renderGamePhoto(original, 'bg', u.id, look))).toBe(
          true,
        )
      }
      const k = after.find((u) => u.id === kept)!
      const c = after.find((u) => u.id === cut)!
      expect(k.path).toBe(k.bgPath)
      expect(c.path).toBe(c.cutPath)
      expect(c.cutPath).not.toBe(before.find((b) => b.id === cut)!.cutPath)
      const cutout = readFileSync(file(c.cutoutPath!))
      expect(readFileSync(file(c.cutPath!)).equals(await renderGamePhoto(cutout, 'cut', cut, look))).toBe(
        true,
      )
      const [o2] = await t.db.select().from(orders).where(eq(orders.id, o.id))
      expect(o2.photos).toEqual([k.path, c.path])
      expect(o2.game!.letter.photos).toEqual([k.path, c.path])
    } finally {
      await t.close()
    }
  })
})

describe('vendored cutout runtime', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  beforeAll(async () => {
    t = await makeTestApp()
  })
  afterAll(() => t.close())

  it('ships every file and serves the wasm brotli-compressed', async () => {
    for (const f of [
      'vision_bundle.mjs',
      'vision_wasm_internal.js',
      'selfie_multiclass_256x256.tflite',
      'LICENSE',
    ])
      expect(existsSync(path.join('vendor/mediapipe', f))).toBe(true)
    const br = await t.app.inject({
      url: '/vendor/mediapipe/vision_wasm_internal.wasm',
      headers: { 'accept-encoding': 'gzip, br' },
    })
    expect(br.statusCode).toBe(200)
    expect(br.headers['content-encoding']).toBe('br')
    expect(br.headers['content-type']).toBe('application/wasm')
    const plain = await t.app.inject({ url: '/vendor/mediapipe/vision_wasm_internal.wasm' })
    expect(plain.headers['content-encoding']).toBeUndefined()
    expect(plain.rawPayload.subarray(0, 4)).toEqual(Buffer.from([0, 0x61, 0x73, 0x6d]))
    const mjs = await t.app.inject({ url: '/vendor/mediapipe/vision_bundle.mjs' })
    expect(mjs.headers['content-type']).toMatch(/javascript/)
    expect((await t.app.inject({ url: '/vendor/mediapipe/..%2Fpackage.json' })).statusCode).toBe(404)
    expect((await t.app.inject({ url: '/vendor/mediapipe/README.md' })).statusCode).toBe(404)
  })
})
