import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders, redemptions, stalls } from '../../src/server/db/schema.ts'
import { israelDate } from '../../src/server/domain/dates.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { act, getView } from '../../src/server/services/play.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

describe('playing a game', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())

  async function newGame(over: Partial<Parameters<typeof createOrder>[1]> = {}) {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 4,
      allergens: ['בוטנים'],
      answers: { first_love: 'יואב מהשכבה' },
      ...over,
    })
    const built = await buildOrderGame(t.db, o.id)
    expect(built.status).toBe('ready')
    return built
  }

  it('plays all stops end to end, logging each redemption', async () => {
    const o = await newGame()
    let view = await getView(t.db, o.gameToken)
    if (typeof view === 'string') throw new Error(view)
    expect(view.status).toBe('ready')
    expect(view.current).toBeNull()

    let r = await act(t.db, o.gameToken, { type: 'start' })
    expect(r.ok && r.view.step).toBe('riddle')
    const answers = ['תקוה', 'גחנון', 'בוריק', 'פלאפל', 'לחיים']
    for (let i = 0; i < 5; i++) {
      const wrong = await act(t.db, o.gameToken, { type: 'answer', stopIndex: i, answer: 'סתם' })
      expect(wrong.ok && wrong.correct).toBe(false)
      r = await act(t.db, o.gameToken, { type: 'answer', stopIndex: i, answer: answers[i] })
      expect(r.ok && r.correct).toBe(true)
      expect(r.ok && r.view.current?.reveal?.stall.name).toBeTruthy()
      r = await act(t.db, o.gameToken, { type: 'arrived', stopIndex: i })
      if (!r.ok) throw new Error(r.error)
      expect(r.view.current?.redeem).toMatchObject({ portions: 4, allergens: ['בוטנים'], name: 'מיכל' })
      expect(r.view.current?.redeem?.code).toMatch(/^\d{4}$/)
      r = await act(t.db, o.gameToken, { type: 'redeemed', stopIndex: i })
      expect(r.ok).toBe(true)
    }
    view = await getView(t.db, o.gameToken)
    if (typeof view === 'string') throw new Error(view)
    expect(view.status).toBe('done')
    expect(view.completed).toHaveLength(5)
    expect(view.letter).not.toBeNull()
    const used = await t.db.select().from(redemptions).where(eq(redemptions.orderId, o.id))
    expect(used).toHaveLength(5)
    expect(used.every((u) => u.portions === 4)).toBe(true)
    expect(used.reduce((s, u) => s + u.feeAgorot, 0)).toBe(800 + 1500 + 1200 + 1000 + 1200)
    const [row] = await t.db.select().from(orders).where(eq(orders.id, o.id))
    expect(row.status).toBe('done')
  })

  it('never sends a later stop to the client', async () => {
    const o = await newGame()
    await act(t.db, o.gameToken, { type: 'start' })
    const view = await getView(t.db, o.gameToken)
    const json = JSON.stringify(view)
    // Current riddle's answer is not sent before it is solved, nor later stalls.
    for (const secret of ['תקווה', 'המאפייה התימנית', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים', 'בירה'])
      expect(json).not.toContain(secret)
  })

  it('treats a second phone acting on an old step as stale and changes nothing', async () => {
    const o = await newGame()
    await act(t.db, o.gameToken, { type: 'start' })
    const a = await act(t.db, o.gameToken, { type: 'answer', stopIndex: 0, answer: 'תקווה' })
    const b = await act(t.db, o.gameToken, { type: 'answer', stopIndex: 0, answer: 'תקווה' })
    expect(a.ok).toBe(true)
    expect(b).toMatchObject({ ok: false, error: 'stale' })
    await act(t.db, o.gameToken, { type: 'arrived', stopIndex: 0 })
    const r1 = await act(t.db, o.gameToken, { type: 'redeemed', stopIndex: 0 })
    const r2 = await act(t.db, o.gameToken, { type: 'redeemed', stopIndex: 0 })
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(false)
    const used = await t.db.select().from(redemptions).where(eq(redemptions.orderId, o.id))
    expect(used).toHaveLength(1)
  })

  it('shows the hint only after asking for it', async () => {
    const o = await newGame()
    await act(t.db, o.gameToken, { type: 'start' })
    let v = await getView(t.db, o.gameToken)
    if (typeof v === 'string') throw new Error(v)
    expect(v.current?.riddle).toMatchObject({ hint: null, hasHint: true })
    const r = await act(t.db, o.gameToken, { type: 'hint', stopIndex: 0 })
    expect(r.ok && r.view.current?.riddle.hint).toBe('זה גם שם של המנון')
    v = await getView(t.db, o.gameToken)
    if (typeof v === 'string') throw new Error(v)
    expect(v.current?.riddle.hint).toBe('זה גם שם של המנון')
  })

  it('sends the group to the backup stall when the stall is closed on the day', async () => {
    const o = await newGame()
    const stallId = o.game!.stops[0].stall.id
    await t.db
      .update(stalls)
      .set({ closedOn: israelDate(), closedNote: 'סגור היום' })
      .where(eq(stalls.id, stallId))
    await act(t.db, o.gameToken, { type: 'start' })
    const r = await act(t.db, o.gameToken, { type: 'answer', stopIndex: 0, answer: 'תקווה' })
    if (!r.ok) throw new Error(r.error)
    expect(r.view.current?.reveal).toMatchObject({
      usingBackup: true,
      closedNote: 'סגור היום',
      originalStallName: 'דוכן המיצים של תקווה',
    })
    expect(r.view.current?.reveal?.stall.name).toBe('מיצים בפינה')
    await act(t.db, o.gameToken, { type: 'arrived', stopIndex: 0 })
    await act(t.db, o.gameToken, { type: 'redeemed', stopIndex: 0 })
    const [u] = await t.db.select().from(redemptions).where(eq(redemptions.orderId, o.id))
    expect(u).toMatchObject({ usedBackup: true, feeAgorot: 700 })
    await t.db.update(stalls).set({ closedOn: null }).where(eq(stalls.id, stallId))
  })

  it('refuses expired games and unknown tokens', async () => {
    const o = await newGame()
    await t.db.update(orders).set({ validUntil: '2020-01-01' }).where(eq(orders.id, o.id))
    expect(await act(t.db, o.gameToken, { type: 'start' })).toMatchObject({ ok: false, error: 'expired' })
    expect(await getView(t.db, 'nope-nope-nope')).toBe('not_found')
  })

  it('serves the player API over HTTP', async () => {
    const o = await newGame()
    const get = await t.app.inject({ url: `/api/game/${o.gameToken}` })
    expect(get.statusCode).toBe(200)
    expect(get.json().totalStops).toBe(5)
    const start = await t.app.inject({
      method: 'POST',
      url: `/api/game/${o.gameToken}/action`,
      payload: { type: 'start' },
    })
    expect(start.json().view.step).toBe('riddle')
    const again = await t.app.inject({
      method: 'POST',
      url: `/api/game/${o.gameToken}/action`,
      payload: { type: 'start' },
    })
    expect(again.statusCode).toBe(409)
    expect(again.json().view.step).toBe('riddle')
    const bad = await t.app.inject({
      method: 'POST',
      url: `/api/game/${o.gameToken}/action`,
      payload: { type: 'x' },
    })
    expect(bad.statusCode).toBe(400)
  })
})
