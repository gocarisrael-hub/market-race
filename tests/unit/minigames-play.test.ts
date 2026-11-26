// Mini-games in a played game: placed between stops, shared by every phone through the same
// version-guarded state, solutions never sent, the captain alone can skip, pause and resume work.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gameStates, orders } from '../../src/server/db/schema.ts'
import { captainToken } from '../../src/server/lib/tokens.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { act, getView, pauseGame, resumeGame, startGame } from '../../src/server/services/play.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

const ANSWERS = ['תקווה', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים']
const RICH = {
  first_love: 'יואב מהשכבה',
  catchphrase: 'אני רק שואלת',
  favorite_food: 'שקשוקה',
  favorite_place: 'הכנרת',
  one_word: 'עקשנית',
  dream: 'לגור בפריז',
}

describe('mini-games in play', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())

  async function newGame(answers: Record<string, string> = RICH) {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 4,
      answers,
      letterNotes: [{ text: 'נחכה לך עוד חמישים שנה.', signature: 'נועה' }],
    })
    const built = await buildOrderGame(t.db, o.id)
    expect(built.status).toBe('ready')
    return built
  }
  const view = async (token: string) => {
    const v = await getView(t.db, token)
    if (typeof v === 'string') throw new Error(v)
    return v
  }
  async function playStop(token: string, i: number) {
    await act(t.db, token, { type: 'answer', stopIndex: i, answer: ANSWERS[i] })
    await act(t.db, token, { type: 'arrived', stopIndex: i })
    return act(t.db, token, { type: 'redeemed', stopIndex: i })
  }
  const solution = async (orderId: number, i: number) => {
    const [o] = await t.db.select().from(orders).where(eq(orders.id, orderId))
    return o.game!.minigames![i]
  }
  const answerFor = (g: Awaited<ReturnType<typeof solution>>) =>
    g.type === 'true_false'
      ? { truths: g.solution.truths }
      : g.type === 'cipher'
        ? { text: g.solution.text }
        : { option: g.solution.option }

  it('builds two mini-games after stops 2 and 4 from the answers, and none without them', async () => {
    const o = await newGame()
    expect(o.game!.minigames!.map((g) => g.afterStop)).toEqual([2, 4])
    const plain = await newGame({ first_love: 'יואב מהשכבה' })
    expect(plain.game!.minigames).toEqual([])
  })

  it('plays a stop, a mini-game and the next stop, never sending the solution', async () => {
    const o = await newGame()
    await startGame(t.db, o.gameToken)
    let v = await view(o.gameToken)
    expect(v.stages).toHaveLength(7)
    expect(v.stage).toBe(1)
    expect(v.stages.map((s) => s.kind)).toEqual(['stop', 'stop', 'game', 'stop', 'stop', 'game', 'stop'])

    await playStop(o.gameToken, 0)
    const r = await playStop(o.gameToken, 1)
    if (!r.ok) throw new Error(r.error)
    expect(r.view.step).toBe('minigame')
    expect(r.view.stopIndex).toBe(2)
    expect(r.view.stage).toBe(3)
    expect(r.view.current).toBeNull()
    expect(r.view.minigame).toMatchObject({ index: 0, solved: false, reward: null })

    const g = await solution(o.id, 0)
    v = await view(o.gameToken)
    const json = JSON.stringify(v)
    expect(json).not.toContain('solution')
    expect(json).not.toContain('truths')
    expect(json).not.toContain('חמישים') // the reward waits for the solve
    if (g.type === 'cipher') expect(json).not.toContain(g.solution.text!)

    // A wrong answer changes nothing; the stale stop is refused.
    const wrong =
      g.type === 'true_false'
        ? { truths: g.solution.truths!.map((x) => !x) }
        : g.type === 'cipher'
          ? { text: 'סתם' }
          : { option: (g.solution.option! + 1) % g.options!.length }
    const w = await act(t.db, o.gameToken, { type: 'minigame', stopIndex: 2, game: 0, answer: wrong })
    expect(w.ok && w.correct).toBe(false)
    const stale = await act(t.db, o.gameToken, { type: 'answer', stopIndex: 2, answer: ANSWERS[2] })
    expect(stale.ok).toBe(false)
    // Continue before solving is stale too.
    expect((await act(t.db, o.gameToken, { type: 'minigame_continue', stopIndex: 2, game: 0 })).ok).toBe(
      false,
    )

    const right = await act(t.db, o.gameToken, {
      type: 'minigame',
      stopIndex: 2,
      game: 0,
      answer: answerFor(g),
    })
    if (!right.ok) throw new Error(right.error)
    expect(right.correct).toBe(true)
    expect(right.view.minigame).toMatchObject({
      solved: true,
      reward: { text: 'נחכה לך עוד חמישים שנה.', signature: 'נועה' },
    })
    // Another phone answering again just sees it solved.
    const again = await act(t.db, o.gameToken, {
      type: 'minigame',
      stopIndex: 2,
      game: 0,
      answer: answerFor(g),
    })
    expect(again.ok && again.correct).toBe(true)

    const next = await act(t.db, o.gameToken, { type: 'minigame_continue', stopIndex: 2, game: 0 })
    if (!next.ok) throw new Error(next.error)
    expect(next.view.step).toBe('riddle')
    expect(next.view.current?.index).toBe(2)
    expect(next.view.stage).toBe(4)
    expect(next.view.stages[2].state).toBe('done')
    const third = await act(t.db, o.gameToken, { type: 'answer', stopIndex: 2, answer: ANSWERS[2] })
    expect(third.ok && third.correct).toBe(true)
  })

  it('only the captain skips a mini-game, and the game goes on to the next stop', async () => {
    const o = await newGame()
    await startGame(t.db, o.gameToken)
    await playStop(o.gameToken, 0)
    await playStop(o.gameToken, 1)
    const skip = (headers: Record<string, string> = {}) =>
      t.app.inject({
        method: 'POST',
        url: `/api/game/${o.gameToken}/action`,
        headers,
        payload: { type: 'minigame_skip', stopIndex: 2, game: 0 },
      })
    expect((await skip()).statusCode).toBe(403)
    expect((await skip({ 'x-captain': 'not-the-token' })).statusCode).toBe(403)
    const ok = await skip({ 'x-captain': captainToken(o.manageToken) })
    expect(ok.statusCode).toBe(200)
    const v = ok.json().view
    expect(v.step).toBe('riddle')
    expect(v.stages[2]).toMatchObject({ kind: 'game', state: 'skipped' })
    const [s] = await t.db.select().from(gameStates).where(eq(gameStates.orderId, o.id))
    expect(s.minigamesSkipped).toEqual([0])
    expect(s.minigamesSolved).toEqual([])
  })

  it('pauses and resumes on a mini-game, at the same game', async () => {
    const o = await newGame()
    await startGame(t.db, o.gameToken)
    await playStop(o.gameToken, 0)
    await playStop(o.gameToken, 1)
    const p = await pauseGame(t.db, o.gameToken)
    expect(p.ok && p.changed).toBe(true)
    const paused = await view(o.gameToken)
    expect(paused.status).toBe('paused')
    expect(paused.minigame).toBeNull()
    const refused = await act(t.db, o.gameToken, {
      type: 'minigame',
      stopIndex: 2,
      game: 0,
      answer: { option: 0 },
    })
    expect(refused.ok).toBe(false)
    expect((await resumeGame(t.db, o.gameToken)).ok).toBe(true)
    const back = await view(o.gameToken)
    expect(back.step).toBe('minigame')
    expect(back.minigame?.index).toBe(0)
  })

  it('the owner regenerates a mini-game until the group reaches it', async () => {
    const o = await newGame()
    const cookie = await ownerCookie(t.app)
    const api = { post: (url: string) => t.app.inject({ method: 'POST', url, headers: { cookie } }) }
    const before = o.game!.minigames!
    const res = await api.post(`/admin/api/orders/${o.id}/minigames/1/regenerate`)
    expect(res.statusCode).toBe(200)
    const after = res.json().order.game.minigames
    expect(after[0]).toEqual(before[0])
    expect(after[1].afterStop).toBe(4)
    expect(after[1].type).not.toBe(after[0].type)
    expect((await api.post(`/admin/api/orders/${o.id}/minigames/5/regenerate`)).statusCode).toBe(400)

    await startGame(t.db, o.gameToken)
    await playStop(o.gameToken, 0)
    await playStop(o.gameToken, 1)
    expect((await api.post(`/admin/api/orders/${o.id}/minigames/0/regenerate`)).statusCode).toBe(400)
    expect((await api.post(`/admin/api/orders/${o.id}/minigames/1/regenerate`)).statusCode).toBe(200)
  })
})
