// Hints behind a personal question: the buyer adds questions about the honoree (optional); the game
// asks one before it shows a riddle's hint. The answer never reaches the player client.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders } from '../../src/server/db/schema.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { act, getView, hintQuestionFor, startGame } from '../../src/server/services/play.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

const QS = [
  { question: 'איך קוראים לכלב שלה?', answer: 'שוקו' },
  { question: 'באיזו עיר היא נולדה?', answer: 'חיפה' },
]

describe('hint questions', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp({}, { provider: 'mock' })
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())

  async function startedGame(hintQuestions = QS) {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 4,
      answers: { first_love: 'יואב' },
    })
    await t.db.update(orders).set({ hintQuestions }).where(eq(orders.id, o.id))
    const built = await buildOrderGame(t.db, o.id)
    expect((await startGame(t.db, built.gameToken)).ok).toBe(true)
    return built
  }
  const riddle = async (token: string) => {
    const v = await getView(t.db, token)
    if (typeof v === 'string') throw new Error(v)
    return v.current!.riddle
  }

  it('picks one question per stop, in turn, skipping incomplete ones', () => {
    expect(hintQuestionFor([], 0)).toBeNull()
    expect(hintQuestionFor(undefined, 3)).toBeNull()
    expect(hintQuestionFor(QS, 0)).toBe(QS[0])
    expect(hintQuestionFor(QS, 1)).toBe(QS[1])
    expect(hintQuestionFor(QS, 2)).toBe(QS[0])
    expect(hintQuestionFor([{ question: 'x', answer: ' ' }, QS[1]], 0)).toBe(QS[1])
  })

  it('asks the question, never sends its answer, and opens the hint on a right answer', async () => {
    const o = await startedGame()
    let r = await riddle(o.gameToken)
    expect(r).toMatchObject({ hint: null, hasHint: true, hintQuestion: 'איך קוראים לכלב שלה?' })
    const http = await t.app.inject({ url: `/api/game/${o.gameToken}` })
    expect(http.body).toContain('איך קוראים לכלב שלה?')
    for (const secret of ['שוקו', 'חיפה', 'באיזו עיר']) expect(http.body).not.toContain(secret)

    // No answer or a wrong one: the hint stays hidden, they can try again.
    expect(await act(t.db, o.gameToken, { type: 'hint', stopIndex: 0 })).toMatchObject({
      ok: true,
      correct: false,
    })
    const wrong = await act(t.db, o.gameToken, { type: 'hint', stopIndex: 0, answer: 'במבה' })
    expect(wrong).toMatchObject({ ok: true, correct: false })
    expect(wrong.ok && wrong.view.current?.riddle.hint).toBeNull()

    // The forgiving matcher: one letter off still counts.
    const right = await t.app.inject({
      method: 'POST',
      url: `/api/game/${o.gameToken}/action`,
      payload: { type: 'hint', stopIndex: 0, answer: ' שוקוו ' },
    })
    expect(right.statusCode).toBe(200)
    expect(right.json().correct).toBe(true)
    expect(right.json().view.current.riddle).toMatchObject({ hint: 'זה גם שם של המנון', hintQuestion: null })
    r = await riddle(o.gameToken)
    expect(r.hint).toBe('זה גם שם של המנון')

    // The next stop asks the next question.
    await act(t.db, o.gameToken, { type: 'answer', stopIndex: 0, answer: 'תקווה' })
    await act(t.db, o.gameToken, { type: 'arrived', stopIndex: 0 })
    await act(t.db, o.gameToken, { type: 'redeemed', stopIndex: 0 })
    expect((await riddle(o.gameToken)).hintQuestion).toBe('באיזו עיר היא נולדה?')
  })

  it('without personal questions, hints work as before', async () => {
    const o = await startedGame([])
    expect((await riddle(o.gameToken)).hintQuestion).toBeNull()
    const r = await act(t.db, o.gameToken, { type: 'hint', stopIndex: 0 })
    expect(r.ok && r.view.current?.riddle.hint).toBe('זה גם שם של המנון')
  })

  it('the order flow and the edit link store them, only complete pairs', async () => {
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
        hintQuestions: [...QS, { question: 'בלי תשובה', answer: '' }],
        buyer: { name: 'נועה', phone: '0501234567', email: 'noa@example.com' },
      },
    })
    expect(res.statusCode).toBe(200)
    const { manageToken } = res.json()
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, manageToken))
    expect(o.hintQuestions).toEqual(QS)

    let m = (await t.app.inject({ url: `/api/manage/${manageToken}` })).json()
    expect(m.hintQuestions).toEqual(QS)
    const put = await t.app.inject({
      method: 'PUT',
      url: `/api/manage/${manageToken}/answers`,
      payload: {
        answers: { first_love: 'יואב' },
        hintQuestions: [{ question: ' מה הצבע? ', answer: ' כחול ' }],
      },
    })
    expect(put.statusCode).toBe(200)
    m = (await t.app.inject({ url: `/api/manage/${manageToken}` })).json()
    expect(m.hintQuestions).toEqual([{ question: 'מה הצבע?', answer: 'כחול' }])
    // An edit without the field keeps them.
    await t.app.inject({
      method: 'PUT',
      url: `/api/manage/${manageToken}/answers`,
      payload: { answers: { first_love: 'יואב' } },
    })
    m = (await t.app.inject({ url: `/api/manage/${manageToken}` })).json()
    expect(m.hintQuestions).toHaveLength(1)
  })
})
