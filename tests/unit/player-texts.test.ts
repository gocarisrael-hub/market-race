import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { setSetting } from '../../src/server/services/settings.ts'
import { makeTestApp } from '../helpers/app.ts'

describe('player text overrides in the game view', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let token: string
  beforeAll(async () => {
    t = await makeTestApp()
    const ids = await seedDemo(t.db)
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 4,
      allergens: [],
      answers: {},
    })
    token = (await buildOrderGame(t.db, o.id)).gameToken
  })
  afterAll(() => t.close())

  it('sends only the brand name by default', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/game/${token}` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ready', texts: { brand: '[שם המותג]' } })
  })

  it('sends the owner overrides set in settings', async () => {
    await setSetting(t.db, 'brand_name', 'שוקולו')
    await setSetting(t.db, 'player_texts', { 'start.button': 'קדימה!' })
    const res = await t.app.inject({ method: 'GET', url: `/api/game/${token}` })
    expect(res.json().texts).toEqual({ brand: 'שוקולו', 'start.button': 'קדימה!' })
  })
})
