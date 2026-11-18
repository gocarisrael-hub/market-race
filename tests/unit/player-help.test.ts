import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { gameStates, orders, stalls } from '../../src/server/db/schema.ts'
import { toWaId, waLink } from '../../src/server/domain/phone.ts'
import type { GameSnapshot } from '../../src/server/domain/types.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { act, type PlayerView } from '../../src/server/services/play.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { setSetting } from '../../src/server/services/settings.ts'
import { makeT } from '../../src/web/player/copy.ts'
import { canReportClosed, supportHref, supportText } from '../../src/web/player/support.ts'
import { makeTestApp } from '../helpers/app.ts'

describe('the WhatsApp link', () => {
  it('normalizes Israeli mobiles and refuses anything else', () => {
    expect(toWaId('054-6577715')).toBe('972546577715')
    expect(toWaId('+972 54 657 7715')).toBe('972546577715')
    expect(toWaId('03-1234567')).toBeNull()
    expect(waLink('')).toBeNull()
    expect(waLink('0546577715')).toBe('https://wa.me/972546577715')
    expect(waLink('0546577715', 'היי, מה?')).toBe(
      `https://wa.me/972546577715?text=${encodeURIComponent('היי, מה?')}`,
    )
  })

  const t = makeT('she')
  const view = (over: Partial<PlayerView>) =>
    ({ honoree: 'מיכל', step: 'riddle', stopIndex: 2, current: null, ...over }) as PlayerView

  it('prefills the honoree and the current stop, never the order number', () => {
    const s = { whatsapp: '0546577715', message: '' }
    expect(supportText(s, view({}), t)).toBe('היי, אנחנו במירוץ של מיכל, בתחנה 3.')
    expect(supportText(s, view({ step: 'opening' }), t)).toBe('היי, אנחנו במירוץ של מיכל.')
    expect(supportHref(s, view({}), t)).toBe(
      `https://wa.me/972546577715?text=${encodeURIComponent('היי, אנחנו במירוץ של מיכל, בתחנה 3.')}`,
    )
  })

  it("uses the owner's message, filled, and drops what it can't fill", () => {
    const s = { whatsapp: '0546577715', message: 'שלום, {name} בתחנה {n}' }
    expect(supportText(s, view({}), t)).toBe('שלום, מיכל בתחנה 3')
    expect(supportText(s, view({ step: 'done' }), t)).toBe('שלום, מיכל בתחנה')
  })

  it('has no link without a valid number', () => {
    expect(supportHref({ whatsapp: '', message: '' }, view({}), t)).toBeNull()
    expect(supportHref({ whatsapp: '12', message: '' }, view({}), t)).toBeNull()
  })

  it('offers "the stall is closed" only while a stall is shown', () => {
    const reveal = { stall: { id: 1 } } as never
    expect(canReportClosed(view({ step: 'riddle' }))).toBe(false)
    expect(canReportClosed(view({ step: 'revealed', current: { reveal } as never }))).toBe(true)
    expect(canReportClosed(view({ step: 'redeem', current: { reveal } as never }))).toBe(true)
  })
})

