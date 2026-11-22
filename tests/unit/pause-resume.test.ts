// The captain pauses the game ("עוצרים להיום") from their own phone and resumes it from the manage
// link, any day it is valid, any number of times, at the same stop. Only the manage link (or the
// captain token derived from it) can start, pause or resume. Plus the start email and the lost link.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameStates, messages, orders, stalls } from '../../src/server/db/schema.ts'
import { israelDate } from '../../src/server/domain/dates.ts'
import { captainToken, isCaptainToken } from '../../src/server/lib/tokens.ts'
import { sendManageLinks } from '../../src/server/services/delivery.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import {
  act,
  getView,
  type PlayAction,
  pauseBlock,
  pauseGame,
  resumeBlock,
  resumeGame,
} from '../../src/server/services/play.ts'
import { seedDemo } from '../../src/server/services/seed-demo.ts'
import { captainFromHash, captainTokenFor } from '../../src/web/player/captain.ts'
import { makeTestApp } from '../helpers/app.ts'

const ANSWERS = ['תקווה', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים']

describe('pause and resume', () => {
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

  async function newGame(opts: { email?: string; people?: number; paid?: boolean } = {}) {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: opts.people ?? 5,
      answers: { first_love: 'יואב מהשכבה' },
      buyerName: 'נועה',
      buyerEmail: opts.email ?? 'noa@example.com',
    })
    if (opts.paid !== false) await t.db.update(orders).set({ paidAt: new Date() }).where(eq(orders.id, o.id))
    const built = await buildOrderGame(t.db, o.id)
    expect(built.status).toBe('ready')
    return built
  }
  const manage = async (token: string) => (await t.app.inject({ url: `/api/manage/${token}` })).json()
  const start = (token: string, players: number) =>
    t.app.inject({ method: 'POST', url: `/api/manage/${token}/start`, payload: { players } })
  const resume = (token: string) => t.app.inject({ method: 'POST', url: `/api/manage/${token}/resume` })
  const pause = (gameToken: string, captain?: string) =>
    t.app.inject({
      method: 'POST',
      url: `/api/game/${gameToken}/pause`,
      headers: captain ? { 'x-captain': captain } : {},
      payload: {},
    })
  const state = async (orderId: number) =>
    (await t.db.select().from(gameStates).where(eq(gameStates.orderId, orderId)))[0]
  /** Plays stop i through to the next riddle. */
  async function playStop(gameToken: string, i: number) {
    await act(t.db, gameToken, { type: 'answer', stopIndex: i, answer: ANSWERS[i] })
    await act(t.db, gameToken, { type: 'arrived', stopIndex: i })
    await act(t.db, gameToken, { type: 'redeemed', stopIndex: i })
  }

  it('knows when a game can be paused and resumed', () => {
    const today = '2026-11-22'
    const active = { status: 'active', validUntil: '2027-11-22' }
    expect(pauseBlock(active, { step: 'riddle' }, today)).toBeNull()
    expect(pauseBlock(active, { step: 'revealed' }, today)).toBeNull()
    expect(pauseBlock(active, { step: 'redeem' }, today)).toBeNull()
    expect(pauseBlock(active, { step: 'opening' }, today)).toBe('not_playing')
    expect(pauseBlock(active, undefined, today)).toBe('not_playing')
    expect(pauseBlock({ ...active, status: 'done' }, { step: 'done' }, today)).toBe('not_playing')
    expect(pauseBlock({ ...active, status: 'ready' }, { step: 'opening' }, today)).toBe('not_playing')
    expect(pauseBlock({ ...active, validUntil: '2026-11-21' }, { step: 'riddle' }, today)).toBe('expired')

    const paused = { step: 'riddle', pausedAt: new Date() }
    expect(resumeBlock(active, paused, today)).toBeNull()
    // Any day while it is valid, through its last day (Israel time).
    expect(resumeBlock({ ...active, validUntil: today }, paused, today)).toBeNull()
    expect(resumeBlock({ ...active, validUntil: '2026-11-21' }, paused, today)).toBe('expired')
    expect(resumeBlock(active, { step: 'riddle', pausedAt: null }, today)).toBe('not_paused')
    expect(resumeBlock(active, undefined, today)).toBe('not_paused')
  })

  it('the captain token comes from the manage token only, and is checked in constant time', () => {
    const tok = captainToken('manage-token-abcdef')
    expect(tok).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(tok).not.toContain('manage-token')
    expect(captainToken('manage-token-abcdef')).toBe(tok)
    expect(captainToken('manage-token-abcdeg')).not.toBe(tok)
    expect(isCaptainToken('manage-token-abcdef', tok)).toBe(true)
    expect(isCaptainToken('manage-token-abcdef', `${tok}x`)).toBe(false)
    expect(isCaptainToken('manage-token-abcdef', 'manage-token-abcdef')).toBe(false)
    expect(isCaptainToken('manage-token-abcdef', '')).toBe(false)
    expect(isCaptainToken('manage-token-abcdef', null)).toBe(false)
  })

  it('the player keeps the captain token from the hash and drops it from the address', () => {
    const store = new Map<string, string>()
    const s = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    }
    const tok = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
    expect(captainFromHash(`#c=${tok}`)).toBe(tok)
    expect(captainFromHash('#c=short')).toBeNull()
    expect(captainFromHash('')).toBeNull()
    const clear = vi.fn()
    expect(captainTokenFor('game1', { hash: `#c=${tok}` }, s, clear)).toBe(tok)
    expect(clear).toHaveBeenCalledOnce()
    // Back later on the bare link, on the same phone: still the captain.
    expect(captainTokenFor('game1', { hash: '' }, s, clear)).toBe(tok)
    // Another phone (or another game) on the bare link: not the captain.
    expect(captainTokenFor('game2', { hash: '' }, s, clear)).toBeNull()
    expect(captainTokenFor('game1', { hash: '' }, null, clear)).toBeNull()
  })

  it('emails the game link at the start, once', async () => {
    const o = await newGame()
    expect((await start(o.manageToken, 3)).statusCode).toBe(200)
    const sent = t.services.emails.filter((e) => e.to === 'noa@example.com')
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe('המשחק של מיכל התחיל!')
    expect(sent[0].text).toContain('המשחק התחיל!')
    expect(sent[0].text).toContain(`http://localhost/g/${o.gameToken}`)
    expect(sent[0].text).toContain(`http://localhost/m/${o.manageToken}`)
    const logged = await t.db.select().from(messages).where(eq(messages.orderId, o.id))
    expect(logged.filter((m) => m.template === 'game_started' && m.channel === 'email')).toHaveLength(1)

    // A second start is refused and sends nothing; a pause and a resume send no start email.
    expect((await start(o.manageToken, 3)).statusCode).toBe(409)
    expect((await pause(o.gameToken, captainToken(o.manageToken))).statusCode).toBe(200)
    expect((await resume(o.manageToken)).statusCode).toBe(200)
    expect(t.services.emails.filter((e) => e.subject === 'המשחק של מיכל התחיל!')).toHaveLength(1)
  })

  it('only the captain token pauses: never the bare game link, the game token or the manage token', async () => {
    const o = await newGame()
    await start(o.manageToken, 2)
    expect((await pause(o.gameToken)).statusCode).toBe(403)
    expect((await pause(o.gameToken, o.gameToken)).statusCode).toBe(403)
    expect((await pause(o.gameToken, o.manageToken)).statusCode).toBe(403)
    const other = await newGame()
    expect((await pause(o.gameToken, captainToken(other.manageToken))).statusCode).toBe(403)
    expect((await state(o.id)).pausedAt).toBeNull()

    // The view tells only the captain's phone that it is the captain.
    const plain = (await t.app.inject({ url: `/api/game/${o.gameToken}` })).json()
    expect(plain.captain).toBe(false)
    const cap = (
      await t.app.inject({
        url: `/api/game/${o.gameToken}`,
        headers: { 'x-captain': captainToken(o.manageToken) },
      })
    ).json()
    expect(cap.captain).toBe(true)
    // The manage link hands the captain its way in; the game link itself never carries it.
    const m = await manage(o.manageToken)
    expect(m.captainLink).toBe(`http://localhost/g/${o.gameToken}#c=${captainToken(o.manageToken)}`)
    expect(m.gameLink).toBe(`http://localhost/g/${o.gameToken}`)
    // Players cannot resume: there is no resume on the game link.
    const r = await t.app.inject({ method: 'POST', url: `/api/game/${o.gameToken}/resume` })
    expect(r.statusCode).toBe(404)
  })

  it('cannot pause before the start', async () => {
    const o = await newGame()
    expect((await manage(o.manageToken)).captainLink).toBeNull()
    const r = await pause(o.gameToken, captainToken(o.manageToken))
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toBe('not_playing')
  })

  it('pauses for everyone: no riddle sent, every action refused, the buyer emailed where they stopped', async () => {
    const o = await newGame()
    await start(o.manageToken, 3)
    await playStop(o.gameToken, 0)
    await act(t.db, o.gameToken, { type: 'answer', stopIndex: 1, answer: ANSWERS[1] })
    const before = await state(o.id)
    expect(before).toMatchObject({ stopIndex: 1, step: 'revealed' })

    const r = await pause(o.gameToken, captainToken(o.manageToken))
    expect(r.statusCode).toBe(200)
    expect(r.json().view).toMatchObject({ status: 'paused', stopIndex: 1, totalStops: 5, current: null })
    const mail = t.services.emails.filter((e) => e.subject === 'המשחק של מיכל בהפסקה')
    expect(mail).toHaveLength(1)
    expect(mail[0].text).toContain('עצרתם בתחנה 2 מתוך 5')
    expect(mail[0].text).toContain(`http://localhost/m/${o.manageToken}`)

    // A second tap changes nothing and sends nothing.
    expect((await pause(o.gameToken, captainToken(o.manageToken))).statusCode).toBe(200)
    expect(t.services.emails.filter((e) => e.subject === 'המשחק של מיכל בהפסקה')).toHaveLength(1)

    // Every phone sees the paused screen, without the stop's riddle, stall or tasting.
    const raw = (await t.app.inject({ url: `/api/game/${o.gameToken}` })).body
    const v = JSON.parse(raw)
    expect(v).toMatchObject({ status: 'paused', step: 'revealed', stopIndex: 1, current: null })
    expect(raw).not.toContain('בוריק')

    // Every play action is refused on the server and the state does not move.
    const paused = await state(o.id)
    const actions: PlayAction[] = [
      { type: 'answer', stopIndex: 1, answer: ANSWERS[1] },
      { type: 'hint', stopIndex: 1 },
      { type: 'arrived', stopIndex: 1 },
      { type: 'redeemed', stopIndex: 1 },
      { type: 'stall_closed', stopIndex: 1 },
    ]
    for (const a of actions) {
      expect(await act(t.db, o.gameToken, a)).toMatchObject({ ok: false, error: 'paused' })
      const res = await t.app.inject({ method: 'POST', url: `/api/game/${o.gameToken}/action`, payload: a })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toMatchObject({ error: 'paused', view: { status: 'paused', current: null } })
    }
    expect(await state(o.id)).toMatchObject({
      step: paused.step,
      stopIndex: paused.stopIndex,
      version: paused.version,
      wrongAnswers: paused.wrongAnswers,
    })

    // The manage page shows where they stopped and offers to resume.
    const m = await manage(o.manageToken)
    expect(m).toMatchObject({ paused: { stop: 2, total: 5 }, resume: { can: true, reason: null } })
  })

  it('resumes from the manage link at exactly the same point, any number of times', async () => {
    const o = await newGame({ people: 5 })
    await start(o.manageToken, 4)
    await playStop(o.gameToken, 0)
    await act(t.db, o.gameToken, { type: 'answer', stopIndex: 1, answer: ANSWERS[1] })
    const before = await state(o.id)

    for (let round = 0; round < 3; round++) {
      expect((await pause(o.gameToken, captainToken(o.manageToken))).statusCode).toBe(200)
      const r = await resume(o.manageToken)
      expect(r.statusCode).toBe(200)
      expect(r.json()).toMatchObject({ ok: true, stop: 2 })
    }
    const after = await state(o.id)
    expect(after).toMatchObject({
      pausedAt: null,
      step: before.step,
      stopIndex: before.stopIndex,
      players: 4,
      hintsShown: before.hintsShown,
      backupStops: before.backupStops,
    })
    const v = await getView(t.db, o.gameToken)
    if (typeof v === 'string') throw new Error(v)
    expect(v).toMatchObject({ status: 'active', step: 'revealed', stopIndex: 1, players: 4 })
    expect(v.current?.reveal?.stall.name).toBeTruthy()
    // Not paused: nothing to resume.
    expect((await resume(o.manageToken)).json()).toEqual({ error: 'not_paused' })
    expect((await manage(o.manageToken)).paused).toBeNull()
    // The players count is fixed: resuming takes no count, and a new start is refused.
    expect((await start(o.manageToken, 2)).json()).toEqual({ error: 'started' })
    expect((await state(o.id)).players).toBe(4)
  })

  it('resumes on a later day, and the closed-stall backup still works', async () => {
    const o = await newGame()
    const day1 = new Date('2026-11-20T09:00:00Z')
    await start(o.manageToken, 3)
    await playStop(o.gameToken, 0)
    expect((await pauseGame(t.db, o.gameToken, { now: day1 })).ok).toBe(true)

    // Weeks later, the next stop's stall is closed that day.
    const later = new Date('2026-12-15T09:00:00Z')
    const game = (await t.db.select().from(orders).where(eq(orders.id, o.id)))[0].game!
    const stop = game.stops[1]
    expect(stop.backup).toBeTruthy()
    await t.db
      .update(stalls)
      .set({ closedOn: israelDate(later) })
      .where(eq(stalls.id, stop.stall.id))
    try {
      expect((await resumeGame(t.db, o.gameToken, { now: later })).ok).toBe(true)
      const r = await act(t.db, o.gameToken, { type: 'answer', stopIndex: 1, answer: ANSWERS[1] }, 4, later)
      if (!r.ok) throw new Error(r.error)
      expect(r.view.current?.reveal).toMatchObject({
        usingBackup: true,
        stall: { id: stop.backup!.stall.id },
      })
    } finally {
      await t.db.update(stalls).set({ closedOn: null }).where(eq(stalls.id, stop.stall.id))
    }
  })

  it('cannot resume once the game expired', async () => {
    const o = await newGame()
    await start(o.manageToken, 2)
    await pause(o.gameToken, captainToken(o.manageToken))
    await t.db.update(orders).set({ validUntil: '2020-01-01' }).where(eq(orders.id, o.id))
    const r = await resume(o.manageToken)
    expect(r.statusCode).toBe(409)
    expect(r.json()).toEqual({ error: 'expired' })
    expect((await manage(o.manageToken)).resume).toMatchObject({ can: false, reason: 'expired' })
  })
})

