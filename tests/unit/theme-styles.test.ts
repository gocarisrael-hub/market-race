// Game styles (themes): which ones each occasion is offered, the ten seeded styles and their
// refresh on older databases, the style frozen into the game, and the style change on the manage
// link until the game starts.
import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { orders, palettes, settings, themes } from '../../src/server/db/schema.ts'
import { buildGame } from '../../src/server/domain/builder.ts'
import { FONTS, frameColors, paletteIssues, themeVars } from '../../src/server/domain/look.ts'
import { gameStyle, offeredFor, themesFor } from '../../src/server/domain/themes.ts'
import { THEME_FONTS } from '../../src/server/domain/types.ts'
import { DEMO_SEED_VERSION, refreshDemoContent } from '../../src/server/services/demo-refresh.ts'
import { getView } from '../../src/server/services/play.ts'
import { DEMO_PALETTES, seedDemo } from '../../src/server/services/seed-demo.ts'
import { DEMO_THEMES } from '../../src/server/services/seed-themes.ts'
import { makeTestApp } from '../helpers/app.ts'
import { catalog, order } from '../helpers/fixtures.ts'

const keysFor = (occasion: string | null, recipient?: string | null) =>
  themesFor(DEMO_THEMES, occasion, recipient).map((t) => t.key)

describe('styles offered per occasion', () => {
  it('an empty list offers a style everywhere; a list limits it', () => {
    expect(offeredFor({ occasionKeys: [], recipients: [] }, 'anything')).toBe(true)
    expect(offeredFor({ occasionKeys: ['couple'], recipients: [] }, 'couple')).toBe(true)
    expect(offeredFor({ occasionKeys: ['couple'], recipients: [] }, 'friends')).toBe(false)
    expect(offeredFor({ occasionKeys: ['couple'], recipients: [] }, null)).toBe(false)
    // The recipient narrows it; with no recipient (a company game) it does not.
    expect(offeredFor({ occasionKeys: [], recipients: ['he'] }, 'x', 'she')).toBe(false)
    expect(offeredFor({ occasionKeys: [], recipients: ['he'] }, 'x', 'he')).toBe(true)
    expect(offeredFor({ occasionKeys: [], recipients: ['he'] }, 'x', null)).toBe(true)
  })

  it('maps the demo occasions to their styles', () => {
    expect(keysFor('bachelorette', 'she')).toEqual(['carmel', 'mahane', 'riso', 'neon', 'blush'])
    expect(keysFor('couple', 'couple')).toEqual(['carmel', 'mahane', 'gold'])
    expect(keysFor('birthday_parent', 'she')).toEqual(['carmel', 'mahane', 'gold', 'cobalt'])
    expect(keysFor('birthday_parent', 'he')).toEqual(['carmel', 'mahane', 'ink', 'gold', 'cobalt'])
    expect(keysFor('birthday_friend', 'she')).toEqual(['carmel', 'mahane', 'night', 'riso', 'neon', 'blush'])
    expect(keysFor('birthday_friend', 'he')).toEqual(['carmel', 'mahane', 'night', 'riso', 'neon', 'ink'])
    expect(keysFor('friends', 'group')).toEqual(['carmel', 'mahane', 'night', 'riso', 'neon', 'ink'])
    expect(keysFor('family', 'family')).toEqual(['carmel', 'mahane', 'cobalt'])
    expect(keysFor('generic', 'group')).toEqual(['carmel', 'mahane', 'night', 'riso', 'ink', 'cobalt'])
    expect(keysFor('team_day', null)).toEqual(['carmel', 'mahane', 'night', 'corporate'])
    expect(keysFor('retirement', null)).toEqual(['carmel', 'mahane', 'corporate'])
  })

  it('every style is offered somewhere, and the specials where the owner asked', () => {
    for (const t of DEMO_THEMES) expect(keysFor(t.occasionKeys[0] ?? 'any', t.recipients[0])).toContain(t.key)
    expect(keysFor('friends')).toContain('neon')
    expect(keysFor('bachelorette')).toContain('neon')
    expect(keysFor('bachelorette')).toContain('blush')
    expect(keysFor('couple')).toContain('gold')
    expect(keysFor('team_day')).toContain('corporate')
    expect(keysFor('couple')).not.toContain('corporate')
  })
})

