// Per-person diets end to end on the demo catalog: an order with one vegan of four, the redeem
// screen's breakdown, one redemption row per tasting, settlement, the admin view and the manage edit.
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders, redemptions } from '../../src/server/db/schema.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { act, startGame } from '../../src/server/services/play.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

const ANSWERS = ['תקווה', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים']

describe('per-person diets on the demo route', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  let cookie: string
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
    cookie = await ownerCookie(t.app)
  })
  afterAll(() => t.close())

  async function newGame(counts: Record<string, number> = { vegan: 1 }) {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 4,
      diets: ['vegan'],
      restrictionCounts: counts,
      answers: { first_love: 'יואב מהשכבה' },
      buyerName: 'נועה',
    })
    return buildOrderGame(t.db, o.id)
  }

  it('builds mixed stops: the regular tasting for three, the vegan one for one', async () => {
    const o = await newGame()
    expect(o.status).toBe('ready')
    const portions = o.game!.stops.map((s) => (s.portions ?? []).map((p) => `${p.count} × ${p.tasting.name}`))
    expect(portions[1]).toEqual(["3 × ג'חנון עם ביצה ורסק", '1 × לחוח עם רסק וסחוג'])
    expect(portions[2]).toEqual(['3 × בוריק תפוחי אדמה וביצה', '1 × בוריק טבעוני (בלי ביצה)'])
    expect(portions[0]).toEqual(['4 × מיץ תפוזים טרי'])
    // The whole group vegan (an older order with no counts) gets the vegan tastings only.
    const all = await newGame({})
    expect(all.game!.stops[1].portions?.map((p) => p.count)).toEqual([4])
  })

  it('the redeem screen lists each tasting; redemptions and settlement count each one', async () => {
    const o = await newGame()
    expect((await startGame(t.db, o.gameToken, { players: 4 })).ok).toBe(true)
    let burik: unknown = null
    for (let i = 0; i < 5; i++) {
      await act(t.db, o.gameToken, { type: 'answer', stopIndex: i, answer: ANSWERS[i] })
      const r = await act(t.db, o.gameToken, { type: 'arrived', stopIndex: i })
      if (!r.ok) throw new Error(r.error)
      if (i === 2) burik = r.view.current?.redeem?.items
      await act(t.db, o.gameToken, { type: 'redeemed', stopIndex: i })
    }
    expect(burik).toEqual([
      { count: 3, tasting: 'בוריק תפוחי אדמה וביצה' },
      { count: 1, tasting: 'בוריק טבעוני (בלי ביצה)' },
    ])
    const rows = await t.db
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.orderId, o.id), eq(redemptions.stopIndex, 2)))
    expect(rows.map((r) => r.portions).sort()).toEqual([1, 3])

    const settle = (await t.app.inject({ url: '/admin/api/settlement', headers: { cookie } })).json()
    const stall = settle.stalls.find((s: { stallName: string }) => s.stallName === 'בוריק')
    expect(stall).toMatchObject({ redemptions: 1, portions: 4 })
    expect(
      Object.fromEntries(
        stall.byTasting.map((x: { tastingName: string; portions: number }) => [x.tastingName, x.portions]),
      ),
    ).toEqual({ 'בוריק תפוחי אדמה וביצה': 3, 'בוריק טבעוני (בלי ביצה)': 1 })

    const d = (await t.app.inject({ url: `/admin/api/orders/${o.id}`, headers: { cookie } })).json()
    expect(d.usage).toMatchObject({ stops: 5, redeemedStops: 5, bought: 20, used: 20, unused: 0 })
  })

  it('the manage page edits the counts until the start, and the game rebuilds', async () => {
    const o = await newGame()
    await t.db.update(orders).set({ paidAt: new Date() }).where(eq(orders.id, o.id))
    const m = (await t.app.inject({ url: `/api/manage/${o.manageToken}` })).json()
    expect(m.diet).toMatchObject({ allergens: [], diets: ['vegan'], counts: { vegan: 1 } })
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/manage/${o.manageToken}/answers`,
      payload: {
        answers: o.answers,
        letterNotes: [],
        allergens: ['חלב'],
        diets: ['vegan'],
        restrictionCounts: { vegan: 2, חלב: 1 },
      },
    })
    expect(res.statusCode).toBe(200)
    const [after] = await t.db.select().from(orders).where(eq(orders.id, o.id))
    expect(after.restrictionCounts).toEqual({ חלב: 1, vegan: 2 })
    // Coffee for the milk allergy: soy milk for one, the regular coffee for the others.
    const coffee = after.game!.stops.find(
      (s) => s.stall.name === 'קפה של השוק' || s.backup?.stall.name === 'קפה של השוק',
    )
    const p = coffee?.stall.name === 'קפה של השוק' ? coffee.portions : coffee?.backup?.portions
    expect(p?.map((x) => `${x.count} × ${x.tasting.name}`)).toEqual([
      // Two vegans and one milk allergy, three different people: soy milk for three.
      '1 × קפה הפוך',
      '3 × קפה הפוך בחלב סויה',
    ])
    expect(after.game!.stops[1].portions?.map((x) => x.count)).toEqual([1, 3])

    await startGame(t.db, o.gameToken, { players: 4 })
    const locked = await t.app.inject({
      method: 'PUT',
      url: `/api/manage/${o.manageToken}/answers`,
      payload: { answers: o.answers, letterNotes: [], diets: [] },
    })
    expect(locked.statusCode).toBe(409)
  })
})
