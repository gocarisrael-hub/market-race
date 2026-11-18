import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

describe('admin orders: test games and review queue', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  let cookie: string
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
    cookie = await ownerCookie(t.app)
  })
  afterAll(() => t.close())

  const base = () => ({
    occasionKey: 'bachelorette',
    form: 'she',
    honoreeName: 'מיכל',
    themeId: ids.carmelThemeId,
    routeId: ids.carmelRouteId,
    people: 3,
    answers: { first_love: 'יואב' },
  })

  it('requires an owner', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/admin/api/orders/test', payload: base() })
    expect(res.statusCode).toBe(401)
  })

  it('generates a ready game from clean test answers', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/admin/api/orders/test',
      payload: base(),
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const { order, links } = res.json()
    expect(order.status).toBe('ready')
    expect(order.game.stops).toHaveLength(5)
    expect(links.game).toMatch(/\/g\/.+/)
    expect(order.answersSubmittedAt).not.toBeNull()
  })

  it('sends odd answers to review, fixes them inline and approves', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/admin/api/orders/test',
      headers: { cookie },
      payload: { ...base(), answers: { first_love: 'חחחחחחחח' } },
    })
    const { order } = res.json()
    expect(order.status).toBe('review')
    expect(order.flags[0].code).toBe('repeated_chars')

    const list = await t.app.inject({ url: '/admin/api/orders?status=review', headers: { cookie } })
    expect(list.json().orders.map((o: { id: number }) => o.id)).toContain(order.id)

    const fixed = await t.app.inject({
      method: 'PATCH',
      url: `/admin/api/orders/${order.id}/answers`,
      headers: { cookie },
      payload: { answers: { first_love: 'יואב' } },
    })
    expect(fixed.json().order.status).toBe('ready')
  })

  it('approves a flagged order the owner accepts as is', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/admin/api/orders/test',
      headers: { cookie },
      payload: { ...base(), answers: { first_love: 'א'.repeat(45) } },
    })
    const { order } = res.json()
    expect(order.status).toBe('review')
    const ok = await t.app.inject({
      method: 'POST',
      url: `/admin/api/orders/${order.id}/approve`,
      headers: { cookie },
    })
    expect(ok.json().order.status).toBe('ready')
  })

  it('blocks and flags an unsafe stop, and refuses to approve it', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/admin/api/orders/test',
      headers: { cookie },
      payload: { ...base(), allergens: ['גלוטן'] },
    })
    const { order } = res.json()
    expect(order.status).toBe('review')
    expect(order.flags.some((f: { code: string }) => f.code === 'blocked_stop')).toBe(true)
    expect(order.game.stops).toHaveLength(5)
    const no = await t.app.inject({
      method: 'POST',
      url: `/admin/api/orders/${order.id}/approve`,
      headers: { cookie },
    })
    expect(no.statusCode).toBe(400)
  })

  it('lists live games', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/admin/api/orders/test',
      payload: base(),
      headers: { cookie },
    })
    const { order } = res.json()
    await t.app.inject({
      method: 'POST',
      url: `/api/game/${order.gameToken}/action`,
      payload: { type: 'start' },
    })
    const live = await t.app.inject({ url: '/admin/api/live', headers: { cookie } })
    expect(live.json().games[0]).toMatchObject({ id: order.id, step: 'riddle', stopIndex: 0, totalStops: 5 })
  })
})
