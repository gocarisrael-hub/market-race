// The buyer's edit link (/m/:token): name, answers and letter notes change any number of times
// until the game starts; a paid, built game is rebuilt so it shows the edit.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { orders } from '../../src/server/db/schema.ts'
import type { GameSnapshot } from '../../src/server/domain/types.ts'
import { approveOrder } from '../../src/server/services/orders.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { setSetting } from '../../src/server/services/settings.ts'
import { makeTestApp } from '../helpers/app.ts'

const riddleText = (g: GameSnapshot, i: number) => g.stops[i].riddle.parts.map((p) => p.v).join('')

describe('buyer edits through the manage link', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp({}, { provider: 'mock' })
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())
  beforeEach(() => {
    t.services.emails.length = 0
  })

  async function paidOrder(over: Record<string, unknown> = {}) {
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
        letterNotes: [{ text: 'מזל טוב', signature: 'נועה' }],
        buyer: { name: 'נועה', phone: '0501234567', email: 'noa@example.com' },
        ...over,
      },
    })
    const { manageToken } = res.json()
    const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${manageToken}/pay` })
    const s = new URL(pay.json().url).searchParams.get('s')!
    await t.app.inject({ method: 'POST', url: '/api/payment/mock/complete', payload: { token: s } })
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, manageToken))
    return o
  }
  const edit = (token: string, payload: Record<string, unknown>) =>
    t.app.inject({ method: 'PUT', url: `/api/manage/${token}/answers`, payload })
  const reload = async (id: number) => (await t.db.select().from(orders).where(eq(orders.id, id)))[0]

  it('the game-ready email carries the edit link and line', async () => {
    const o = await paidOrder()
    expect(o.status).toBe('ready')
    const mail = t.services.emails.find((e) => e.subject === 'המשחק של מיכל מוכן')!
    expect(mail.text).toContain('אפשר לשנות תשובות, תמונות וצבע עד שמתחילים לשחק')
    expect(mail.text).toContain(`/m/${o.manageToken}`)
  })

  it('serves the edit data, and a change rebuilds the built game without resending it', async () => {
    const o = await paidOrder()
    expect(riddleText(o.game!, 0)).toContain('יואב')
    t.services.emails.length = 0

    const m = (await t.app.inject({ url: `/api/manage/${o.manageToken}` })).json()
    expect(m).toMatchObject({
      editable: true,
      honoreeName: 'מיכל',
      answers: { first_love: 'יואב' },
      letterNotes: [{ text: 'מזל טוב', signature: 'נועה' }],
    })
    expect(m.questions.length).toBeGreaterThan(3)

    const res = await edit(o.manageToken, {
      honoreeName: 'מיכלי',
      answers: { first_love: 'דני מהצבא' },
      letterNotes: [{ text: 'אוהבות', signature: 'הבנות' }],
    })
    expect(res.json()).toEqual({ status: 'ready' })
    const after = await reload(o.id)
    expect(after.honoreeName).toBe('מיכלי')
    expect(riddleText(after.game!, 0)).toContain('דני מהצבא')
    expect(riddleText(after.game!, 0)).toContain('מיכלי')
    expect(after.game!.honoree).toBe('מיכלי')
    expect(after.game!.letter.notes).toEqual([{ text: 'אוהבות', signature: 'הבנות' }])
    // Delivered once; an edit does not send the game again.
    expect(t.services.emails).toHaveLength(0)

    // And again: no "answers once" lock.
    expect((await edit(o.manageToken, { answers: { first_love: 'רון' } })).statusCode).toBe(200)
    expect(riddleText((await reload(o.id)).game!, 0)).toContain('רון')
  })

  it('odd answers in an edit send the game to review and tell the owner', async () => {
    const o = await paidOrder()
    t.services.emails.length = 0
    const res = await edit(o.manageToken, { answers: { first_love: 'חחחחחחחחח' } })
    expect(res.json().status).toBe('review')
    expect(t.services.emails.map((e) => e.to)).toEqual(['owner@example.com'])
    // The player link is closed while it waits for the owner.
    expect((await t.app.inject({ url: `/api/game/${o.gameToken}` })).statusCode).toBe(409)
  })

  it('keeps what the owner approved when the buyer changes something else', async () => {
    await setSetting(t.db, 'odd_rules', { profanity: ['טמבל'], maxRepeatedChars: 4 })
    const o = await paidOrder({ answers: { first_love: 'הטמבל מהשכבה' } })
    expect(o.status).toBe('review')
    await approveOrder(t.db, o.id)
    const res = await edit(o.manageToken, {
      answers: { first_love: 'הטמבל מהשכבה', favorite_food: 'חמין' },
    })
    expect(res.json().status).toBe('ready')
    // A new problem still goes to review.
    const again = await edit(o.manageToken, {
      answers: { first_love: 'הטמבל מהשכבה', favorite_food: 'חחחחחחח' },
    })
    expect(again.json().status).toBe('review')
    await setSetting(t.db, 'odd_rules', { profanity: [], maxRepeatedChars: 4 })
  })

  it('locks once the game starts', async () => {
    const o = await paidOrder()
    const start = await t.app.inject({
      method: 'POST',
      url: `/api/game/${o.gameToken}/action`,
      payload: { type: 'start' },
    })
    expect(start.statusCode).toBe(200)
    const res = await edit(o.manageToken, { answers: { first_love: 'מאוחר מדי' } })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('locked')
    const after = await reload(o.id)
    expect(after.answers.first_love).toBe('יואב')
    expect(riddleText(after.game!, 0)).toContain('יואב')
    const m = (await t.app.inject({ url: `/api/manage/${o.manageToken}` })).json()
    expect(m.editable).toBe(false)
    expect(m.answers).toBeUndefined()
    expect(m.letterNotes).toBeUndefined()
  })

  it('an unpaid order saves without building; company orders are not edited here', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        occasionKey: 'bachelorette',
        form: 'she',
        honoreeName: 'מיכל',
        themeId: ids.carmelThemeId,
        people: 4,
      },
    })
    const token = res.json().manageToken
    const put = await edit(token, { answers: { first_love: 'יואב' } })
    expect(put.json()).toEqual({ status: 'pending_payment' })
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, token))
    expect(o.game).toBeNull()
    expect(o.answers).toEqual({ first_love: 'יואב' })

    await t.db.update(orders).set({ kind: 'company' }).where(eq(orders.id, o.id))
    expect((await edit(token, { answers: {} })).json().error).toBe('not_editable')
    expect((await t.app.inject({ url: `/api/manage/${token}` })).json().editable).toBe(false)
  })

  it('rejects an empty name', async () => {
    const o = await paidOrder()
    expect((await edit(o.manageToken, { honoreeName: '  ', answers: {} })).statusCode).toBe(400)
  })
})
