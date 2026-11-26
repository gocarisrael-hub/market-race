import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { orders, paySessions } from '../../src/server/db/schema.ts'
import { normalizeRow } from '../../src/server/payments/tranzila.ts'
import { createPaymentSweeper, decideRow } from '../../src/server/services/payments.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

describe('order and payment flow', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())
  beforeEach(() => {
    t.services.emails.length = 0
  })

  const orderBody = (over: Record<string, unknown> = {}) => ({
    occasionKey: 'bachelorette',
    form: 'she',
    honoreeName: 'מיכל',
    themeId: ids.carmelThemeId,
    people: 4,
    allergens: ['בוטנים'],
    answers: { first_love: 'יואב מהשכבה', not_a_slot: 'x' },
    letterNotes: [{ text: 'מזל טוב', signature: 'נועה' }],
    buyer: { name: 'נועה', phone: '050-1234567', email: 'noa@example.com' },
    ...over,
  })

  async function placeAndOpen(over: Record<string, unknown> = {}) {
    const res = await t.app.inject({ method: 'POST', url: '/api/orders', payload: orderBody(over) })
    expect(res.statusCode).toBe(200)
    const { manageToken, amountAgorot } = res.json()
    const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${manageToken}/pay` })
    expect(pay.statusCode).toBe(200)
    const url = new URL(pay.json().url)
    const token = url.searchParams.get('mr_token')!
    const [order] = await t.db.select().from(orders).where(eq(orders.manageToken, manageToken))
    return { manageToken, amountAgorot, token, order, url }
  }

  const charge = (token: string, amount: number, over: Record<string, unknown> = {}) =>
    normalizeRow({
      index: String(Math.floor(Math.random() * 1e9)),
      amount,
      currency: 1,
      processor_response_code: '000',
      txn_type: 'DEBIT',
      tranmode: 'A',
      mr_token: token,
      ...over,
    })

  it('serves the shop catalog', async () => {
    const res = await t.app.inject({ url: '/api/shop' })
    const shop = res.json()
    expect(shop.occasions.map((o: { key: string }) => o.key)).toContain('bachelorette')
    expect(shop.themes).toHaveLength(10)
    expect(shop.themes[0].map).toBe('/static/maps/carmel-watercolor.jpg')
    expect(shop.cardEnabled).toBe(true)
    const q = await t.app.inject({ url: '/api/shop/questions?occasion=bachelorette&form=he' })
    expect(q.json().questions[0].text).toBe('מי הייתה האהבה הראשונה שלו?')
  })

  it('validates orders', async () => {
    for (const bad of [
      { people: 0 },
      { people: 99 },
      { form: 'couple' },
      { occasionKey: 'team_day' },
      { allergens: ['אבוקדו'] },
      { buyer: { name: 'x', phone: 'abc', email: 'x@y.co' } },
    ]) {
      const res = await t.app.inject({ method: 'POST', url: '/api/orders', payload: orderBody(bad) })
      expect(res.statusCode, JSON.stringify(bad)).toBe(400)
    }
  })

  it('prices server side and opens a pay window tied to a session', async () => {
    const { amountAgorot, token, order, url } = await placeAndOpen()
    expect(amountAgorot).toBe(4 * 9900)
    expect(url.searchParams.get('sum')).toBe('396.00')
    expect(order.status).toBe('pending_payment')
    expect(order.answers).toEqual({ first_love: 'יואב מהשכבה' })
    const [s] = await t.db.select().from(paySessions).where(eq(paySessions.token, token))
    expect(s).toMatchObject({ orderId: order.id, amountAgorot: 39600, status: 'open' })
  })

  it('settles a verified charge, builds the game and emails the link with a QR', async () => {
    const { token, order } = await placeAndOpen()
    const tx = charge(token, 39600)
    expect(await decideRow(t.db, t.services, 'http://localhost', tx)).toEqual({ outcome: 'settled' })
    const [paid] = await t.db.select().from(orders).where(eq(orders.id, order.id))
    expect(paid.status).toBe('ready')
    expect(paid.paidAt).not.toBeNull()
    expect(paid.paymentRef).toBe(`tranzila:${tx.index}`)
    expect(paid.deliveredAt).not.toBeNull()
    expect(paid.validUntil).not.toBeNull()
    expect(t.services.emails).toHaveLength(1)
    expect(t.services.emails[0]).toMatchObject({ to: 'noa@example.com', subject: 'המשחק של מיכל מוכן' })
    expect(t.services.emails[0].text).toContain(`/g/${paid.gameToken}`)
    // The same row again, and a second pay attempt, change nothing.
    expect(await decideRow(t.db, t.services, 'http://localhost', tx)).toEqual({ outcome: 'used' })
    const again = await t.app.inject({ method: 'POST', url: `/api/orders/${order.manageToken}/pay` })
    expect(again.json().error).toBe('already_paid')
    // The manage link shows the game link.
    const m = await t.app.inject({ url: `/api/manage/${order.manageToken}` })
    expect(m.json()).toMatchObject({
      status: 'ready',
      paid: true,
      gameLink: `http://localhost/g/${paid.gameToken}`,
    })
    const qr = await t.app.inject({ url: `/api/qr/${paid.gameToken}.png` })
    expect(qr.headers['content-type']).toBe('image/png')
  })

  it('refuses holds, wrong amounts and other environments, and reports what a person must check', async () => {
    const { token, order } = await placeAndOpen()
    const d1 = await decideRow(t.db, t.services, 'x', charge(token, 39600, { tranmode: 'V' }))
    expect(d1).toMatchObject({ outcome: 'rejected', alert: { kind: 'unverified' } })
    const d2 = await decideRow(t.db, t.services, 'x', charge(token, 100))
    expect(d2.outcome).toBe('rejected')
    const other = `mp${token.slice(2)}`
    expect(await decideRow(t.db, t.services, 'x', charge(other, 39600))).toEqual({ outcome: 'other_env' })
    expect(
      await decideRow(t.db, t.services, 'x', charge(token, 39600, { processor_response_code: '033' })),
    ).toEqual({
      outcome: 'ignored',
    })
    const [still] = await t.db.select().from(orders).where(eq(orders.id, order.id))
    expect(still.paidAt).toBeNull()
  })

  it('does not let a charge from an old window pay a changed order', async () => {
    const { token, order } = await placeAndOpen()
    await t.db
      .update(orders)
      .set({ people: 6, priceAgorot: 6 * 9900 })
      .where(eq(orders.id, order.id))
    const d = await decideRow(t.db, t.services, 'x', charge(token, 39600))
    expect(d).toMatchObject({
      outcome: 'rejected',
      alert: { kind: 'order_changed', expected: [39600], now: [59400] },
    })
  })

  it('reports a second charge on a paid order', async () => {
    const { token } = await placeAndOpen()
    await decideRow(t.db, t.services, 'x', charge(token, 39600))
    const d = await decideRow(t.db, t.services, 'x', charge(token, 39600))
    expect(d).toMatchObject({ outcome: 'rejected', alert: { kind: 'second_charge' } })
  })

  it('answers later: asks for them after payment, then builds and delivers', async () => {
    const { token, order } = await placeAndOpen({ answers: {}, answersLater: true })
    await decideRow(t.db, t.services, 'http://localhost', charge(token, 39600))
    expect(t.services.emails.map((e) => e.subject)).toEqual([`קיבלנו את ההזמנה ${order.orderNo}`])
    const m = await t.app.inject({ url: `/api/manage/${order.manageToken}` })
    expect(m.json()).toMatchObject({ status: 'awaiting_answers', needsAnswers: true })
    expect(m.json().questions.length).toBeGreaterThan(3)
    const put = await t.app.inject({
      method: 'PUT',
      url: `/api/manage/${order.manageToken}/answers`,
      payload: { answers: { first_love: 'דני' } },
    })
    expect(put.json().status).toBe('ready')
    expect(t.services.emails.map((e) => e.subject)).toContain('המשחק של מיכל מוכן')
    // Not once only: the buyer can send again until the game starts (see manage-edit.test.ts).
    const twice = await t.app.inject({
      method: 'PUT',
      url: `/api/manage/${order.manageToken}/answers`,
      payload: { answers: { first_love: 'רון' } },
    })
    expect(twice.statusCode).toBe(200)
  })

  it('sends odd answers to review and tells the owner instead of delivering', async () => {
    const { token, order } = await placeAndOpen({ answers: { first_love: 'חחחחחחחחח' } })
    await decideRow(t.db, t.services, 'http://localhost', charge(token, 39600))
    const [o] = await t.db.select().from(orders).where(eq(orders.id, order.id))
    expect(o.status).toBe('review')
    expect(o.deliveredAt).toBeNull()
    expect(t.services.emails.map((e) => e.to)).toEqual(['owner@example.com'])
  })

  it('settles through the sweeper and delivers alerts to the owner once', async () => {
    const a = await placeAndOpen()
    const b = await placeAndOpen()
    const rows = [charge(a.token, 39600), charge(b.token, 5)]
    const svc = { ...t.services, tranzila: { ...t.services.tranzila, listTransactions: async () => rows } }
    const sweeper = await createPaymentSweeper(t.db, svc, 'http://localhost')
    const r = await sweeper.sweep()
    expect(r).toMatchObject({ rows: 2, settled: 1, queued: 1 })
    const alerts = t.services.emails.filter((e) => e.subject?.startsWith('טרנזילה'))
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text).toContain('לא אומתה')
    await sweeper.sweep(Date.now() + 120_000)
    expect(t.services.emails.filter((e) => e.subject?.startsWith('טרנזילה'))).toHaveLength(1)
  })

  it('accepts notify posts (form encoded) and the POST return page', async () => {
    const { token } = await placeAndOpen()
    const n = await t.app.inject({
      method: 'POST',
      url: `/api/payment/tranzila/notify?t=${token}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'Response=000&index=1',
    })
    expect(n.json()).toEqual({ ok: true })
    const back = await t.app.inject({ method: 'POST', url: '/pay/done?o=abc', payload: {} })
    expect(back.statusCode).toBe(303)
    expect(back.headers.location).toBe('/pay/done?o=abc')
  })

  it('records company leads', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/leads',
      payload: {
        companyName: 'אקמה',
        contactName: 'רון',
        phone: '0501234567',
        email: 'ron@acme.co',
        people: 30,
      },
    })
    expect(res.json().ok).toBe(true)
  })
})
