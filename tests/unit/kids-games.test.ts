// Kids get juice instead of beer: the kid's birthday is a kids' occasion, the demo beer is
// adults-only, and the beer stall pours a juice. Buyers are never told about the swap.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { occasions, stalls, tastings } from '../../src/server/db/schema.ts'
import { updateKidsTastings } from '../../src/server/services/kids-update.ts'
import { KIDS_DRINK, seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

describe("kids' route preview (public)", () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())
  const preview = (q: string) =>
    t.app.inject({ url: `/api/shop/route-preview?themeId=${ids.carmelThemeId}${q}` }).then((r) => r.json())

  it("shows the juice teaser on a kid's birthday, with no swap", async () => {
    const kids = await preview('&occasion=birthday_kid')
    const last = kids.stops.at(-1)
    expect(last).toEqual({
      teaser: KIDS_DRINK.teaser,
      icon: '/static/icons/fruit.png',
      finale: true,
      status: 'as_listed',
    })
    expect(kids.stops.every((s: { status: string }) => s.status === 'as_listed')).toBe(true)
  })

  it('shows the beer for adults and with no occasion', async () => {
    for (const q of ['', '&occasion=birthday_friend', '&occasion=nope'])
      expect((await preview(q)).stops.at(-1)).toMatchObject({ teaser: 'משהו קר מהחבית לסיום' })
  })

  it('a kid with a gluten allergy still gets the juice', async () => {
    expect((await preview('&occasion=birthday_kid&allergens=גלוטן')).stops.at(-1).teaser).toBe(
      KIDS_DRINK.teaser,
    )
  })

  it('the shop marks the kids occasion', async () => {
    const shop = (await t.app.inject({ url: '/api/shop' })).json()
    const forKids = shop.occasions
      .filter((o: { forKids: boolean }) => o.forKids)
      .map((o: { key: string }) => o.key)
    expect(forKids).toEqual(['birthday_kid'])
  })

  it('the admin edits both flags', async () => {
    const cookie = await ownerCookie(t.app)
    const call = (url: string, payload: object) =>
      t.app.inject({ method: 'PATCH', url: `/admin/api/catalog${url}`, headers: { cookie }, payload })
    const [juice] = await t.db.select().from(tastings).where(eq(tastings.name, KIDS_DRINK.name))
    const res = await call(`/tastings/${juice.id}`, { adultsOnly: true })
    expect(res.json()).toMatchObject({ adultsOnly: true })
    await call(`/tastings/${juice.id}`, { adultsOnly: false })
    const [occ] = await t.db.select().from(occasions).where(eq(occasions.key, 'generic'))
    expect((await call(`/occasions/${occ.id}`, { forKids: true })).json()).toMatchObject({ forKids: true })
    await call(`/occasions/${occ.id}`, { forKids: false })
  })
})

describe('kids update for unseeded databases (production script)', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  beforeEach(async () => {
    t = await makeTestApp()
    await seedDemo(t.db)
    // What production looks like before the change.
    await t.db.update(occasions).set({ forKids: false })
    await t.db.update(tastings).set({ adultsOnly: false })
    await t.db.delete(tastings).where(eq(tastings.name, KIDS_DRINK.name))
  })
  afterEach(() => t.close())
  const state = async () => {
    const [kid] = await t.db.select().from(occasions).where(eq(occasions.key, 'birthday_kid'))
    const all = await t.db.select().from(tastings)
    return { kid, all }
  }

  it('changes nothing on a dry run', async () => {
    const log = await updateKidsTastings(t.db, { apply: false })
    expect(log.length).toBeGreaterThan(0)
    expect(log.every((l) => l.startsWith('[dry run]'))).toBe(true)
    const { kid, all } = await state()
    expect(kid.forKids).toBe(false)
    expect(all.some((x) => x.adultsOnly || x.name === KIDS_DRINK.name)).toBe(false)
  })

  it('applies once, and a second run changes nothing', async () => {
    await updateKidsTastings(t.db, { apply: true })
    const { kid, all } = await state()
    expect(kid.forKids).toBe(true)
    expect(
      all
        .filter((x) => x.adultsOnly)
        .map((x) => x.name)
        .sort(),
    ).toEqual(['בירה מהחבית', 'סיידר תפוחים'])
    const [beerStall] = await t.db.select().from(stalls).where(eq(stalls.name, 'בירה בסוף השוק'))
    const juice = all.filter((x) => x.name === KIDS_DRINK.name)
    expect(juice).toEqual([
      expect.objectContaining({
        stallId: beerStall.id,
        teaser: KIDS_DRINK.teaser,
        teaserIcon: 'fruit',
        feeAgorot: 1200,
      }),
    ])
    const again = await updateKidsTastings(t.db, { apply: true })
    expect(again.some((l) => l.includes('added') || l.includes('marked'))).toBe(false)
    expect((await state()).all.filter((x) => x.name === KIDS_DRINK.name)).toHaveLength(1)
  })
})
