import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders, paySessions } from '../../src/server/db/schema.ts'
import { cardEnabled, servicesFromEnv } from '../../src/server/services/context.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

async function placeAndOpen(t: Awaited<ReturnType<typeof makeTestApp>>, themeId: number) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/orders',
    payload: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId,
      people: 4,
      answers: { first_love: 'יואב' },
      buyer: { name: 'נועה', phone: '0501234567', email: 'noa@example.com' },
    },
  })
  const { manageToken } = res.json()
  const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${manageToken}/pay` })
  return { manageToken, pay }
}

describe('mock payment (staging)', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp({}, { provider: 'mock' })
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())

  it('opens our own mock page, settles on pay, builds the game and emails the link; twice is a no-op', async () => {
    const { manageToken, pay } = await placeAndOpen(t, ids.carmelThemeId)
    expect(pay.statusCode).toBe(200)
    const url = new URL(pay.json().url)
    expect(url.pathname).toBe('/pay/mock')
    const token = url.searchParams.get('s')!
    const [s] = await t.db.select().from(paySessions).where(eq(paySessions.token, token))
    expect(s).toMatchObject({ provider: 'mock', status: 'open', amountAgorot: 39600 })
    const info = await t.app.inject({ url: `/api/payment/mock/${token}` })
    expect(info.json()).toMatchObject({ amountAgorot: 39600, manageToken, paid: false })

    const done = await t.app.inject({ method: 'POST', url: '/api/payment/mock/complete', payload: { token } })
    expect(done.json()).toEqual({ ok: true, redirect: `/pay/done?o=${manageToken}` })
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, manageToken))
    expect(o).toMatchObject({ status: 'ready', paymentRef: `mock:${token}` })
    expect(t.services.emails.map((e) => e.subject)).toEqual(['המשחק של מיכל מוכן'])

    const again = await t.app.inject({
      method: 'POST',
      url: '/api/payment/mock/complete',
      payload: { token },
    })
    expect(again.statusCode).toBe(200)
    expect(t.services.emails).toHaveLength(1)
  })

  it('does not complete sessions of other providers or unknown tokens', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/payment/mock/complete',
      payload: { token: 'mlunknown00000000' },
    })
    expect(r.statusCode).toBe(404)
  })
})

describe('mock payment in production', () => {
  it('is refused: card payment off, and the mock routes answer 404', async () => {
    const svc = servicesFromEnv({ PAYMENT_PROVIDER: 'mock', APP_ENV: 'production' })
    expect(svc.paymentProvider).toBe('mock')
    expect(cardEnabled(svc)).toBe(false)
    expect(cardEnabled(servicesFromEnv({ PAYMENT_PROVIDER: 'mock', APP_ENV: 'staging' }))).toBe(true)

    const t = await makeTestApp({}, { provider: 'mock', mockAllowed: false })
    const ids = await seedDemo(t.db)
    const { pay } = await placeAndOpen(t, ids.carmelThemeId)
    expect(pay.json().error).toBe('card_disabled')
    expect((await t.app.inject({ url: '/api/shop' })).json().cardEnabled).toBe(false)
    await t.close()
  })
})
