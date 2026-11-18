import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { orders, paySessions } from '../../src/server/db/schema.ts'
import {
  createPelecard,
  type PelecardTx,
  parseCallback,
  pelecardConfigFromEnv,
  transactionIdFromUrl,
  verifyFailure,
} from '../../src/server/payments/pelecard.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

const env = { PELECARD_TERMINAL: '0882', PELECARD_USER: 'u', PELECARD_PASSWORD: 'p' }

function jsonFetch(replies: unknown[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    const r = replies.shift()
    if (r instanceof Response) return r
    return new Response(JSON.stringify(r), { status: 200 })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('pelecard client', () => {
  it('is dormant until terminal, user and password are set', () => {
    expect(createPelecard(pelecardConfigFromEnv({})).isConfigured()).toBe(false)
    expect(createPelecard(pelecardConfigFromEnv(env)).isConfigured()).toBe(true)
  })

  it('inits a J4 shekel debit in agorot with our token and callback URLs', async () => {
    const { f, calls } = jsonFetch([
      { URL: 'https://gateway21.pelecard.biz/PaymentGW?transactionId=abc-123' },
    ])
    const pc = createPelecard(pelecardConfigFromEnv(env), f)
    const urls = { goodUrl: 'g', errorUrl: 'e', serverGoodUrl: 'sg', serverErrorUrl: 'se' }
    const r = await pc.init({ amountAgorot: 39600, paramToken: 'ms0123456789abcdef', urls })
    expect(r).toEqual({
      url: 'https://gateway21.pelecard.biz/PaymentGW?transactionId=abc-123',
      transactionId: 'abc-123',
    })
    expect(calls[0].url).toBe('https://gateway21.pelecard.biz/PaymentGW/init')
    expect(calls[0].body).toMatchObject({
      terminal: '0882',
      ActionType: 'J4',
      Currency: 1,
      Total: 39600,
      ParamX: 'ms0123456789abcdef',
      GoodURL: 'g',
      ErrorURL: 'e',
      ServerSideGoodFeedbackURL: 'sg',
      ServerSideErrorFeedbackURL: 'se',
    })
  })

  it('throws on a PeleCard error code, a missing URL and bad amounts', async () => {
    const urls = { goodUrl: 'g', errorUrl: 'e', serverGoodUrl: 'sg', serverErrorUrl: 'se' }
    let { f } = jsonFetch([{ Error: { ErrCode: 301, ErrMsg: 'bad terminal' } }])
    await expect(
      createPelecard(pelecardConfigFromEnv(env), f).init({ amountAgorot: 100, paramToken: 't', urls }),
    ).rejects.toThrow('pelecard init error 301: bad terminal')
    ;({ f } = jsonFetch([{}]))
    await expect(
      createPelecard(pelecardConfigFromEnv(env), f).init({ amountAgorot: 100, paramToken: 't', urls }),
    ).rejects.toThrow('no URL')
    await expect(
      createPelecard(pelecardConfigFromEnv(env)).init({ amountAgorot: 0, paramToken: 't', urls }),
    ).rejects.toThrow('bad amount')
  })

  it('reads the transaction id from the payment URL', () => {
    expect(transactionIdFromUrl('https://x/PaymentGW?a=1&TransactionId=zz%2D9')).toBe('zz-9')
    expect(transactionIdFromUrl('https://x/PaymentGW')).toBeNull()
    expect(transactionIdFromUrl(null)).toBeNull()
  })

  it('normalizes GetTransaction', async () => {
    const { f } = jsonFetch([
      {
        StatusCode: '000',
        ResultData: {
          ShvaResult: '000',
          AdditionalDetailsParamX: 'ms0123456789abcdef',
          DebitTotal: '39600',
          DebitApproveNumber: '0012345',
          VoucherId: '77-1',
          TransactionId: 'abc-123',
        },
      },
    ])
    const tx = await createPelecard(pelecardConfigFromEnv(env), f).getTransaction('abc-123')
    expect(tx).toMatchObject({
      statusCode: '000',
      shvaResult: '000',
      paramX: 'ms0123456789abcdef',
      debitTotalAgorot: 39600,
      approvalNo: '0012345',
      voucherNo: '77-1',
      transactionId: 'abc-123',
    })
  })

  it('parses callbacks of several shapes', () => {
    expect(parseCallback({ PelecardTransactionId: 'a', PelecardStatusCode: '000' })).toMatchObject({
      transactionId: 'a',
      statusCode: '000',
    })
    expect(
      parseCallback({ ResultData: { TransactionId: 'b', AdditionalDetailsParamX: 'tok' } }),
    ).toMatchObject({
      transactionId: 'b',
      paramX: 'tok',
    })
    expect(parseCallback({})).toEqual({ statusCode: null, transactionId: null, paramX: null })
  })

  it('verifies fail closed', () => {
    const tx = (over: Partial<PelecardTx> = {}): PelecardTx => ({
      statusCode: '000',
      shvaResult: '000',
      paramX: 't',
      debitTotalAgorot: 39600,
      approvalNo: null,
      voucherNo: null,
      transactionId: 'x',
      raw: {},
      ...over,
    })
    const exp = { amountAgorot: 39600 }
    expect(verifyFailure(tx(), exp)).toBeNull()
    expect(verifyFailure(null, exp)).toBe('lookup_status')
    expect(verifyFailure(tx({ statusCode: '500' }), exp)).toBe('lookup_status')
    expect(verifyFailure(tx({ shvaResult: '033' }), exp)).toBe('declined')
    expect(verifyFailure(tx({ debitTotalAgorot: null }), exp)).toBe('no_amount')
    expect(verifyFailure(tx({ debitTotalAgorot: 100 }), exp)).toBe('amount_mismatch')
  })
})

describe('pelecard order flow', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp({}, { provider: 'pelecard' })
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())
  beforeEach(() => {
    t.services.emails.length = 0
    t.services.pc.failLookups = false
  })

  async function placeAndOpen(over: Record<string, unknown> = {}) {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        occasionKey: 'bachelorette',
        form: 'she',
        honoreeName: 'מיכל',
        themeId: ids.carmelThemeId,
        people: 4,
        answers: { first_love: 'יואב' },
        buyer: { name: 'נועה', phone: '0501234567', email: 'noa@example.com' },
        ...over,
      },
    })
    expect(res.statusCode).toBe(200)
    const { manageToken } = res.json()
    const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${manageToken}/pay` })
    expect(pay.statusCode).toBe(200)
    const txId = transactionIdFromUrl(pay.json().url)!
    const [order] = await t.db.select().from(orders).where(eq(orders.manageToken, manageToken))
    const [session] = await t.db.select().from(paySessions).where(eq(paySessions.orderId, order.id))
    return { manageToken, txId, order, session, url: pay.json().url as string }
  }

  const approve = (txId: string, paramX: string, amount = 39600, over: Record<string, unknown> = {}) =>
    t.services.pc.txs.set(txId, {
      ShvaResult: '000',
      AdditionalDetailsParamX: paramX,
      DebitTotal: amount,
      DebitApproveNumber: '0012345',
      VoucherId: '77-1',
      ...over,
    })

  const callback = (payload: Record<string, unknown>) =>
    t.app.inject({ method: 'POST', url: '/api/payment/pelecard/callback', payload })

  it('opens a PeleCard window tied to a session', async () => {
    const { url, session, txId } = await placeAndOpen()
    expect(url).toContain('gateway21.pelecard.biz')
    expect(session).toMatchObject({ provider: 'pelecard', amountAgorot: 39600, status: 'open' })
    expect(session.raw).toEqual({ initTransactionId: txId })
    const shop = await t.app.inject({ url: '/api/shop' })
    expect(shop.json()).toMatchObject({ cardEnabled: true, cardProvider: 'pelecard' })
  })

  it('settles a verified callback, builds the game and emails the link; repeats change nothing', async () => {
    const { txId, session, order } = await placeAndOpen()
    approve(txId, session.token)
    const res = await callback({ PelecardTransactionId: txId })
    expect(res.json()).toEqual({ ok: true })
    const [paid] = await t.db.select().from(orders).where(eq(orders.id, order.id))
    expect(paid.status).toBe('ready')
    expect(paid.paymentRef).toBe(`pelecard:${txId}/0012345/v77-1`)
    expect(t.services.emails.map((e) => e.subject)).toEqual(['המשחק של מיכל מוכן'])
    await callback({ PelecardTransactionId: txId })
    expect(t.services.emails).toHaveLength(1)
    const [s] = await t.db.select().from(paySessions).where(eq(paySessions.id, session.id))
    expect(s).toMatchObject({ status: 'paid', transactionId: `pc:${txId}` })
  })

  it('ignores forged callbacks and keeps declined cards unpaid', async () => {
    const { txId, session, order } = await placeAndOpen()
    expect((await callback({ PelecardTransactionId: 'invented' })).statusCode).toBe(200)
    approve(txId, session.token, 39600, { ShvaResult: '033' })
    await callback({ PelecardTransactionId: txId })
    const [o] = await t.db.select().from(orders).where(eq(orders.id, order.id))
    expect(o.paidAt).toBeNull()
    expect(t.services.emails).toHaveLength(0)
  })

  it('a charge for the wrong amount stays unpaid and alerts the owner', async () => {
    const { txId, session, order } = await placeAndOpen()
    approve(txId, session.token, 100)
    await callback({ PelecardTransactionId: txId })
    const [o] = await t.db.select().from(orders).where(eq(orders.id, order.id))
    expect(o.paidAt).toBeNull()
    expect(t.services.emails[0]).toMatchObject({ to: 'owner@example.com' })
    expect(t.services.emails[0].text).toContain('amount_mismatch')
  })

  it('answers 502 when PeleCard cannot be asked, so PeleCard retries', async () => {
    const { txId, session } = await placeAndOpen()
    approve(txId, session.token)
    t.services.pc.failLookups = true
    expect((await callback({ PelecardTransactionId: txId })).statusCode).toBe(502)
  })

  it('finds the transaction by our token when the callback carries only ParamX', async () => {
    const { txId, session, order } = await placeAndOpen()
    approve(txId, session.token)
    await callback({ AdditionalDetailsParamX: session.token })
    const [o] = await t.db.select().from(orders).where(eq(orders.id, order.id))
    expect(o.paidAt).not.toBeNull()
  })

  it('settles a changed order anyway and tells the owner', async () => {
    const { txId, session, order } = await placeAndOpen()
    await t.db.update(orders).set({ people: 6, priceAgorot: 59400 }).where(eq(orders.id, order.id))
    approve(txId, session.token)
    await callback({ PelecardTransactionId: txId })
    const [o] = await t.db.select().from(orders).where(eq(orders.id, order.id))
    expect(o.paidAt).not.toBeNull()
    expect(t.services.emails.some((e) => e.to === 'owner@example.com' && e.subject?.includes('השתנתה'))).toBe(
      true,
    )
  })

  it('settles a lost callback when the buyer page polls the order', async () => {
    const { txId, session, manageToken } = await placeAndOpen()
    const before = await t.app.inject({ url: `/api/manage/${manageToken}` })
    expect(before.json().paid).toBe(false)
    approve(txId, session.token)
    // Polls are throttled per window; a fresh window was just checked, so wait out the throttle.
    const { checkPelecardReturn } = await import('../../src/server/services/payments-pelecard.ts')
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, manageToken))
    await checkPelecardReturn(t.db, t.services, 'http://localhost', o, Date.now() + 11_000)
    const after = await t.app.inject({ url: `/api/manage/${manageToken}` })
    expect(after.json()).toMatchObject({ paid: true, status: 'ready' })
  })
})

describe('pelecard off', () => {
  it('turns card payment off when PeleCard is not configured, without falling back', async () => {
    const t = await makeTestApp({}, { provider: 'pelecard', pelecard: false })
    const ids = await seedDemo(t.db)
    const shop = await t.app.inject({ url: '/api/shop' })
    expect(shop.json().cardEnabled).toBe(false)
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        occasionKey: 'bachelorette',
        form: 'she',
        honoreeName: 'מיכל',
        themeId: ids.carmelThemeId,
        people: 4,
        buyer: { name: 'נועה', phone: '0501234567', email: 'noa@example.com' },
      },
    })
    const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${res.json().manageToken}/pay` })
    expect(pay.json().error).toBe('card_disabled')
    await t.close()
  })
})