describe('lost link', () => {
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

  async function order(email: string, opts: { paid?: boolean; validUntil?: string; honoree?: string } = {}) {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: opts.honoree ?? 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 4,
      answers: { first_love: 'יואב' },
      buyerName: 'נועה',
      buyerEmail: email,
    })
    await t.db
      .update(orders)
      .set({
        paidAt: opts.paid === false ? null : new Date(),
        status: opts.paid === false ? 'pending_payment' : 'awaiting_answers',
        validUntil: opts.validUntil ?? '2099-01-01',
      })
      .where(eq(orders.id, o.id))
    return o
  }
  const ask = (email: string) => t.app.inject({ method: 'POST', url: '/api/lost-link', payload: { email } })

  it('answers the same whether or not the address has orders', async () => {
    await order('has@example.com')
    const yes = await ask('has@example.com')
    const no = await ask('nobody@example.com')
    expect(yes.statusCode).toBe(200)
    expect(no.statusCode).toBe(200)
    expect(yes.body).toBe(no.body)
    expect(yes.json()).toEqual({ ok: true })
    await vi.waitFor(() => expect(t.services.emails.map((e) => e.to)).toEqual(['has@example.com']))
    // A bad address is a form error, never a hint about orders.
    expect((await ask('not-an-email')).statusCode).toBe(400)
  })

  it('emails the address the manage links of its paid, valid orders only', async () => {
    const a = await order('Dana@Example.com', { honoree: 'רוני' })
    const b = await order('dana@example.com', { honoree: 'שירה' })
    const unpaid = await order('dana@example.com', { paid: false, honoree: 'לא שולם' })
    const old = await order('dana@example.com', { validUntil: '2020-01-01', honoree: 'פג תוקף' })
    expect(await sendManageLinks(t.db, t.services, 'http://localhost', ' DANA@example.com ')).toBe(2)
    expect(t.services.emails).toHaveLength(1)
    const [mail] = t.services.emails
    expect(mail.subject).toBe('הקישורים להזמנות שלך')
    expect(mail.text).toContain(`http://localhost/m/${a.manageToken}`)
    expect(mail.text).toContain(`http://localhost/m/${b.manageToken}`)
    expect(mail.text).toContain('המירוץ של רוני')
    expect(mail.text).not.toContain(unpaid.manageToken)
    expect(mail.text).not.toContain(old.manageToken)
    expect(mail.text).not.toContain('/g/')
    expect(await sendManageLinks(t.db, t.services, 'http://localhost', 'none@example.com')).toBe(0)
  })

  it('sends one email per address per interval (outside the test env)', async () => {
    await order('flood@example.com')
    const opts = { minIntervalMs: 10 * 60 * 1000 }
    expect(await sendManageLinks(t.db, t.services, 'http://localhost', 'flood@example.com', opts)).toBe(1)
    expect(await sendManageLinks(t.db, t.services, 'http://localhost', 'flood@example.com', opts)).toBe(0)
    const later = new Date(Date.now() + 11 * 60 * 1000)
    expect(
      await sendManageLinks(t.db, t.services, 'http://localhost', 'flood@example.com', {
        ...opts,
        now: later,
      }),
    ).toBe(1)
    expect(t.services.emails).toHaveLength(2)
  })

  it('is rate limited per client outside the test env', async () => {
    const prod = await makeTestApp({ env: 'production' })
    try {
      const codes: number[] = []
      for (let i = 0; i < 7; i++)
        codes.push(
          (
            await prod.app.inject({
              method: 'POST',
              url: '/api/lost-link',
              payload: { email: 'x@example.com' },
            })
          ).statusCode,
        )
      expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
      expect(codes.slice(5)).toEqual([429, 429])
    } finally {
      await prod.close()
    }
  })
})
