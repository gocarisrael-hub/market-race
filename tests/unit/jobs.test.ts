import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders } from '../../src/server/db/schema.ts'
import { createErrorAlerter, expireOrders } from '../../src/server/services/jobs.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'
import { fakeServices } from '../helpers/fakes.ts'

describe('jobs', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())

  it('expires unplayed and unfinished games past their validity, and nothing else', async () => {
    const make = async () => {
      const o = await createOrder(t.db, {
        kind: 'private',
        status: 'awaiting_answers',
        occasionKey: 'bachelorette',
        form: 'she',
        honoreeName: 'מיכל',
        themeId: ids.carmelThemeId,
        routeId: ids.carmelRouteId,
        people: 2,
      })
      return buildOrderGame(t.db, o.id)
    }
    const old = await make()
    const fresh = await make()
    const done = await make()
    await t.db.update(orders).set({ validUntil: '2020-01-01' }).where(eq(orders.id, old.id))
    await t.db.update(orders).set({ validUntil: '2020-01-01', status: 'done' }).where(eq(orders.id, done.id))
    expect(await expireOrders(t.db)).toBe(1)
    const status = async (id: number) => (await t.db.select().from(orders).where(eq(orders.id, id)))[0].status
    expect(await status(old.id)).toBe('expired')
    expect(await status(fresh.id)).toBe('ready')
    expect(await status(done.id)).toBe('done')
  })

  it('batches error alerts to the owner', async () => {
    const svc = fakeServices()
    let now = 1_000_000_000
    const report = createErrorAlerter(svc, 60_000, () => now)
    await report('first')
    await report('second')
    await report('third')
    expect(svc.emails).toHaveLength(1)
    now += 61_000
    await report('fourth')
    expect(svc.emails).toHaveLength(2)
    expect(svc.emails[1].text).toContain('second')
    expect(svc.emails[1].text).toContain('fourth')
  })

  it('reports 5xx from routes', async () => {
    const seen: string[] = []
    const { buildApp } = await import('../../src/server/app.ts')
    const app = await buildApp({
      db: t.db,
      config: t.config,
      services: t.services,
      reportError: async (m) => seen.push(m),
    })
    app.get('/boom', async () => {
      throw new Error('kaboom')
    })
    const res = await app.inject({ url: '/boom' })
    expect(res.statusCode).toBe(500)
    expect(seen[0]).toContain('kaboom')
    await app.close()
  })
})
