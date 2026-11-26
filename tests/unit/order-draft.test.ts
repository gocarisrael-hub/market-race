import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders } from '../../src/server/db/schema.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

// The site creates the order before the buyer details step and edits it while unpaid.
describe('order draft (site flow)', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())

  const draft = (over: Record<string, unknown> = {}) => ({
    occasionKey: 'bachelorette',
    form: 'she',
    honoreeName: 'מיכל',
    themeId: ids.carmelThemeId,
    people: 4,
    answers: { first_love: 'יואב' },
    ...over,
  })
  const buyer = { name: 'נועה', phone: '050-1234567', email: 'noa@example.com' }
  const row = async (token: string) =>
    (await t.db.select().from(orders).where(eq(orders.manageToken, token)))[0]

  it('creates an order without a buyer, edits it, and needs the buyer to pay', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/orders', payload: draft() })
    expect(res.statusCode).toBe(200)
    const { manageToken, amountAgorot } = res.json()
    expect(amountAgorot).toBe(4 * 9900)

    const noBuyer = await t.app.inject({ method: 'POST', url: `/api/orders/${manageToken}/pay` })
    expect(noBuyer.statusCode).toBe(400)
    expect(noBuyer.json().error).toBe('no_buyer')

    const put = await t.app.inject({
      method: 'PUT',
      url: `/api/orders/${manageToken}`,
      payload: draft({ people: 6, answersLater: true, buyer }),
    })
    expect(put.statusCode).toBe(200)
    expect(put.json().amountAgorot).toBe(6 * 9900)
    const o = await row(manageToken)
    expect(o.people).toBe(6)
    expect(o.priceAgorot).toBe(6 * 9900)
    expect(o.buyerEmail).toBe('noa@example.com')
    expect(o.answersSubmittedAt).toBeNull()

    // Without a buyer in the body the stored one is kept.
    await t.app.inject({ method: 'PUT', url: `/api/orders/${manageToken}`, payload: draft() })
    const o2 = await row(manageToken)
    expect(o2.buyerEmail).toBe('noa@example.com')
    expect(o2.answersSubmittedAt).not.toBeNull()

    const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${manageToken}/pay` })
    expect(pay.statusCode).toBe(200)
  })

  it('takes a single participant by default, priced per person', async () => {
    const shop = (await t.app.inject({ method: 'GET', url: '/api/shop' })).json()
    expect(shop.minPeople).toBe(1)
    const res = await t.app.inject({ method: 'POST', url: '/api/orders', payload: draft({ people: 1 }) })
    expect(res.statusCode).toBe(200)
    expect(res.json().amountAgorot).toBe(9900)
    expect((await row(res.json().manageToken)).people).toBe(1)
  })

  it('updates only the buyer when the body has just the buyer', async () => {
    const { manageToken } = (
      await t.app.inject({ method: 'POST', url: '/api/orders', payload: draft() })
    ).json()
    const bad = await t.app.inject({
      method: 'PUT',
      url: `/api/orders/${manageToken}`,
      payload: { buyer: { ...buyer, email: 'not-an-email' } },
    })
    expect(bad.statusCode).toBe(400)
    const ok = await t.app.inject({ method: 'PUT', url: `/api/orders/${manageToken}`, payload: { buyer } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().amountAgorot).toBe(4 * 9900)
    const o = await row(manageToken)
    expect([o.buyerName, o.buyerPhone, o.buyerEmail]).toEqual([buyer.name, buyer.phone, buyer.email])
    expect(o.people).toBe(4)
  })

  it('rejects bad edits and edits of paid orders', async () => {
    const { manageToken } = (
      await t.app.inject({ method: 'POST', url: '/api/orders', payload: draft({ buyer }) })
    ).json()
    const bad = await t.app.inject({
      method: 'PUT',
      url: `/api/orders/${manageToken}`,
      payload: draft({ people: 21 }),
    })
    expect(bad.json().error).toBe('bad_people')
    const zero = await t.app.inject({
      method: 'PUT',
      url: `/api/orders/${manageToken}`,
      payload: draft({ people: 0 }),
    })
    expect(zero.statusCode).toBe(400)
    const missing = await t.app.inject({ method: 'PUT', url: '/api/orders/nope-nope-nope', payload: draft() })
    expect(missing.statusCode).toBe(404)
    await t.db.update(orders).set({ paidAt: new Date() }).where(eq(orders.manageToken, manageToken))
    const paid = await t.app.inject({ method: 'PUT', url: `/api/orders/${manageToken}`, payload: draft() })
    expect(paid.statusCode).toBe(409)
  })
})
