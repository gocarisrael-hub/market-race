import { existsSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { markets, stalls } from '../../src/server/db/schema.ts'
import { dailyCode } from '../../src/server/domain/dailycode.ts'
import { israelDate } from '../../src/server/domain/dates.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

type T = Awaited<ReturnType<typeof makeTestApp>>
const BASE = '/admin/api/catalog'

function multipart(field: string, filename: string, type: string, data: Buffer) {
  const boundary = '----mrtest'
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

describe('admin catalog API', () => {
  let t: T
  let cookie: string
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    t.app.inject({ method, url: BASE + url, headers: { cookie }, payload: payload as object })

  let marketId: number
  let otherMarketId: number
  let stallA: number
  let stallB: number
  let stallOther: number
  let tastingA: number
  let tastingB: number
  let riddleA: number
  let riddleB: number
  let questionSetId: number

  beforeAll(async () => {
    t = await makeTestApp()
    cookie = await ownerCookie(t.app)
  })
  afterAll(() => t.close())

  it('rejects every catalog route without a session', async () => {
    for (const url of ['/markets', '/stalls', '/tastings', '/riddles', '/routes', '/themes', '/settings']) {
      const res = await t.app.inject({ url: BASE + url })
      expect(res.statusCode, url).toBe(401)
    }
    const post = await t.app.inject({ method: 'POST', url: `${BASE}/markets`, payload: { name: 'x' } })
    expect(post.statusCode).toBe(401)
  })

  it('creates and updates markets without exposing the code secret', async () => {
    const res = await call('POST', '/markets', {
      name: 'שוק הכרמל',
      hours: { 0: { open: '08:00', close: '18:00' }, 5: { open: '08:00', close: '14:00' } },
    })
    expect(res.statusCode).toBe(201)
    const m = res.json()
    expect(m).not.toHaveProperty('codeSecret')
    expect(m.active).toBe(true)
    marketId = m.id
    const [row] = await t.db.select().from(markets).where(eq(markets.id, marketId))
    expect(row.codeSecret.length).toBeGreaterThan(20)

    const upd = await call('PATCH', `/markets/${marketId}`, { name: 'הכרמל', active: false })
    expect(upd.json()).toMatchObject({ name: 'הכרמל', active: false })
    await call('PATCH', `/markets/${marketId}`, { active: true })

    const bad = await call('POST', '/markets', { name: 'x', hours: { 1: { open: '8am', close: '18:00' } } })
    expect(bad.statusCode).toBe(400)

    otherMarketId = (await call('POST', '/markets', { name: 'מחנה יהודה' })).json().id
    const list = await call('GET', '/markets')
    expect(list.json().items.map((x: { id: number }) => x.id)).toEqual([marketId, otherMarketId])
    expect(list.json().items[0]).not.toHaveProperty('codeSecret')
  })

  it('returns the daily codes for a month', async () => {
    const res = await call('GET', `/markets/${marketId}/codes?month=2026-02`)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.days).toHaveLength(28)
    const [row] = await t.db.select().from(markets).where(eq(markets.id, marketId))
    expect(body.days[0]).toEqual({
      date: '2026-02-01',
      weekday: 0,
      code: dailyCode(row.codeSecret, '2026-02-01'),
    })
    expect((await call('GET', `/markets/${marketId}/codes?month=2026-13`)).statusCode).toBe(400)
    expect((await call('GET', '/markets/9999/codes?month=2026-01')).statusCode).toBe(404)
  })

  it('creates stalls and toggles closed today', async () => {
    const res = await call('POST', '/stalls', { marketId, name: 'המיצים של תקווה', locationHint: 'בכניסה' })
    expect(res.statusCode).toBe(201)
    expect(res.json().closedToday).toBe(false)
    stallA = res.json().id
    stallB = (await call('POST', '/stalls', { marketId, name: 'המאפייה' })).json().id
    stallOther = (await call('POST', '/stalls', { marketId: otherMarketId, name: 'בירה' })).json().id

    const closed = await call('PATCH', `/stalls/${stallA}`, { closedToday: true, closedNote: 'חופש' })
    expect(closed.json()).toMatchObject({ closedToday: true, closedOn: israelDate(), closedNote: 'חופש' })
    const open = await call('PATCH', `/stalls/${stallA}`, { closedToday: false })
    expect(open.json()).toMatchObject({ closedToday: false, closedOn: null })

    // A closed flag from another day is not "closed today".
    await t.db.update(stalls).set({ closedOn: '2020-01-01' }).where(eq(stalls.id, stallB))
    const list = (await call('GET', `/stalls?marketId=${marketId}`)).json().items
    expect(list).toHaveLength(2)
    expect(list.find((s: { id: number }) => s.id === stallB).closedToday).toBe(false)

    expect((await call('POST', '/stalls', { marketId: 9999, name: 'x' })).statusCode).toBe(400)
    expect((await call('PATCH', '/stalls/9999', { name: 'x' })).statusCode).toBe(404)
  })

  it('creates tastings and rejects allergens outside the fixed list', async () => {
    const res = await call('POST', '/tastings', {
      stallId: stallA,
      name: 'מיץ תפוזים',
      allergens: [],
      diets: ['vegan'],
      feeAgorot: 850,
    })
    expect(res.statusCode).toBe(201)
    tastingA = res.json().id
    tastingB = (
      await call('POST', '/tastings', { stallId: stallB, name: "ג'חנון", allergens: ['גלוטן'] })
    ).json().id

    const bad = await call('POST', '/tastings', { stallId: stallA, name: 'x', allergens: ['קטשופ'] })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().issues[0].path).toBe('allergens.0')
    expect(
      (await call('POST', '/tastings', { stallId: stallA, name: 'x', diets: ['keto'] })).statusCode,
    ).toBe(400)
    expect((await call('POST', '/tastings', { stallId: stallA, name: 'x', feeAgorot: 1.5 })).statusCode).toBe(
      400,
    )

    const upd = await call('PATCH', `/tastings/${tastingA}`, { feeAgorot: 900, allergens: ['חלב'] })
    expect(upd.json()).toMatchObject({ feeAgorot: 900, allergens: ['חלב'] })
  })

  it('creates and updates question sets', async () => {
    const questions = [
      { slot: 'name', text: { she: 'איך קוראים לה?' }, required: true, fallback: '', maxLen: 30 },
      {
        slot: 'one_word',
        text: { she: 'מילה אחת', he: 'מילה אחת' },
        required: false,
        fallback: { she: 'רכה', he: 'רך' },
        maxLen: 20,
      },
    ]
    const res = await call('POST', '/question-sets', { name: 'רווקות', questions })
    expect(res.statusCode).toBe(201)
    questionSetId = res.json().id
    expect(res.json().questions).toEqual(questions)

    const dup = await call('PATCH', `/question-sets/${questionSetId}`, {
      questions: [questions[0], questions[0]],
    })
    expect(dup.statusCode).toBe(400)
    const badSlot = await call('PATCH', `/question-sets/${questionSetId}`, {
      questions: [{ ...questions[0], slot: 'Bad Slot' }],
    })
    expect(badSlot.statusCode).toBe(400)
    const upd = await call('PATCH', `/question-sets/${questionSetId}`, { name: 'רווקות 2' })
    expect(upd.json().name).toBe('רווקות 2')

    // Group texts and fallback-only (hidden) questions are stored as is.
    const group = [
      { slot: 'group_name', text: { group: 'שם המשפחה?' }, required: true, fallback: '', maxLen: 40 },
      { slot: 'group_legend', text: {}, required: false, fallback: 'סבא וסבתא', maxLen: 40, hidden: true },
    ]
    const g = await call('POST', '/question-sets', { name: 'משפחה', questions: group })
    expect(g.statusCode).toBe(201)
    expect(g.json().questions).toEqual(group)
    const preview = await call('POST', '/riddles/preview', {
      template: 'לכבוד {group_name} ו{group_legend}',
      form: 'group',
      questionSetId: g.json().id,
    })
    expect(preview.json().unknownSlots).toEqual([])
    expect(
      preview
        .json()
        .parts.map((p: { v: string }) => p.v)
        .join(''),
    ).toBe('לכבוד [group_name] וסבא וסבתא')
    expect((await call('DELETE', `/question-sets/${g.json().id}`)).statusCode).toBe(200)
  })

  it('creates riddles, previews templates and tests answers', async () => {
    const res = await call('POST', '/riddles', {
      stallId: stallA,
      title: 'תקווה',
      answer: 'תקווה',
      accepted: ['התקווה'],
      hint: 'המנון',
      templates: { she: '{name} {one_word} ו{dream}. מה היא?', he: '{name} {one_word}' },
      afterText: 'עכשיו מצאו את תקווה.',
    })
    expect(res.statusCode).toBe(201)
    riddleA = res.json().id
    riddleB = (await call('POST', '/riddles', { stallId: stallB, answer: "ג'חנון" })).json().id
    expect((await call('POST', '/riddles', { stallId: stallA, answer: '' })).statusCode).toBe(400)
    const upd = await call('PATCH', `/riddles/${riddleA}`, { hint: 'שרים אותו', active: false })
    expect(upd.json()).toMatchObject({ hint: 'שרים אותו', active: false })

    const preview = await call('POST', '/riddles/preview', {
      template: '{name} {one_word} ו{dream}.',
      form: 'he',
      questionSetId,
    })
    expect(preview.statusCode).toBe(200)
    const p = preview.json()
    expect(p.parts).toEqual([
      { t: 'slot', v: '[name]', slot: 'name' },
      { t: 'text', v: ' ' },
      { t: 'slot', v: 'רך', slot: 'one_word' },
      { t: 'text', v: ' ו.' },
    ])
    expect(p.missing).toEqual(['dream'])
    expect(p.slots).toEqual(['name', 'one_word', 'dream'])
    expect(p.unknownSlots).toEqual(['dream'])

    const withAnswers = await call('POST', '/riddles/preview', {
      template: '{name} היקרה',
      form: 'she',
      answers: { name: 'מיכל' },
    })
    expect(withAnswers.json().parts[0]).toEqual({ t: 'slot', v: 'מיכל', slot: 'name' })

    const ok = await call('POST', '/riddles/test-answer', {
      answer: 'תקווה',
      accepted: ['התקווה'],
      input: 'תקוה',
    })
    expect(ok.json()).toMatchObject({ ok: true, via: 'fuzzy' })
    const no = await call('POST', '/riddles/test-answer', { answer: 'תקווה', input: 'פלאפל' })
    expect(no.json()).toEqual({ ok: false })
  })

  it('creates and updates occasions', async () => {
    const res = await call('POST', '/occasions', {
      key: 'bachelorette',
      label: 'מסיבת רווקות',
      audience: 'private',
      questionSetId,
      forms: ['she'],
    })
    expect(res.statusCode).toBe(201)
    const oid = res.json().id
    const dup = await call('POST', '/occasions', {
      key: 'bachelorette',
      label: 'x',
      audience: 'private',
      forms: ['she'],
    })
    expect(dup.statusCode).toBe(400)
    expect(
      (await call('POST', '/occasions', { key: 'x', label: 'x', audience: 'other', forms: ['she'] }))
        .statusCode,
    ).toBe(400)
    expect(
      (
        await call('POST', '/occasions', {
          key: 'y',
          label: 'y',
          audience: 'private',
          forms: ['she'],
          questionSetId: 9999,
        })
      ).statusCode,
    ).toBe(400)
    const upd = await call('PATCH', `/occasions/${oid}`, { forms: ['she', 'he'], sort: 2 })
    expect(upd.json()).toMatchObject({ forms: ['she', 'he'], sort: 2 })
  })

  it('creates routes and validates every stop against the catalog', async () => {
    const stops = [
      { stallId: stallA, tastingId: tastingA, riddleId: riddleA, backupStallId: stallB },
      { stallId: stallB, tastingId: tastingB, riddleId: riddleB, backupStallId: null },
    ]
    const res = await call('POST', '/routes', { marketId, name: 'מסלול קלאסי', stops })
    expect(res.statusCode).toBe(201)
    const routeId = res.json().id
    expect(res.json().stops).toEqual(stops)

    // Tasting from another stall.
    const wrongTasting = await call('PATCH', `/routes/${routeId}`, {
      stops: [{ stallId: stallA, tastingId: tastingB, riddleId: riddleA, backupStallId: null }],
    })
    expect(wrongTasting.statusCode).toBe(400)
    expect(wrongTasting.json().issues).toEqual([
      { path: 'stops.0.tastingId', message: 'tasting belongs to another stall' },
    ])

    // Stall from another market, riddle that does not exist, backup riddle on the wrong stall.
    const bad = await call('POST', '/routes', {
      marketId,
      name: 'x',
      stops: [
        { stallId: stallOther, tastingId: tastingA, riddleId: 9999, backupStallId: null },
        {
          stallId: stallA,
          tastingId: tastingA,
          riddleId: riddleA,
          backupStallId: stallB,
          backupRiddleId: riddleA,
        },
      ],
    })
    expect(bad.statusCode).toBe(400)
    const paths = bad.json().issues.map((i: { path: string }) => i.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'stops.0.stallId',
        'stops.0.tastingId',
        'stops.0.riddleId',
        'stops.1.backupRiddleId',
      ]),
    )

    // Moving the route to another market invalidates its stops.
    expect((await call('PATCH', `/routes/${routeId}`, { marketId: otherMarketId })).statusCode).toBe(400)
    expect((await call('PATCH', `/routes/${routeId}`, { name: 'קלאסי' })).json().name).toBe('קלאסי')

    // A stall used by a route cannot be deleted.
    expect((await call('DELETE', `/stalls/${stallA}`)).statusCode).toBe(409)
    expect((await call('DELETE', `/tastings/${tastingA}`)).statusCode).toBe(409)
  })

  it('uploads a map and creates a theme with pins', async () => {
    const maps = (await call('GET', '/maps')).json().builtin
    expect(maps).toContain('builtin:carmel-watercolor.jpg')

    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
    const form = multipart('file', 'map.png', 'image/png', png)
    const up = await t.app.inject({
      method: 'POST',
      url: `${BASE}/maps`,
      payload: form.payload,
      headers: { cookie, ...form.headers },
    })
    expect(up.statusCode).toBe(201)
    const { mapFile, url } = up.json()
    expect(mapFile).toMatch(/^maps\/[A-Za-z0-9_-]+\.png$/)
    expect(url).toBe(`/uploads/${mapFile}`)
    expect(existsSync(path.join(t.config.uploadDir, mapFile))).toBe(true)
    const served = await t.app.inject({ url })
    expect(served.statusCode).toBe(200)

    const txt = multipart('file', 'x.txt', 'text/plain', Buffer.from('hello'))
    const badUp = await t.app.inject({
      method: 'POST',
      url: `${BASE}/maps`,
      payload: txt.payload,
      headers: { cookie, ...txt.headers },
    })
    expect(badUp.statusCode).toBe(400)

    const palette = { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' }
    const res = await call('POST', '/themes', {
      name: 'כרמל',
      marketId,
      palette,
      mapFile,
      pins: { [stallA]: { x: 40, y: 30.5 } },
    })
    expect(res.statusCode).toBe(201)
    const themeId = res.json().id

    const builtin = await call('PATCH', `/themes/${themeId}`, { mapFile: 'builtin:carmel-riso.jpg' })
    expect(builtin.json().mapFile).toBe('builtin:carmel-riso.jpg')
    expect((await call('PATCH', `/themes/${themeId}`, { mapFile: 'builtin:nope.jpg' })).statusCode).toBe(400)
    expect((await call('PATCH', `/themes/${themeId}`, { mapFile: '../../etc/passwd' })).statusCode).toBe(400)
    expect(
      (await call('PATCH', `/themes/${themeId}`, { palette: { ...palette, accent: 'red' } })).statusCode,
    ).toBe(400)
    const otherPin = await call('PATCH', `/themes/${themeId}`, { pins: { [stallOther]: { x: 1, y: 1 } } })
    expect(otherPin.statusCode).toBe(400)
    const pinned = await call('PATCH', `/themes/${themeId}`, {
      pins: { [stallA]: { x: 10, y: 20 }, [stallB]: { x: 50, y: 60 } },
      sort: 3,
    })
    expect(pinned.json()).toMatchObject({ sort: 3, pins: { [stallA]: { x: 10, y: 20 } } })
    expect(
      (await call('PATCH', `/themes/${themeId}`, { pins: { [stallA]: { x: 120, y: 1 } } })).statusCode,
    ).toBe(400)
  })

  it('edits settings as JSON values', async () => {
    const put = await call('PUT', '/settings/price_private', { value: { perPersonAgorot: 12000 } })
    expect(put.statusCode).toBe(200)
    expect(put.json().value).toEqual({ perPersonAgorot: 12000 })
    await call('PUT', '/settings/price_private', { value: { perPersonAgorot: 13000 } })
    await call('PUT', '/settings/vendor_rules', { value: 'הראו את המסך' })
    const list = (await call('GET', '/settings')).json().items
    expect(list.map((s: { key: string }) => s.key)).toEqual(['price_private', 'vendor_rules'])
    expect(list[0].value).toEqual({ perPersonAgorot: 13000 })
    expect((await call('PUT', '/settings/Bad Key', { value: 1 })).statusCode).toBe(400)
    expect((await call('PUT', '/settings/x', {})).statusCode).toBe(400)
    expect((await call('DELETE', '/settings/vendor_rules')).statusCode).toBe(200)
    expect((await call('DELETE', '/settings/vendor_rules')).statusCode).toBe(404)
  })

  it('deletes unused rows and refuses rows still referenced', async () => {
    const m = (await call('POST', '/markets', { name: 'ריק' })).json()
    expect((await call('DELETE', `/markets/${m.id}`)).statusCode).toBe(200)
    expect((await call('DELETE', `/markets/${marketId}`)).statusCode).toBe(409)
    expect((await call('DELETE', `/question-sets/${questionSetId}`)).statusCode).toBe(409)
  })
})