describe('the ten demo styles', () => {
  it('are ten, with unique keys and names', () => {
    expect(DEMO_THEMES).toHaveLength(10)
    expect(new Set(DEMO_THEMES.map((t) => t.key)).size).toBe(10)
    expect(new Set(DEMO_THEMES.map((t) => t.name)).size).toBe(10)
  })

  for (const t of DEMO_THEMES) {
    it(`"${t.name}" reads well and ships its files`, () => {
      expect(paletteIssues(t.palette, t.style)).toEqual([])
      expect(THEME_FONTS).toContain(t.style.font ?? 'amatic')
      const file = t.mapFile.replace('builtin:', 'assets/maps/')
      expect(existsSync(file), file).toBe(true)
      if (t.style.icons) {
        for (const icon of ['fruit', 'tomatoes', 'falafel', 'hummus', 'coffee', 'spices', 'flowers'])
          expect(existsSync(`assets/icons/${t.style.icons}/${icon}.webp`)).toBe(true)
      }
    })
  }

  it('only neon is dark; the fonts and treatments follow the showcase', () => {
    const by = (k: string) => DEMO_THEMES.find((t) => t.key === k)!
    expect(DEMO_THEMES.filter((t) => t.style.mode === 'dark').map((t) => t.key)).toEqual(['neon'])
    expect(by('neon').style.treatment).toBe('neon')
    expect(by('gold').style.treatment).toBe('foil')
    expect(by('gold').style.font).toBe('frank')
    expect(by('ink').style.font).toBe('suez')
    expect(themeVars(by('ink').palette, by('ink').style)['--hand']).toContain('Suez One')
    expect(themeVars(by('ink').palette, by('ink').style)['--hs']).toBe(String(FONTS.suez.scale))
    expect(themeVars(by('gold').palette, by('gold').style)['--riddle-font']).toContain('Frank Ruhl Libre')
  })

  it('draws the photo frame in the theme ink and accent', () => {
    const gold = DEMO_THEMES.find((t) => t.key === 'gold')!
    expect(frameColors(gold.palette, gold.style)).toEqual({
      paper: '#FFFCF5',
      ink: '#B98A3A',
      accent: '#7A1F2B',
      accent2: '#7A1F2B',
    })
  })
})

describe('the style in the frozen game', () => {
  const neon = DEMO_THEMES.find((t) => t.key === 'neon')!
  const style = neon.style
  it('keeps the fixed colors in the own palette and drops them in another', () => {
    expect(gameStyle(style, true).colors).toEqual(style.colors)
    expect(gameStyle(style, false).colors).toBeUndefined()
    expect(gameStyle(style, false).font).toBe('amatic')
    expect(gameStyle(undefined, true)).toEqual({})
  })

  it('the builder snapshots the style', () => {
    const c = catalog()
    const theme = { ...c.theme, palette: neon.palette, style }
    expect(buildGame({ ...c, theme, order: order() }).game.theme.style).toEqual(style)
    const sea = { background: '#DCE6EA', accent: '#1F5E8C', ink: '#14262F', paper: '#FAFCFC' }
    const g = buildGame({ ...c, theme, palette: { id: 3, palette: sea }, order: order() }).game
    expect(g.theme.style?.treatment).toBe('neon')
    expect(g.theme.style?.colors).toBeUndefined()
  })
})

