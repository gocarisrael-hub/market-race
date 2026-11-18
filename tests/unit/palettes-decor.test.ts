// Palettes (separate from the map) and occasion doodles: readable colors, the order carries the
// buyer's palette into the frozen game, the player view carries the occasion's doodle set.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { occasions, orders, palettes } from '../../src/server/db/schema.ts'
import { buildGame } from '../../src/server/domain/builder.ts'
import { contrast, paletteIssues, themeVars } from '../../src/server/domain/look.ts'
import { DECORS } from '../../src/server/domain/types.ts'
import { buildOrderGame, createOrder } from '../../src/server/services/orders.ts'
import { getView } from '../../src/server/services/play.ts'
import {
  DEMO_DECOR,
  DEMO_PALETTES,
  ensureDemoPalettes,
  ensureOccasionDecor,
  seedDemo,
} from '../../src/server/services/seed-demo.ts'
import { DECOR_SETS, DOODLES } from '../../src/web/shared/decor.tsx'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'
import { catalog, order } from '../helpers/fixtures.ts'

describe('palette contrast', () => {
  for (const p of DEMO_PALETTES) {
    it(`seeded palette "${p.name}" reads well everywhere`, () => {
      expect(paletteIssues(p.palette)).toEqual([])
      const v = themeVars(p.palette)
      expect(contrast(v['--on-bg'], p.palette.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(v['--on-accent'], p.palette.accent)).toBeGreaterThanOrEqual(3)
      expect(contrast(p.palette.ink, p.palette.paper)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('flags a palette whose buttons and text would not read', () => {
    const issues = paletteIssues({
      background: '#EEEEEE',
      accent: '#F5F5F5',
      ink: '#DDDDDD',
      paper: '#FFFFFF',
    })
    expect(issues.map((i) => i.check)).toEqual(
      expect.arrayContaining(['riddle text on paper', 'button text']),
    )
  })
})

describe('decor sets', () => {
  it('has a few doodles for every set', () => {
    for (const d of DECORS) expect(DECOR_SETS[d].length).toBeGreaterThanOrEqual(3)
    expect(DECOR_SETS.birthday).toEqual(expect.arrayContaining(['balloons', 'cake', 'partyHat', 'confetti']))
    expect(DECOR_SETS.love).toEqual(expect.arrayContaining(['heart', 'ring', 'lips', 'flower']))
  })

  it('gives every occasion a rich set of distinct, drawn doodles', () => {
    for (const d of ['birthday', 'love', 'family', 'friends', 'generic'] as const) {
      expect(DECOR_SETS[d].length).toBeGreaterThanOrEqual(10)
      expect(new Set(DECOR_SETS[d]).size).toBe(DECOR_SETS[d].length)
    }
    for (const d of DECORS) for (const name of DECOR_SETS[d]) expect(DOODLES).toContain(name)
  })
})

describe('builder snapshot palette', () => {
  const sea = {
    background: '#DCE6EA',
    accent: '#1F5E8C',
    ink: '#14262F',
    paper: '#FAFCFC',
    mapTint: '#2F6E9E',
  }

  it('plays the chosen palette and keeps the decor', () => {
    const { game } = buildGame({
      ...catalog(),
      palette: { id: 7, palette: sea },
      decor: 'love',
      order: order(),
    })
    expect(game.theme.palette).toEqual(sea)
    expect(game.theme.paletteId).toBe(7)
    expect(game.decor).toBe('love')
  })

  it("falls back to the theme's palette, and a company palette wins", () => {
    const c = catalog()
    expect(buildGame({ ...c, order: order() }).game.theme.palette).toEqual(c.theme.palette)
    const company = { ...sea, accent: '#123456' }
    const { game } = buildGame({
      ...c,
      palette: { id: 7, palette: sea },
      order: order({ company: { name: 'אקמה', logo: null, palette: company } }),
    })
    expect(game.theme.palette).toEqual(company)
    expect(game.theme.paletteId).toBeNull()
    expect(game.decor).toBe('generic')
  })
})

describe('palettes in the shop, the order and the game', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  let cookie: string
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
    cookie = await ownerCookie(t.app)
  })
  afterAll(() => t.close())

  const shop = async () => (await t.app.inject({ url: '/api/shop' })).json()
  const draft = (over: Record<string, unknown> = {}) => ({
    occasionKey: 'birthday_friend',
    form: 'she',
    honoreeName: 'שירה',
    themeId: ids.carmelThemeId,
    people: 4,
    answers: { first_love: 'יואב' },
    ...over,
  })

  it('lists each map with its palettes and each occasion with its doodle set', async () => {
    const s = await shop()
    const theme = s.themes.find((x: { id: number }) => x.id === ids.carmelThemeId)
    expect(theme.palettes.map((p: { name: string }) => p.name)).toEqual([
      'אדום קלאסי',
      'כחול ים',
      'ירוק זית',
      'כתום שקיעה',
      'ורוד פטל',
    ])
    const occ = (k: string) => s.occasions.find((o: { key: string }) => o.key === k)
    expect(occ('birthday_friend').decor).toBe('birthday')
    expect(occ('couple').decor).toBe('love')
    expect(occ('team_day').decor).toBe('company')
  })

  it('refuses a palette that is not offered on the chosen map', async () => {
    const [night] = await t.db.select().from(palettes).where(eq(palettes.name, 'לילה'))
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: draft({ paletteId: night.id }),
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('bad_palette')
  })

  it('carries the chosen palette into the frozen game and the doodle set into the view', async () => {
    const [sea] = await t.db.select().from(palettes).where(eq(palettes.name, 'כחול ים'))
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: draft({ paletteId: sea.id }),
    })
    expect(res.statusCode).toBe(200)
    const [row] = await t.db.select().from(orders).where(eq(orders.manageToken, res.json().manageToken))
    expect(row.paletteId).toBe(sea.id)
    const built = await buildOrderGame(t.db, row.id)
    expect(built.game?.theme.palette).toEqual(sea.palette)
    expect(built.game?.decor).toBe('birthday')
    const view = await getView(t.db, built.gameToken)
    if (typeof view === 'string') throw new Error(view)
    expect(view.decor).toBe('birthday')
    expect(view.theme?.palette.mapTint).toBe('#2F6E9E')

    // Catalog edits never change a built game.
    await t.db
      .update(palettes)
      .set({ palette: { ...sea.palette, accent: '#000000' } })
      .where(eq(palettes.id, sea.id))
    await t.db.update(occasions).set({ decor: 'friends' }).where(eq(occasions.key, 'birthday_friend'))
    const again = await getView(t.db, built.gameToken)
    if (typeof again === 'string') throw new Error(again)
    expect(again.theme?.palette.accent).toBe('#1F5E8C')
    expect(again.decor).toBe('birthday')
    await t.db.update(occasions).set({ decor: 'birthday' }).where(eq(occasions.key, 'birthday_friend'))
  })

  it("uses the occasion's doodle set for games built before decor existed", async () => {
    const o = await createOrder(t.db, {
      kind: 'private',
      status: 'awaiting_answers',
      occasionKey: 'couple',
      form: 'couple',
      honoreeName: 'מיכל ודני',
      themeId: ids.carmelThemeId,
      routeId: ids.carmelRouteId,
      people: 2,
    })
    const built = await buildOrderGame(t.db, o.id)
    const { decor: _drop, ...old } = built.game!
    await t.db.update(orders).set({ game: old }).where(eq(orders.id, o.id))
    const view = await getView(t.db, built.gameToken)
    if (typeof view === 'string') throw new Error(view)
    expect(view.decor).toBe('love')
  })

  it('lets the owner add a readable palette and refuses an unreadable one', async () => {
    const bad = await t.app.inject({
      method: 'POST',
      url: '/admin/api/catalog/palettes',
      headers: { cookie },
      payload: {
        name: 'אפור',
        palette: { background: '#EEEEEE', accent: '#F5F5F5', ink: '#DDDDDD', paper: '#FFFFFF' },
        themeIds: [ids.carmelThemeId],
      },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().issues[0].path).toBe('palette')

    const good = await t.app.inject({
      method: 'POST',
      url: '/admin/api/catalog/palettes',
      headers: { cookie },
      payload: {
        name: 'סגול',
        palette: {
          background: '#E6DDEB',
          accent: '#5B2A86',
          ink: '#22172B',
          paper: '#FCFAFD',
          mapTint: '#6A3A99',
        },
        themeIds: [ids.carmelThemeId],
        sort: 9,
      },
    })
    expect(good.statusCode).toBe(201)
    const missingTheme = await t.app.inject({
      method: 'PATCH',
      url: `/admin/api/catalog/palettes/${good.json().id}`,
      headers: { cookie },
      payload: { themeIds: [9999] },
    })
    expect(missingTheme.statusCode).toBe(400)
    const s = await shop()
    const theme = s.themes.find((x: { id: number }) => x.id === ids.carmelThemeId)
    expect(theme.palettes.at(-1).name).toBe('סגול')
  })

  it('lets the owner pick an occasion doodle set, only from the known ones', async () => {
    const [occ] = await t.db.select().from(occasions).where(eq(occasions.key, 'retirement'))
    const ok = await t.app.inject({
      method: 'PATCH',
      url: `/admin/api/catalog/occasions/${occ.id}`,
      headers: { cookie },
      payload: { decor: 'friends' },
    })
    expect(ok.json().decor).toBe('friends')
    const bad = await t.app.inject({
      method: 'PATCH',
      url: `/admin/api/catalog/occasions/${occ.id}`,
      headers: { cookie },
      payload: { decor: 'disco' },
    })
    expect(bad.statusCode).toBe(400)
  })

  it('tops up a database seeded before palettes, without duplicates', async () => {
    expect(await ensureDemoPalettes(t.db)).toBe(0)
    await t.db.delete(palettes).where(eq(palettes.name, 'ורוד פטל'))
    expect(await ensureDemoPalettes(t.db)).toBe(1)
    await t.db.update(occasions).set({ decor: 'generic' }).where(eq(occasions.key, 'couple'))
    expect(await ensureOccasionDecor(t.db)).toBe(1)
    const [couple] = await t.db.select().from(occasions).where(eq(occasions.key, 'couple'))
    expect(couple.decor).toBe(DEMO_DECOR.couple)
  })
})
