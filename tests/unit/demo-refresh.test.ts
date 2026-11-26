// The versioned demo refresh: a database seeded by an older version gets the current demo
// riddles, question sets, recipients and mini-game setting at boot, rows the admin edited since
// the last refresh stay, and games not started are rebuilt with mini-games on the same tokens.
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameStates, orders, questionSets, riddles, settings } from '../../src/server/db/schema.ts'
import {
  DEMO_SEED_VERSION,
  demoSeedingEnabled,
  refreshDemoContent,
} from '../../src/server/services/demo-refresh.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { startGame } from '../../src/server/services/play.ts'
import { DEMO_RIDDLES, seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

const RICH = {
  first_love: 'יואב מהשכבה',
  catchphrase: 'אני רק שואלת',
  favorite_food: 'שקשוקה',
  favorite_place: 'הכנרת',
  one_word: 'עקשנית',
  dream: 'לגור בפריז',
}
const OLD_TIKVA =
  'מאז {first_love}, {name} יודעת שאסור לוותר עליה. היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?'

describe('demo content refresh', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeEach(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterEach(() => t.close())

  const setting = async (key: string) =>
    (await t.db.select().from(settings).where(eq(settings.key, key)))[0]?.value
  const riddle = async (answer: string) =>
    (await t.db.select().from(riddles).where(eq(riddles.answer, answer)))[0]
  const set = async (name: string) =>
    (await t.db.select().from(questionSets).where(eq(questionSets.name, name)))[0]

  /** Turns the fresh seed into what an older version left behind. */
  async function makeOld() {
    await t.db.delete(settings).where(eq(settings.key, 'demo_seed_version'))
    await t.db.delete(settings).where(eq(settings.key, 'demo_seed_at'))
    await t.db.delete(settings).where(eq(settings.key, 'minigames'))
    const tikva = await riddle('תקווה')
    await t.db
      .update(riddles)
      .set({ templates: { she: OLD_TIKVA } })
      .where(eq(riddles.id, tikva.id))
    await t.db.delete(riddles).where(eq(riddles.answer, 'קפה'))
    const priv = await set('שאלות פרטיות')
    await t.db
      .update(questionSets)
      .set({ questions: priv.questions.filter((q) => q.slot !== 'photo_where') })
      .where(eq(questionSets.id, priv.id))
  }

  async function oldGame() {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 4,
      answers: RICH,
      notes: 'test game',
    })
    const built = await buildOrderGame(t.db, o.id)
    // As built before mini-games existed.
    const { minigames: _, ...game } = built.game!
    await t.db.update(orders).set({ game }).where(eq(orders.id, o.id))
    return built
  }

  it('runs only when asked, and never in production', () => {
    expect(demoSeedingEnabled({ SEED_DEMO: '1' }, 'staging')).toBe(true)
    expect(demoSeedingEnabled({ E2E_SEED: '1' }, 'test')).toBe(true)
    expect(demoSeedingEnabled({ SEED_DEMO: '1' }, 'production')).toBe(false)
    expect(demoSeedingEnabled({ E2E_SEED: '1' }, 'production')).toBe(false)
    expect(demoSeedingEnabled({}, 'staging')).toBe(false)
  })

  it('a fresh seed is already current: nothing to refresh', async () => {
    expect(await setting('demo_seed_version')).toBe(DEMO_SEED_VERSION)
    const r = await refreshDemoContent(t.db)
    expect(r.ran).toBe(false)
  })

  it('brings an older database up to date and rebuilds the games not started, on the same tokens', async () => {
    await makeOld()
    const waiting = await oldGame()
    const started = await oldGame()
    await startGame(t.db, started.gameToken)

    const r = await refreshDemoContent(t.db)
    expect(r.ran).toBe(true)
    expect(r.from).toBe(0)
    expect(await setting('demo_seed_version')).toBe(DEMO_SEED_VERSION)
    expect(typeof (await setting('demo_seed_at'))).toBe('string')

    expect((await riddle('תקווה')).templates).toEqual(DEMO_RIDDLES['תקווה'])
    expect((await riddle('קפה')).templates).toEqual(DEMO_RIDDLES['קפה']) // re-inserted
    expect(r.riddles).toMatchObject({ inserted: 1, kept: 0 })
    expect((await set('שאלות פרטיות')).questions.map((q) => q.slot)).toContain('photo_where')
    expect((await setting('minigames')) as { after: number[] }).toMatchObject({ after: [2, 4] })

    const [w] = await t.db.select().from(orders).where(eq(orders.id, waiting.id))
    expect(w.gameToken).toBe(waiting.gameToken)
    expect(w.manageToken).toBe(waiting.manageToken)
    expect(w.game!.minigames).toHaveLength(2)
    expect(w.game!.stops[0].riddle.parts.map((p) => p.v).join('')).toContain('עליה לא מוותרים')
    expect(r.rebuilt).toContain(waiting.orderNo)

    // The started game is frozen.
    const [s] = await t.db.select().from(orders).where(eq(orders.id, started.id))
    expect(s.game!.minigames).toBeUndefined()
    expect(r.rebuilt).not.toContain(started.orderNo)
    const [st] = await t.db.select().from(gameStates).where(eq(gameStates.orderId, started.id))
    expect(st.step).toBe('riddle')

    // Once current, the next boot does nothing.
    expect((await refreshDemoContent(t.db)).ran).toBe(false)
  })

  it('leaves rows the admin edited after the last refresh alone', async () => {
    await makeOld()
    await refreshDemoContent(t.db)
    // The owner edits one riddle, one question set and the mini-game setting in the admin.
    const cookie = await ownerCookie(t.app)
    const call = (method: 'PUT' | 'PATCH', url: string, payload: Record<string, unknown>) =>
      t.app.inject({ method, url: `/admin/api/catalog${url}`, headers: { cookie }, payload })
    await new Promise((r) => setTimeout(r, 5))
    const tikva = await riddle('תקווה')
    const own = { ...tikva.templates, she: 'החידה של הבעלים. מה היא?' }
    const res = await call('PATCH', `/riddles/${tikva.id}`, { templates: own })
    expect(res.statusCode).toBe(200)
    const mg = await call('PUT', '/settings/minigames', { value: { after: [3] } })
    expect(mg.statusCode).toBe(200)
    // Someone else's change to a demo row made outside the admin is overwritten only if older.
    const burik = await riddle('בוריק')
    await t.db
      .update(riddles)
      .set({ templates: { she: 'ישן' }, updatedAt: new Date(0) })
      .where(eq(riddles.id, burik.id))

    // A newer demo version comes along.
    await t.db.update(settings).set({ value: 0 }).where(eq(settings.key, 'demo_seed_version'))
    const r = await refreshDemoContent(t.db)
    expect(r.ran).toBe(true)
    expect((await riddle('תקווה')).templates.she).toBe('החידה של הבעלים. מה היא?')
    expect((await riddle('בוריק')).templates).toEqual(DEMO_RIDDLES['בוריק'])
    expect(r.riddles.kept).toBe(1)
    expect(r.minigames).toBe('kept')
    expect(await setting('minigames')).toEqual({ after: [3] })
  })
})
