import { existsSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { gameStates, leads, orders, redemptions } from '../../src/server/db/schema.ts'
import type { GameSnapshot } from '../../src/server/domain/types.ts'
import { normalizeRow } from '../../src/server/payments/tranzila.ts'
import { decideRow } from '../../src/server/services/payments.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

describe('admin operations', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  let cookie: string
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
    cookie = await ownerCookie(t.app)
  })
  afterAll(() => t.close())
  beforeEach(() => {
    t.services.emails.length = 0
    t.services.whatsapps.length = 0
  })

  const get = (url: string) => t.app.inject({ url, headers: { cookie } })
  const post = (url: string, payload?: object) =>
    t.app.inject({ method: 'POST', url, headers: { cookie }, payload: payload ?? {} })

  async function testOrder(over: Record<string, unknown> = {}) {
    const res = await post('/admin/api/orders/test', {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 3,
      answers: { first_love: 'יואב' },
      ...over,
    })
    expect(res.statusCode).toBe(200)
    return res.json().order as typeof orders.$inferSelect
  }

  async function redeem(orderId: number, stopIndex: number, at: Date, portions = 3) {
    const [o] = await t.db.select().from(orders).where(eq(orders.id, orderId))
    const stop = (o.game as GameSnapshot).stops[stopIndex]
    await t.db.insert(redemptions).values({
      orderId,
      stopIndex,
      stallId: stop.stall.id,
      tastingId: stop.tasting.id,
      portions,
      feeAgorot: stop.tasting.feeAgorot,
      redeemedAt: at,
    })
    return stop
  }

  describe('orders list and detail', () => {
    it('requires an owner for every new endpoint', async () => {
      for (const [method, url] of [
        ['GET', '/admin/api/orders/summary'],
        ['GET', '/admin/api/settlement'],
        ['GET', '/admin/api/settlement.csv'],
        ['GET', '/admin/api/leads'],
        ['POST', '/admin/api/orders/1/resend'],
        ['POST', '/admin/api/orders/1/cancel'],
        ['POST', '/admin/api/orders/1/payment-link'],
        ['POST', '/admin/api/leads/1/quote'],
      ] as const) {
        const res = await t.app.inject({ method, url })
        expect(res.statusCode, url).toBe(401)
      }
    })

    it('filters by status, kind and text, and shows bought vs. used', async () => {
      const o = await testOrder({ honoreeName: 'שירה', people: 4 })
      await redeem(o.id, 0, new Date())
      await redeem(o.id, 1, new Date(), 4)

      const byName = (await get(`/admin/api/orders?q=${encodeURIComponent('שיר')}`)).json()
      expect(byName.orders.map((x: { id: number }) => x.id)).toEqual([o.id])
      const row = byName.orders[0]
      expect(row.game).toBeUndefined()
      // 3 + 4 served at two stops of 4 bought: 1 unused so far.
      expect(row.usage).toEqual({ stops: 5, redeemedStops: 2, bought: 20, used: 7, players: null, unused: 1 })
      expect(byName.totals).toEqual({ bought: 20, used: 7 })

      const byNo = (await get(`/admin/api/orders?q=${o.orderNo.toLowerCase()}`)).json()
      expect(byNo.orders).toHaveLength(1)
      expect((await get('/admin/api/orders?kind=company&q=שירה')).json().orders).toHaveLength(0)
      expect((await get('/admin/api/orders?status=ready&kind=private')).json().orders.length).toBeGreaterThan(
        0,
      )
      expect((await get('/admin/api/orders?status=nope')).statusCode).toBe(400)

      const d = (await get(`/admin/api/orders/${o.id}`)).json()
      expect(d.usage).toEqual({ stops: 5, redeemedStops: 2, bought: 20, used: 7, players: null, unused: 1 })
      expect(d.redemptions[0]).toMatchObject({ stopIndex: 0, portions: 3, stallName: expect.any(String) })
      expect(d.links.qr).toBe(`/api/qr/${o.gameToken}.png`)
      expect(d.occasion).toMatchObject({ key: 'bachelorette', label: 'רווקות' })
      expect(d.questions.length).toBeGreaterThan(0)
      expect(d.messages).toEqual([])
      expect(d.paySessions).toEqual([])
    })

    it('counts orders per status for the review badge', async () => {
      await testOrder({ answers: { first_love: 'חחחחחחחח' } })
      const { counts } = (await get('/admin/api/orders/summary')).json()
      expect(counts.review).toBeGreaterThanOrEqual(1)
      expect(counts.ready).toBeGreaterThanOrEqual(1)
    })
  })

  describe('resend and cancel', () => {
    it('resends the game link and logs it', async () => {
      const o = await testOrder()
      await t.db
        .update(orders)
        .set({ buyerEmail: 'noa@example.com', buyerPhone: '050-1234567' })
        .where(eq(orders.id, o.id))
      const res = await post(`/admin/api/orders/${o.id}/resend`)
      expect(res.statusCode).toBe(200)
      expect(
        res
          .json()
          .messages.map((m: { channel: string }) => m.channel)
          .sort(),
      ).toEqual(['email', 'whatsapp'])
      expect(t.services.emails).toHaveLength(1)
      expect(t.services.emails[0].text).toContain(`/g/${o.gameToken}`)
      const d = (await get(`/admin/api/orders/${o.id}`)).json()
      expect(d.messages.find((m: { channel: string }) => m.channel === 'email')).toMatchObject({
        template: 'game_ready',
        to: 'noa@example.com',
      })
      expect(d.order.deliveredAt).not.toBeNull()
    })

    it('refuses to resend without a game or a contact', async () => {
      const o = await testOrder()
      expect((await post(`/admin/api/orders/${o.id}/resend`)).json().error).toBe('no_contact')
      await t.db.update(orders).set({ status: 'awaiting_answers' }).where(eq(orders.id, o.id))
      expect((await post(`/admin/api/orders/${o.id}/resend`)).json().error).toBe('not_ready')
      expect((await post('/admin/api/orders/999999/resend')).statusCode).toBe(404)
    })

    it('cancels an order not started, and refuses a started one', async () => {
      const o = await testOrder()
      const ok = await post(`/admin/api/orders/${o.id}/cancel`)
      expect(ok.statusCode).toBe(200)
      expect(ok.json()).toMatchObject({ order: { status: 'cancelled' }, refundNeeded: false })
      expect((await post(`/admin/api/orders/${o.id}/cancel`)).statusCode).toBe(400)

      const started = await testOrder()
      await t.app.inject({
        method: 'POST',
        url: `/api/manage/${started.manageToken}/start`,
        payload: { players: 2 },
      })
      const [st] = await t.db.select().from(gameStates).where(eq(gameStates.orderId, started.id))
      expect(st.startedAt).not.toBeNull()
      const no = await post(`/admin/api/orders/${started.id}/cancel`)
      expect(no.statusCode).toBe(400)
    })
  })

  describe('settlement', () => {
    it('sums fee × portions per stall, in Israel-time months', async () => {
      const o = await testOrder({ people: 2 })
      const s0 = await redeem(o.id, 0, new Date('2030-01-15T10:00:00Z'), 2)
      const s1 = await redeem(o.id, 1, new Date('2030-01-31T21:59:00Z'), 2) // 23:59 Israel, still January
      // 23:30 UTC on 31 Jan = 01:30 on 1 Feb in Israel: next month.
      const s2 = await redeem(o.id, 2, new Date('2030-01-31T23:30:00Z'), 2)

      const jan = (await get('/admin/api/settlement?month=2030-01')).json()
      expect(jan.totals.redemptions).toBe(2)
      expect(jan.totals.totalAgorot).toBe(2 * s0.tasting.feeAgorot + 2 * s1.tasting.feeAgorot)
      const stall0 = jan.stalls.find((s: { stallId: number }) => s.stallId === s0.stall.id)
      expect(stall0).toMatchObject({ redemptions: 1, portions: 2, totalAgorot: 2 * s0.tasting.feeAgorot })
      expect(stall0.rows[0]).toMatchObject({
        date: '2030-01-15',
        orderNo: o.orderNo,
        tastingName: s0.tasting.name,
        usedBackup: false,
      })

      const feb = (await get('/admin/api/settlement?month=2030-02')).json()
      expect(feb.totals.redemptions).toBe(1)
      expect(feb.stalls[0]).toMatchObject({ stallId: s2.stall.id, totalAgorot: 2 * s2.tasting.feeAgorot })
      expect(feb.stalls[0].rows[0].date).toBe('2030-02-01')

      expect((await get('/admin/api/settlement?month=2030-13')).statusCode).toBe(400)
    })

    it('exports CSV with a BOM', async () => {
      const res = await get('/admin/api/settlement.csv?month=2030-02')
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
      expect(res.headers['content-disposition']).toContain('settlement-2030-02.csv')
      const raw = res.rawPayload
      expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const lines = res.body.replace(/^﻿/, '').trimEnd().split('\r\n')
      expect(lines[0]).toContain('דוכן,תאריך,הזמנה')
      expect(lines).toHaveLength(4) // header, one redemption, stall total, month total
      expect(lines[1]).toContain('2030-02-01')
    })
  })

  describe('companies', () => {
    let leadId: number
    let orderId: number

    it('lists leads and updates their status and notes', async () => {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/leads',
        payload: {
          companyName: 'אקמה',
          contactName: 'דנה',
          phone: '050-7654321',
          email: 'dana@acme.example',
          occasionKey: 'team_day',
          people: 12,
        },
      })
      leadId = res.json().id
      const list = (await get('/admin/api/leads')).json()
      expect(list.items[0]).toMatchObject({ id: leadId, status: 'new', notes: '', order: null })
      const p = await t.app.inject({
        method: 'PATCH',
        url: `/admin/api/leads/${leadId}`,
        headers: { cookie },
        payload: { notes: 'דיברנו בטלפון' },
      })
      expect(p.json()).toMatchObject({ notes: 'דיברנו בטלפון', status: 'new' })
      expect((await get('/admin/api/leads?status=new')).json().items).toHaveLength(1)
    })

    it('creates a quote from a lead as a company order', async () => {
      const bad = await post(`/admin/api/leads/${leadId}/quote`, {
        occasionKey: 'bachelorette',
        people: 12,
        priceAgorot: 360000,
        themeId: ids.carmelThemeId,
        routeId: ids.carmelRouteId,
      })
      expect(bad.json().error).toBe('bad_occasion')

      const res = await post(`/admin/api/leads/${leadId}/quote`, {
        occasionKey: 'team_day',
        people: 12,
        priceAgorot: 360000,
        themeId: ids.carmelThemeId,
        routeId: ids.carmelRouteId,
      })
      expect(res.statusCode).toBe(201)
      const { order, links } = res.json()
      orderId = order.id
      expect(order).toMatchObject({
        kind: 'company',
        status: 'quoted',
        form: 'company',
        occasionKey: 'team_day',
        people: 12,
        priceAgorot: 360000,
        companyName: 'אקמה',
        buyerName: 'דנה',
        buyerEmail: 'dana@acme.example',
        buyerPhone: '050-7654321',
      })
      expect(links.payLink).toBe(`http://localhost/pay/${order.manageToken}`)
      const [lead] = await t.db.select().from(leads).where(eq(leads.id, leadId))
      expect(lead).toMatchObject({ orderId, status: 'quoted' })
      expect((await post(`/admin/api/leads/${leadId}/quote`, { occasionKey: 'team_day' })).statusCode).toBe(
        400,
      )
      const again = await post(`/admin/api/leads/${leadId}/quote`, {
        occasionKey: 'team_day',
        people: 12,
        priceAgorot: 360000,
        themeId: ids.carmelThemeId,
        routeId: ids.carmelRouteId,
      })
      expect(again.statusCode).toBe(409)
      const d = (await get(`/admin/api/orders/${orderId}`)).json()
      expect(d.lead.id).toBe(leadId)
      expect(d.questions.map((q: { slot: string }) => q.slot)).toContain('company_catchphrase')
    })

    it('returns the payment link and sends it to the contact', async () => {
      const plain = (await post(`/admin/api/orders/${orderId}/payment-link`)).json()
      expect(plain.url).toMatch(/^http:\/\/localhost\/pay\//)
      expect(t.services.emails).toHaveLength(0)
      const sent = await post(`/admin/api/orders/${orderId}/payment-link`, { send: true })
      expect(sent.statusCode).toBe(200)
      expect(t.services.emails).toHaveLength(1)
      expect(t.services.emails[0]).toMatchObject({
        to: 'dana@acme.example',
        subject: expect.stringContaining('הצעת מחיר'),
      })
      expect(t.services.emails[0].text).toContain('3600.00')
      expect(t.services.emails[0].text).toContain(plain.url)
      expect(sent.json().messages.map((m: { template: string }) => m.template)).toContain(
        'company_payment_link',
      )
      // The public pay endpoint accepts the quoted order.
      const [o] = await t.db.select().from(orders).where(eq(orders.id, orderId))
      const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${o.manageToken}/pay` })
      expect(pay.statusCode).toBe(200)
    })

    it('uploads a logo and extracts the palette; the owner can override it', async () => {
      const png = await sharp({
        create: { width: 40, height: 40, channels: 4, background: { r: 200, g: 20, b: 120, alpha: 1 } },
      })
        .png()
        .toBuffer()
      const boundary = '----mrtest'
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ])
      const res = await t.app.inject({
        method: 'POST',
        url: `/admin/api/orders/${orderId}/logo`,
        headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: body,
      })
      expect(res.statusCode).toBe(200)
      const r = res.json()
      expect(r.order.companyLogo).toMatch(/^logos\/[A-Za-z0-9_-]+\.png$/)
      expect(existsSync(path.join(t.config.uploadDir, r.order.companyLogo))).toBe(true)
      expect(r.palette).toMatchObject({ background: '#EADBC8', paper: '#FFFBF4', accent: '#C81478' })
      expect(r.order.companyPalette.accent).toBe('#C81478')
      const d = (await get(`/admin/api/orders/${orderId}`)).json()
      expect(d.uploads[0]).toMatchObject({ kind: 'logo', path: r.order.companyLogo })

      const over = await t.app.inject({
        method: 'PATCH',
        url: `/admin/api/orders/${orderId}/company`,
        headers: { cookie },
        payload: { companyPalette: { ...r.palette, accent: '#123456' } },
      })
      expect(over.json().order.companyPalette.accent).toBe('#123456')
      const badHex = await t.app.inject({
        method: 'PATCH',
        url: `/admin/api/orders/${orderId}/company`,
        headers: { cookie },
        payload: { companyPalette: { ...r.palette, accent: 'red' } },
      })
      expect(badHex.statusCode).toBe(400)

      const txt = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhi`,
        ),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ])
      const no = await t.app.inject({
        method: 'POST',
        url: `/admin/api/orders/${orderId}/logo`,
        headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: txt,
      })
      expect(no.statusCode).toBe(400)
    })

    it('stores company answers; marking them done after payment builds and delivers the game', async () => {
      const draft = await t.app.inject({
        method: 'PUT',
        url: `/admin/api/orders/${orderId}/company-answers`,
        headers: { cookie },
        payload: { answers: { company_catchphrase: 'יאללה דיפלוי', kitchen_favorite: '' } },
      })
      expect(draft.json().order).toMatchObject({
        status: 'quoted',
        answers: { company_catchphrase: 'יאללה דיפלוי' },
        answersSubmittedAt: null,
      })

      // Pay through the real settle path.
      const [o] = await t.db.select().from(orders).where(eq(orders.id, orderId))
      const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${o.manageToken}/pay` })
      const token = new URL(pay.json().url).searchParams.get('mr_token')!
      const tx = normalizeRow({
        index: String(Math.floor(Math.random() * 1e9)),
        amount: 360000,
        currency: 1,
        processor_response_code: '000',
        txn_type: 'DEBIT',
        tranmode: 'A',
        mr_token: token,
      })
      t.services.emails.length = 0
      expect(await decideRow(t.db, t.services, 'http://localhost', tx)).toEqual({ outcome: 'settled' })
      const [paid] = await t.db.select().from(orders).where(eq(orders.id, orderId))
      expect(paid.status).toBe('awaiting_answers')
      // No "answer the questions" email to a company: the owner is alerted instead.
      expect(t.services.emails.map((e) => e.to)).toEqual(['owner@example.com'])
      const [lead] = await t.db.select().from(leads).where(eq(leads.id, leadId))
      expect(lead.status).toBe('won')

      // Pricing is frozen once paid.
      const reprice = await t.app.inject({
        method: 'PATCH',
        url: `/admin/api/orders/${orderId}/company`,
        headers: { cookie },
        payload: { priceAgorot: 100 },
      })
      expect(reprice.json().error).toBe('already_paid')

      t.services.emails.length = 0
      const done = await t.app.inject({
        method: 'PUT',
        url: `/admin/api/orders/${orderId}/company-answers`,
        headers: { cookie },
        payload: {
          answers: {
            company_catchphrase: 'יאללה דיפלוי',
            memorable_project: 'המעבר לענן',
            kitchen_favorite: 'במבה',
            last_offsite: 'אילת',
          },
          done: true,
        },
      })
      expect(done.statusCode).toBe(200)
      const built = done.json().order
      expect(built.flags).toEqual([])
      expect(built.status).toBe('ready')
      expect(built.answersSubmittedAt).not.toBeNull()
      expect(built.game.company).toMatchObject({ name: 'אקמה' })
      expect(built.game.theme.palette.accent).toBe('#123456')
      expect(built.deliveredAt).not.toBeNull()
      expect(t.services.emails[0]).toMatchObject({ to: 'dana@acme.example', subject: 'המשחק של אקמה מוכן' })

      expect((await post(`/admin/api/orders/${orderId}/payment-link`)).json().error).toBe('already_paid')
      const lead2 = (await get('/admin/api/leads')).json().items.find((l: { id: number }) => l.id === leadId)
      expect(lead2.order).toMatchObject({ status: 'ready', paid: true })
    })

    it('refuses company endpoints on a private order', async () => {
      const p = await testOrder()
      expect((await post(`/admin/api/orders/${p.id}/payment-link`)).json().error).toBe('not_company')
    })
  })
})