describe('reporting a closed stall', () => {
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

  async function revealed() {
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
      answers: { first_love: 'יואב מהשכבה' },
    })
    const built = await buildOrderGame(t.db, o.id)
    await act(t.db, built.gameToken, { type: 'start' })
    const r = await act(t.db, built.gameToken, { type: 'answer', stopIndex: 0, answer: 'תקווה' })
    if (!r.ok) throw new Error(r.error)
    return { order: built, token: built.gameToken, view: r.view }
  }

  const post = (token: string, payload: object) =>
    t.app.inject({ method: 'POST', url: `/api/game/${token}/action`, payload })

  it('sends the support contact with the game view', async () => {
    const { token } = await revealed()
    let res = await t.app.inject({ url: `/api/game/${token}` })
    expect(res.json().support).toEqual({ whatsapp: '', message: '' })
    await setSetting(t.db, 'support_whatsapp', '0546577715')
    await setSetting(t.db, 'support_message', 'היי {name}')
    res = await t.app.inject({ url: `/api/game/${token}` })
    expect(res.json().support).toEqual({ whatsapp: '0546577715', message: 'היי {name}' })
  })

  it('switches the stop to its backup, back on the map, and alerts the owner', async () => {
    const { order, token, view } = await revealed()
    const original = view.current!.reveal!.stall
    await act(t.db, token, { type: 'arrived', stopIndex: 0 })
    const res = await post(token, { type: 'stall_closed', stopIndex: 0, stallId: original.id })
    expect(res.statusCode).toBe(200)
    const v = res.json().view as PlayerView
    expect(res.json().noBackup).toBeUndefined()
    expect(v.step).toBe('revealed')
    expect(v.version).toBeGreaterThan(view.version + 1)
    expect(v.current?.reveal).toMatchObject({
      usingBackup: true,
      originalStallName: 'דוכן המיצים של תקווה',
      closedNote: null,
      stall: { name: 'מיצים בפינה' },
    })
    const [st] = await t.db.select().from(gameStates).where(eq(gameStates.orderId, order.id))
    expect(st.backupStops).toEqual([0])
    expect(t.services.emails).toHaveLength(1)
    expect(t.services.emails[0].subject).toContain(order.orderNo)
    expect(t.services.emails[0].text).toContain('תחנה 1 מתוך 5')
    expect(t.services.emails[0].text).toContain('דוכן המיצים של תקווה')
    expect(t.services.emails[0].text).toContain('מיצים בפינה')
    // One group's report never closes the stall for everyone.
    const [s] = await t.db.select().from(stalls).where(eq(stalls.id, original.id))
    expect(s.closedOn).toBeNull()
  })

  it('treats a second phone reporting the stall already swapped as stale', async () => {
    const { token, view } = await revealed()
    const original = view.current!.reveal!.stall
    const first = await post(token, { type: 'stall_closed', stopIndex: 0, stallId: original.id })
    expect(first.statusCode).toBe(200)
    const again = await post(token, { type: 'stall_closed', stopIndex: 0, stallId: original.id })
    expect(again.statusCode).toBe(409)
    expect(again.json().view.current.reveal.stall.name).toBe('מיצים בפינה')
    expect(t.services.emails).toHaveLength(1)
  })

  it('is stale on the riddle step or for another stop', async () => {
    const { token } = await revealed()
    expect(await act(t.db, token, { type: 'stall_closed', stopIndex: 1 })).toMatchObject({
      ok: false,
      error: 'stale',
    })
    await act(t.db, token, { type: 'arrived', stopIndex: 0 })
    await act(t.db, token, { type: 'redeemed', stopIndex: 0 })
    expect(await act(t.db, token, { type: 'stall_closed', stopIndex: 1 })).toMatchObject({
      ok: false,
      error: 'stale',
    })
    expect(t.services.emails).toHaveLength(0)
  })

  it('without a backup leaves the game alone, flags it and alerts the owner', async () => {
    const { order, token, view } = await revealed()
    const game = structuredClone(order.game) as GameSnapshot
    game.stops[0].backup = null
    await t.db.update(orders).set({ game }).where(eq(orders.id, order.id))
    const res = await post(token, { type: 'stall_closed', stopIndex: 0 })
    expect(res.statusCode).toBe(200)
    expect(res.json().noBackup).toBe(true)
    const v = res.json().view as PlayerView
    expect(v.version).toBe(view.version)
    expect(v.current?.reveal?.usingBackup).toBe(false)
    expect(t.services.emails).toHaveLength(1)
    expect(t.services.emails[0].subject).toContain('אין דוכן חלופי')
  })

  it('on the backup stall itself there is nowhere else to go', async () => {
    const { token, view } = await revealed()
    await act(t.db, token, { type: 'stall_closed', stopIndex: 0, stallId: view.current!.reveal!.stall.id })
    const r = await act(t.db, token, { type: 'stall_closed', stopIndex: 0 })
    expect(r).toMatchObject({ ok: true, noBackup: true })
  })
})
