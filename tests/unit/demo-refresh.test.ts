// The versioned demo refresh: a database seeded by an older version gets the current demo
// riddles, question sets, recipients and mini-game setting at boot, rows the admin edited since
// the last refresh stay, and games not started are rebuilt with mini-games on the same tokens.
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  gameStates,
  occasions,
  orders,
  paySessions,
  questionSets,
  riddles,
  settings,
  tastings,
} from '../../src/server/db/schema.ts'
import {
  DEMO_SEED_VERSION,
  demoSeedingEnabled,
  realPaidOrders,
  refreshDemoContent,
} from '../../src/server/services/demo-refresh.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { startGame } from '../../src/server/services/play.ts'
import {
  DEMO_DIET_ALTERNATIVES,
  DEMO_RIDDLES,
  KIDS_DRINK,
  RECIPIENT_SETS,
  seedDemo,
} from '../../src/server/services/seed-demo.ts'
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

  async function oldGame(notes = 'test game') {
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
      notes,
    })
    const built = await buildOrderGame(t.db, o.id)
    // As built before mini-games existed.
    const { minigames: _, ...game } = built.game!
    await t.db.update(orders).set({ game }).where(eq(orders.id, o.id))
    return built
  }

  /** A paid pay window for an order, through a provider. */
  async function paid(orderId: number, provider: 'mock' | 'pelecard' | 'tranzila') {
    await t.db.update(orders).set({ paidAt: new Date() }).where(eq(orders.id, orderId))
    await t.db.insert(paySessions).values({
      orderId,
      token: `tok-${orderId}-${provider}`,
      amountAgorot: 100,
      env: 'test',
      provider,
      status: 'paid',
      transactionId: `tx-${orderId}-${provider}`,
    })
  }

  it('rebuilds only demo games: test games and orders paid through the mock provider', async () => {
    await makeOld()
    const test = await oldGame()
    const mock = await oldGame('')
    await paid(mock.id, 'mock')
    const other = await oldGame('') // built, not paid, not a test game
    const r = await refreshDemoContent(t.db)
    expect(r.ran).toBe(true)
    expect(r.rebuilt.sort()).toEqual([test.orderNo, mock.orderNo].sort())
    expect(r.skippedNotDemo).toEqual([other.orderNo])
    const [o] = await t.db.select().from(orders).where(eq(orders.id, other.id))
    expect(o.game!.minigames).toBeUndefined()
  })

  it('gives demo tastings their library icon and the occasions theirs, keeping an icon the admin chose', async () => {
    await makeOld()
    const tasting = async (name: string) =>
      (await t.db.select().from(tastings).where(eq(tastings.name, name)))[0]
    // What earlier seeds wrote: the original map illustrations, or nothing.
    await t.db.update(tastings).set({ teaserIcon: 'fruit' }).where(eq(tastings.name, 'מיץ תפוזים טרי'))
    await t.db.update(tastings).set({ teaserIcon: null }).where(eq(tastings.name, 'בירה מהחבית'))
    await t.db.update(tastings).set({ teaserIcon: 'sweets/halva' }).where(eq(tastings.name, 'קפה הפוך'))
    await t.db.update(occasions).set({ icons: [] }).where(eq(occasions.key, 'birthday_friend'))
    const r = await refreshDemoContent(t.db)
    expect(r.tastingIcons).toBe(2)
    expect((await tasting('מיץ תפוזים טרי')).teaserIcon).toBe('drinks/orange-juice')
    expect((await tasting('בירה מהחבית')).teaserIcon).toBe('drinks/beer')
    expect((await tasting('קפה הפוך')).teaserIcon).toBe('sweets/halva')
    const [bday] = await t.db.select().from(occasions).where(eq(occasions.key, 'birthday_friend'))
    expect(bday.icons).toContain('game/balloon')
  })

  it('refuses the whole refresh when an order was paid through a real provider', async () => {
    await makeOld()
    const game = await oldGame()
    const real = await oldGame('')
    await paid(real.id, 'pelecard')
    const r = await refreshDemoContent(t.db)
    expect(r.ran).toBe(false)
    expect(r.refused).toContain(real.orderNo)
    // Nothing changed: the old riddle, no setting, no rebuild, the version still old.
    expect((await riddle('תקווה')).templates).toEqual({ she: OLD_TIKVA })
    expect(await setting('minigames')).toBeUndefined()
    expect(await setting('demo_seed_version')).toBeUndefined()
    const [g] = await t.db.select().from(orders).where(eq(orders.id, game.id))
    expect(g.game!.minigames).toBeUndefined()
  })

  it('counts a paid order with no mock payment as real (unknown is not demo)', async () => {
    await makeOld()
    const o = await oldGame('')
    await t.db.update(orders).set({ paidAt: new Date() }).where(eq(orders.id, o.id))
    expect(await realPaidOrders(t.db)).toEqual([o.orderNo])
    expect((await refreshDemoContent(t.db)).refused).toContain(o.orderNo)
    // A paid test game, or one paid through the mock, is demo.
    await t.db.update(orders).set({ notes: 'test game' }).where(eq(orders.id, o.id))
    expect(await realPaidOrders(t.db)).toEqual([])
    expect((await refreshDemoContent(t.db)).ran).toBe(true)
  })

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

  it("version 3: kids get juice at the beer stall (adults-only flags, the kid's birthday for kids)", async () => {
    await t.db.update(occasions).set({ forKids: false, updatedAt: new Date(0) })
    await t.db.update(tastings).set({ adultsOnly: false })
    await t.db.delete(tastings).where(eq(tastings.name, KIDS_DRINK.name))
    await t.db.update(settings).set({ value: 3 }).where(eq(settings.key, 'demo_seed_version'))
    const r = await refreshDemoContent(t.db)
    expect(r.ran).toBe(true)
    const [kid] = await t.db.select().from(occasions).where(eq(occasions.key, 'birthday_kid'))
    expect(kid.forKids).toBe(true)
    const all = await t.db.select().from(tastings)
    expect(all.filter((x) => x.adultsOnly).map((x) => x.name)).toEqual(['בירה מהחבית', 'סיידר תפוחים'])
    expect(all.filter((x) => x.name === KIDS_DRINK.name)).toHaveLength(1)
    expect(r.kids.some((l) => l.includes(`added "${KIDS_DRINK.name}"`))).toBe(true)
  })

  it('version 6: the demo stalls get alternatives for part of the group (a vegan, a milk allergy)', async () => {
    const names = DEMO_DIET_ALTERNATIVES.map((a) => a.name)
    const count = async () =>
      (await t.db.select().from(tastings)).filter((x) => names.includes(x.name)).length
    expect(await count()).toBe(names.length)
    for (const n of names) await t.db.delete(tastings).where(eq(tastings.name, n))
    await t.db.update(settings).set({ value: 5 }).where(eq(settings.key, 'demo_seed_version'))
    const r = await refreshDemoContent(t.db)
    expect(r.alternatives).toHaveLength(names.length)
    expect(await count()).toBe(names.length)
    // Once there, never added twice.
    await t.db.update(settings).set({ value: 5 }).where(eq(settings.key, 'demo_seed_version'))
    expect((await refreshDemoContent(t.db)).alternatives).toEqual([])
    expect(await count()).toBe(names.length)
  })

  it('renames, adds and retires demo occasions, leaving one the admin edited alone', async () => {
    // What version 2 left: the old names, no kid's birthday or anniversary, a parent's birthday
    // still offered, the friends' set under its old name, and no prices for the new occasions.
    const old = new Date(0)
    const occ = async (key: string) => (await t.db.select().from(occasions).where(eq(occasions.key, key)))[0]
    await t.db
      .update(occasions)
      .set({ label: 'אהבה וזוגיות', updatedAt: old })
      .where(eq(occasions.key, 'couple'))
    await t.db.update(occasions).set({ label: 'משפחתי', updatedAt: old }).where(eq(occasions.key, 'family'))
    await t.db
      .update(occasions)
      .set({ active: true, updatedAt: old })
      .where(eq(occasions.key, 'birthday_parent'))
    await t.db.delete(occasions).where(eq(occasions.key, 'birthday_kid'))
    await t.db.delete(occasions).where(eq(occasions.key, 'anniversary'))
    await t.db
      .update(questionSets)
      .set({ name: "שאלות לחבר'ה וליחידות", updatedAt: old })
      .where(eq(questionSets.name, "שאלות לחבר'ה"))
    const prices = (await setting('prices')) as Record<string, unknown>
    const { birthday_kid: _k, anniversary: _a, ...oldPrices } = prices
    await t.db.update(settings).set({ value: oldPrices }).where(eq(settings.key, 'prices'))
    await t.db.update(settings).set({ value: 2 }).where(eq(settings.key, 'demo_seed_version'))
    // The owner renamed the family occasion in the admin after the last refresh.
    await new Promise((r) => setTimeout(r, 5))
    await t.db
      .update(occasions)
      .set({ label: 'המשפחה שלי', updatedAt: new Date() })
      .where(eq(occasions.key, 'family'))

    const r = await refreshDemoContent(t.db)
    expect(r.ran).toBe(true)
    expect(r.occasions.inserted).toBe(2)
    expect(r.occasions.kept).toBe(1)
    expect(r.prices.sort()).toEqual(['anniversary', 'birthday_kid'])
    expect((await occ('couple')).label).toBe('דייט רומנטי')
    expect((await occ('family')).label).toBe('המשפחה שלי')
    expect((await occ('birthday_friend')).label).toBe('יום הולדת')
    expect((await occ('birthday_parent')).active).toBe(false)
    const kid = await occ('birthday_kid')
    expect(kid).toMatchObject({
      label: 'יום הולדת לילד',
      active: true,
      decor: 'kids',
      recipientLabels: { she: 'לילדה', he: 'לילד' },
    })
    expect(Object.keys(kid.recipients).sort()).toEqual(['he', 'she'])
    expect(kid.recipients.she).toBe((await set(RECIPIENT_SETS.kidShe.name)).id)
    const anniversary = await occ('anniversary')
    expect(anniversary).toMatchObject({
      label: 'יום נישואים',
      decor: 'anniversary',
      forms: ['she', 'he', 'couple'],
    })
    expect(anniversary.recipients.couple).toBe((await set(RECIPIENT_SETS.anniversaryCouple.name)).id)
    // The friends' set is renamed in place, not duplicated.
    expect(await set("שאלות לחבר'ה וליחידות")).toBeUndefined()
    expect((await occ('friends')).recipients.group).toBe((await set("שאלות לחבר'ה")).id)
    expect(Object.keys((await setting('prices')) as object)).toEqual(
      expect.arrayContaining(['birthday_kid', 'anniversary', 'couple']),
    )
    // The site lists them in the new order, without the retired one.
    const shop = (await t.app.inject({ url: '/api/shop' })).json()
    expect(shop.occasions.map((o: { label: string }) => o.label)).toEqual([
      'רווקות',
      'דייט רומנטי',
      'יום נישואים',
      'יום הולדת',
      'יום הולדת לילד',
      'המשפחה שלי',
      "חבר'ה",
      'כללי',
      'יום צוות',
      'פרישה',
      'עובד/ת חדש/ה',
    ])
  })
})
