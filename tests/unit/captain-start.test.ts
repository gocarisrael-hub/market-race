// The buyer is the captain: only the manage link starts the game, with the players who arrived.
// Every stall then serves that many portions, and the admin sees the unused ones.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gameStates, orders, redemptions } from '../../src/server/db/schema.ts'
import { israelDate } from '../../src/server/domain/dates.ts'
import { usage } from '../../src/server/routes/admin-orders.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { act, getView, startBlock, startGame } from '../../src/server/services/play.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { SETTING_DEFAULTS, setSetting } from '../../src/server/services/settings.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

const ANSWERS = ['תקווה', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים']

describe('captain start', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  let cookie: string
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
    cookie = await ownerCookie(t.app)
  })
  afterAll(() => t.close())

  async function newGame(people = 5) {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people,
      answers: { first_love: 'יואב מהשכבה' },
      buyerName: 'נועה',
    })
    const built = await buildOrderGame(t.db, o.id)
    expect(built.status).toBe('ready')
    return built
  }
  const manage = async (token: string) => (await t.app.inject({ url: `/api/manage/${token}` })).json()
  const start = (token: string, players: unknown) =>
    t.app.inject({ method: 'POST', url: `/api/manage/${token}/start`, payload: { players } })

  it('knows when the captain can start', () => {
    const today = '2026-11-18'
    const ready = { status: 'ready', validUntil: '2027-11-18', game: {} }
    expect(startBlock(ready, undefined, today)).toBeNull()
    expect(startBlock(ready, { step: 'opening' }, today)).toBeNull()
    expect(startBlock(ready, { step: 'riddle' }, today)).toBe('started')
    expect(startBlock({ ...ready, status: 'active' }, undefined, today)).toBe('started')
    expect(startBlock({ ...ready, status: 'review' }, undefined, today)).toBe('not_ready')
    expect(startBlock({ ...ready, game: null }, undefined, today)).toBe('not_ready')
    // Israel time: valid through its last day, not the day after.
    expect(startBlock({ ...ready, validUntil: today }, undefined, today)).toBeNull()
    expect(startBlock({ ...ready, validUntil: '2026-11-17' }, undefined, today)).toBe('expired')
  })

  it('before the start the game link only waits: no riddle, nothing to act on', async () => {
    const o = await newGame()
    const v = await getView(t.db, o.gameToken)
    if (typeof v === 'string') throw new Error(v)
    expect(v).toMatchObject({ status: 'ready', step: 'opening', current: null, completed: [] })
    const r = await act(t.db, o.gameToken, { type: 'answer', stopIndex: 0, answer: 'תקווה' })
    expect(r).toMatchObject({ ok: false, error: 'stale' })
  })

  it('starts from the manage link with the players present, then locks and shares', async () => {
    const o = await newGame(5)
    let m = await manage(o.manageToken)
    expect(m).toMatchObject({
      started: false,
      players: null,
      invite: null,
      editable: true,
      start: { can: true, reason: null, maxPlayers: 5 },
    })

    expect((await start(o.manageToken, 0)).statusCode).toBe(400)
    expect((await start(o.manageToken, 6)).json()).toEqual({ error: 'bad_players' })
    expect((await start(o.manageToken, 'x')).statusCode).toBe(400)
    const ok = await start(o.manageToken, 3)
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ ok: true, players: 3, gameLink: `http://localhost/g/${o.gameToken}` })
    const again = await start(o.manageToken, 3)
    expect(again.statusCode).toBe(409)
    expect(again.json().error).toBe('started')

    m = await manage(o.manageToken)
    expect(m).toMatchObject({ status: 'active', started: true, players: 3, editable: false })
    expect(m.start).toMatchObject({ can: false, reason: 'started' })
    expect(m.invite.text).toContain('המירוץ של מיכל')
    expect(m.invite.text).toContain(`http://localhost/g/${o.gameToken}`)

    const [st] = await t.db.select().from(gameStates).where(eq(gameStates.orderId, o.id))
    expect(st).toMatchObject({ players: 3, step: 'riddle' })
    const v = await getView(t.db, o.gameToken)
    if (typeof v === 'string') throw new Error(v)
    expect(v).toMatchObject({ status: 'active', step: 'riddle', people: 5, players: 3 })
  })

  it('the invite is the owner’s text from message_templates', async () => {
    await setSetting(t.db, 'message_templates', {
      ...SETTING_DEFAULTS.message_templates,
      players_invite: { subject: '', text: 'בואו ל{{honoree}}! {{gameLink}} ({{name}})' },
    })
    const o = await newGame()
    await start(o.manageToken, 2)
    expect((await manage(o.manageToken)).invite.text).toBe(
      `בואו למיכל! http://localhost/g/${o.gameToken} (נועה)`,
    )
    await setSetting(t.db, 'message_templates', SETTING_DEFAULTS.message_templates)
  })

  it('every stall serves the players present; settlement pays for them; the admin sees the unused', async () => {
    const o = await newGame(5)
    const s = await startGame(t.db, o.gameToken, { players: 3 })
    expect(s.ok).toBe(true)
    for (let i = 0; i < 5; i++) {
      await act(t.db, o.gameToken, { type: 'answer', stopIndex: i, answer: ANSWERS[i] })
      const r = await act(t.db, o.gameToken, { type: 'arrived', stopIndex: i })
      if (!r.ok) throw new Error(r.error)
      expect(r.view.current?.redeem?.portions).toBe(3)
      await act(t.db, o.gameToken, { type: 'redeemed', stopIndex: i })
    }
    const used = await t.db.select().from(redemptions).where(eq(redemptions.orderId, o.id))
    expect(used.map((u) => u.portions)).toEqual([3, 3, 3, 3, 3])

    const settle = (await t.app.inject({ url: '/admin/api/settlement', headers: { cookie } })).json()
    const ours = settle.stalls.flatMap((x: { rows: { orderNo: string; portions: number }[] }) =>
      x.rows.filter((row) => row.orderNo === o.orderNo),
    )
    expect(ours.map((row: { portions: number }) => row.portions)).toEqual([3, 3, 3, 3, 3])

    const d = (await t.app.inject({ url: `/admin/api/orders/${o.id}`, headers: { cookie } })).json()
    expect(d.usage).toEqual({ stops: 5, redeemedStops: 5, bought: 25, used: 15, players: 3, unused: 10 })
  })

  it('counts every portion of an expired game that did not reach its stops as unused', () => {
    const game = { people: 4, stops: [1, 2, 3, 4, 5] } as never
    expect(usage({ people: 4, game, status: 'active' }, { portions: 6, stops: 2 }, 3)).toMatchObject({
      unused: 2,
    })
    expect(usage({ people: 4, game, status: 'expired' }, { portions: 6, stops: 2 }, 3)).toMatchObject({
      unused: 14,
    })
  })

  it('refuses an expired game and one still in review', async () => {
    const o = await newGame()
    await t.db.update(orders).set({ validUntil: '2020-01-01' }).where(eq(orders.id, o.id))
    expect(await startGame(t.db, o.gameToken)).toEqual({ ok: false, error: 'expired' })
    expect((await manage(o.manageToken)).start).toMatchObject({ can: false, reason: 'expired' })

    const r = await newGame()
    await t.db.update(orders).set({ status: 'review' }).where(eq(orders.id, r.id))
    expect((await start(r.manageToken, 2)).json()).toEqual({ error: 'not_ready' })
    await t.db.update(orders).set({ validUntil: israelDate() }).where(eq(orders.id, o.id))
  })
})
