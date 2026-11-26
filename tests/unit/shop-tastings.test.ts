import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { riddles, stalls, tastings, themes } from '../../src/server/db/schema.ts'
import { previewRoute } from '../../src/server/domain/builder.ts'
import { iconUrl } from '../../src/server/domain/icons.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

// Buyers see what they taste before paying, never which stall: the stalls are the riddles' answers.
describe('shop tastings (public, before purchase)', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  let secrets: string[]
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
    const [s, ts, rs] = await Promise.all([
      t.db.select().from(stalls),
      t.db.select().from(tastings),
      t.db.select().from(riddles),
    ])
    secrets = [
      ...s.map((x) => x.name),
      ...ts.map((x) => x.name),
      ...rs.flatMap((r) => [r.answer, r.title, ...r.accepted, ...Object.values(r.templates)]),
    ].filter((x): x is string => !!x && x.length > 1)
  })
  afterAll(() => t.close())

  const preview = (q: string) =>
    t.app.inject({ url: `/api/shop/route-preview?themeId=${ids.carmelThemeId}${q}` })
  const leaks = (body: string) => secrets.filter((x) => body.includes(x))

  it('lists each route stop teaser in order, without names, riddles or catalog ids', async () => {
    const res = await t.app.inject({ url: '/api/shop' })
    expect(res.statusCode).toBe(200)
    expect(leaks(res.body)).toEqual([])
    const route = res.json().routes.find((r: { id: number }) => r.id === ids.carmelRouteId)
    expect(route.tastings).toHaveLength(5)
    expect(route.tastings[0]).toEqual({
      teaser: 'פירות העונה, סחוטים מול העיניים',
      icon: iconUrl('drinks/orange-juice'),
      allergens: [],
      diets: ['vegan', 'vegetarian', 'gluten_free'],
      finale: false,
    })
    expect(route.tastings[1].teaser).toBe('מאפה תימני מסורתי מהתנור')
    expect(route.tastings.map((x: { finale: boolean }) => x.finale)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ])
    for (const x of route.tastings)
      expect(Object.keys(x).sort()).toEqual(['allergens', 'diets', 'finale', 'icon', 'teaser'])
  })

  it('previews the route as listed with no restrictions', async () => {
    const res = await preview('')
    expect(res.statusCode).toBe(200)
    expect(res.json().stops.map((s: { status: string }) => s.status)).toEqual(Array(5).fill('as_listed'))
    expect(res.json().stops[4]).toMatchObject({ finale: true, teaser: 'משהו קר מהחבית לסיום' })
  })

  it('gluten: blocks the bakery stops, swaps falafel and beer at the same stall', async () => {
    const res = await preview(`&allergens=${encodeURIComponent('גלוטן')}`)
    expect(res.statusCode).toBe(200)
    expect(leaks(res.body)).toEqual([])
    const stops = res.json().stops
    expect(stops.map((s: { status: string }) => s.status)).toEqual([
      'as_listed',
      'blocked',
      'blocked',
      'swapped',
      'swapped',
    ])
    expect(stops[1].teaser).toBe('מאפה תימני מסורתי מהתנור')
    expect(stops[3].teaser).toBe('כדורים ירוקים ישר מהשמן, בצלחת')
    expect(stops[4]).toEqual({
      teaser: 'משהו קר ומתוק לסיום',
      icon: iconUrl('produce/apples'),
      finale: true,
      status: 'swapped',
    })
    for (const s of stops) expect(Object.keys(s).sort()).toEqual(['finale', 'icon', 'status', 'teaser'])
  })

  it('swaps to the backup stall when the listed stall is off', async () => {
    const [tikva] = await t.db.select().from(stalls).where(eq(stalls.name, 'דוכן המיצים של תקווה'))
    await t.db.update(stalls).set({ active: false }).where(eq(stalls.id, tikva.id))
    const stops = (await preview('')).json().stops
    expect(stops[0]).toMatchObject({ status: 'swapped', teaser: 'כוס כתומה וטרייה, סחוטה במקום' })
    await t.db.update(stalls).set({ active: true }).where(eq(stalls.id, tikva.id))
  })

  it('diets narrow the choice too', async () => {
    const stops = (await preview('&diets=vegan')).json().stops
    // Jachnun and burik are vegetarian only, and back each other up.
    expect(stops.map((s: { status: string }) => s.status)).toEqual([
      'as_listed',
      'blocked',
      'blocked',
      'as_listed',
      'as_listed',
    ])
  })

  it('rejects bad queries and unknown themes', async () => {
    expect((await t.app.inject({ url: '/api/shop/route-preview' })).statusCode).toBe(400)
    expect((await preview('&allergens=קטשופ')).statusCode).toBe(400)
    expect((await preview('&diets=keto')).statusCode).toBe(400)
    expect((await t.app.inject({ url: '/api/shop/route-preview?themeId=99999' })).statusCode).toBe(404)
    const [th] = await t.db.select().from(themes).where(eq(themes.id, ids.carmelThemeId))
    await t.db.update(themes).set({ active: false }).where(eq(themes.id, th.id))
    expect((await preview('')).statusCode).toBe(404)
    await t.db.update(themes).set({ active: true }).where(eq(themes.id, th.id))
  })

  it('admin edits teasers and validates the icon', async () => {
    const cookie = await ownerCookie(t.app)
    const call = (method: 'POST' | 'PATCH' | 'GET', url: string, payload?: unknown) =>
      t.app.inject({
        method,
        url: `/admin/api/catalog${url}`,
        headers: { cookie },
        payload: payload as object,
      })
    const icons = (await call('GET', '/icons')).json().items
    expect(icons).toContain('coffee')
    expect(icons).toContain('falafel')

    const [tasting] = await t.db.select().from(tastings).limit(1)
    const ok = await call('PATCH', `/tastings/${tasting.id}`, {
      teaser: '  משהו חדש  ',
      teaserIcon: 'coffee',
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ teaser: 'משהו חדש', teaserIcon: 'coffee' })
    const cleared = await call('PATCH', `/tastings/${tasting.id}`, { teaserIcon: '' })
    expect(cleared.json().teaserIcon).toBeNull()
    const bad = await call('PATCH', `/tastings/${tasting.id}`, { teaserIcon: '../secret' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().issues[0].path).toBe('teaserIcon')
    expect((await call('PATCH', `/tastings/${tasting.id}`, { teaser: 'א'.repeat(121) })).statusCode).toBe(400)

    const created = await call('POST', '/tastings', { stallId: tasting.stallId, name: 'חדש' })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ teaser: '', teaserIcon: null })
  })
})