describe('seeded styles and the refresh', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeEach(async () => {
    t = await makeTestApp({}, { provider: 'mock' })
    ids = await seedDemo(t.db)
  })
  afterEach(() => t.close())

  const rows = () => t.db.select().from(themes).orderBy(themes.sort)
  const byKey = async (k: string) => (await rows()).find((r) => r.key === k)!

  it('seeds the ten styles with keys, and the palette variants only on the watercolor maps', async () => {
    const all = await rows()
    expect(all.map((r) => r.key)).toEqual(DEMO_THEMES.map((d) => d.key))
    expect((await byKey('neon')).style.treatment).toBe('neon')
    expect((await byKey('blush')).occasionKeys).toEqual(['bachelorette', 'birthday_friend'])
    const pal = await t.db.select().from(palettes)
    const water = new Set([(await byKey('carmel')).id, (await byKey('mahane')).id])
    for (const p of pal) for (const id of p.themeIds) expect(water.has(id)).toBe(true)
    expect(pal.map((p) => p.name)).toEqual(DEMO_PALETTES.map((p) => p.name))
  })

  it('brings a version-1 database to the ten styles, keeping the ids and the pins', async () => {
    // What version 1 left: four themes found by name, no keys, the riso and night palettes.
    const carmel = await byKey('carmel')
    for (const k of ['corporate', 'neon', 'blush', 'ink', 'gold', 'cobalt'])
      await t.db.delete(themes).where(eq(themes.key, k))
    const riso = await byKey('riso')
    await t.db
      .update(themes)
      .set({ name: 'כרמל כחול-ורוד', style: {}, occasionKeys: [] })
      .where(eq(themes.id, riso.id))
    await t.db.update(themes).set({ key: null })
    await t.db.insert(palettes).values({ name: 'לילה', palette: riso.palette, themeIds: [riso.id] })
    await t.db.update(settings).set({ value: 1 }).where(eq(settings.key, 'demo_seed_version'))

    const report = await refreshDemoContent(t.db)
    expect(report.themes).toEqual({ updated: 4, inserted: 6, kept: 0 })
    const after = await rows()
    expect(after.map((r) => r.key).sort()).toEqual(DEMO_THEMES.map((d) => d.key).sort())
    expect((await byKey('carmel')).id).toBe(carmel.id)
    expect((await byKey('riso')).id).toBe(riso.id)
    expect((await byKey('riso')).name).toBe('כרמל כחול־ורוד')
    expect((await byKey('riso')).occasionKeys).toContain('bachelorette')
    expect((await byKey('neon')).pins).toEqual(carmel.pins)
    const [night] = await t.db.select().from(palettes).where(eq(palettes.name, 'לילה'))
    expect(night.active).toBe(false)
    const [version] = await t.db.select().from(settings).where(eq(settings.key, 'demo_seed_version'))
    expect(version.value).toBe(DEMO_SEED_VERSION)
  })

  it('leaves a style the admin edited after the last refresh alone', async () => {
    const gold = await byKey('gold')
    await t.db.update(settings).set({ value: 1 }).where(eq(settings.key, 'demo_seed_version'))
    await new Promise((r) => setTimeout(r, 5))
    await t.db.update(themes).set({ name: 'זהב של הבעלים' }).where(eq(themes.id, gold.id))
    const report = await refreshDemoContent(t.db)
    expect(report.themes.kept).toBe(1)
    expect((await byKey('gold')).name).toBe('זהב של הבעלים')
  })

  async function paidOrder(themeKey: string, occasionKey = 'bachelorette') {
    const theme = await byKey(themeKey)
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        occasionKey,
        form: 'she',
        honoreeName: 'מיכל',
        themeId: theme.id,
        people: 4,
        answers: { first_love: 'יואב' },
        buyer: { name: 'נועה', phone: '0501234567', email: 'noa@example.com' },
      },
    })
    return res
  }

  it('refuses a style the occasion does not offer, and plays the chosen one', async () => {
    const corp = await paidOrder('corporate')
    expect(corp.statusCode).toBe(400)
    expect(corp.json().error).toBe('bad_theme')
    const res = await paidOrder('neon')
    expect(res.statusCode).toBe(200)
    const { manageToken } = res.json()
    const pay = await t.app.inject({ method: 'POST', url: `/api/orders/${manageToken}/pay` })
    const s = new URL(pay.json().url).searchParams.get('s')!
    await t.app.inject({ method: 'POST', url: '/api/payment/mock/complete', payload: { token: s } })
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, manageToken))
    expect(o.game?.theme.style?.treatment).toBe('neon')
    const view = await getView(t.db, o.gameToken)
    expect(typeof view === 'object' && view.theme?.style.mode).toBe('dark')

    // The manage link lists the styles offered for the occasion on this market, and changes it.
    const manage = (await t.app.inject({ url: `/api/manage/${manageToken}` })).json()
    const names = manage.look.themes.map((x: { name: string }) => x.name)
    expect(names).toContain('ורוד פודרה')
    expect(names).not.toContain('כרמל לחברות')
    const edit = (payload: Record<string, unknown>) =>
      t.app.inject({ method: 'PUT', url: `/api/manage/${manageToken}/answers`, payload })
    const corpId = (await byKey('corporate')).id
    expect((await edit({ answers: o.answers, themeId: corpId })).json().error).toBe('bad_theme')
    const blush = await byKey('blush')
    expect((await edit({ answers: o.answers, themeId: blush.id })).statusCode).toBe(200)
    const [after] = await t.db.select().from(orders).where(eq(orders.id, o.id))
    expect(after.themeId).toBe(blush.id)
    expect(after.paletteId).toBeNull()
    expect(after.game?.theme.style?.icons).toBe('blush')
    expect(after.game?.theme.palette.background).toBe('#F7DDE2')
    expect(ids.carmelThemeId).toBe((await byKey('carmel')).id)
  })
})