describe('previewRoute', () => {
  const stall = (id: number, active = true) => ({ id, name: `s${id}`, locationHint: '', active })
  const tasting = (id: number, stallId: number, allergens: string[] = [], active = true) => ({
    id,
    stallId,
    name: `t${id}`,
    allergens,
    diets: [],
    feeAgorot: 0,
    active,
  })
  const stop = { stallId: 1, tastingId: 10, riddleId: 0, backupStallId: 2, backupTastingId: 20 }

  it('prefers the listed tasting, then the stall, then the backup', () => {
    const run = (ts: ReturnType<typeof tasting>[], allergens: string[], stalls = [stall(1), stall(2)]) =>
      previewRoute({ stops: [stop], stalls, tastings: ts, allergens, diets: [] })[0]
    expect(run([tasting(10, 1, ['חלב'])], [])).toMatchObject({ status: 'as_listed', finale: true })
    expect(run([tasting(10, 1, ['חלב']), tasting(11, 1)], ['חלב']).tasting?.id).toBe(11)
    expect(run([tasting(10, 1, ['חלב']), tasting(20, 2)], ['חלב'])).toMatchObject({ status: 'swapped' })
    expect(run([tasting(10, 1), tasting(20, 2)], [], [stall(1, false), stall(2)]).tasting?.id).toBe(20)
    const blocked = run([tasting(10, 1, ['חלב']), tasting(20, 2, ['חלב'])], ['חלב'])
    expect(blocked).toMatchObject({ status: 'blocked' })
    expect(blocked.tasting?.id).toBe(10)
    expect(run([tasting(10, 1, [], false), tasting(20, 2, [], false)], [])).toMatchObject({
      status: 'blocked',
    })
  })
})
