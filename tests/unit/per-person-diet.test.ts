// Per-person allergens and diets: a restriction is for some of the group. At each stop the regular
// tasting goes to everyone it fits and a fitting alternative at the same stall to the others; when
// the stall has none for someone, the whole group moves to the backup, then block and flag.
import { describe, expect, it } from 'vitest'
import { buildGame } from '../../src/server/domain/builder.ts'
import {
  cleanCounts,
  dietProfiles,
  portionsForPlayers,
  restrictionsOf,
  stopPortions,
} from '../../src/server/domain/diet.ts'
import { type SettlementRow, summarize } from '../../src/server/domain/settlement.ts'
import { catalog, order } from '../helpers/fixtures.ts'

// The fixture plus alternatives: a vegan tasting at the bakery, and a vegan pastry with nuts.
function withAlternatives() {
  const c = catalog()
  c.tastings.push(
    {
      id: 7,
      stallId: 3,
      name: 'לחוח טבעוני',
      allergens: ['גלוטן'],
      diets: ['vegan', 'vegetarian'],
      feeAgorot: 1300,
      active: true,
    },
    {
      id: 8,
      stallId: 3,
      name: 'מאפה אגוזים טבעוני',
      allergens: ['גלוטן', 'אגוזים'],
      diets: ['vegan', 'vegetarian'],
      feeAgorot: 1100,
      active: true,
    },
  )
  return c
}

const names = (ps: { count: number; tasting: { name: string } }[] | undefined) =>
  (ps ?? []).map((p) => `${p.count} × ${p.tasting.name}`)

describe('restrictions and profiles', () => {
  it('a ticked restriction without a count is everyone (older orders)', () => {
    expect(restrictionsOf({ people: 4, allergens: ['אגוזים'], diets: ['vegan'] })).toEqual([
      { key: 'אגוזים', kind: 'allergen', count: 4 },
      { key: 'vegan', kind: 'diet', count: 4 },
    ])
    expect(
      restrictionsOf({ people: 4, allergens: [], diets: ['vegan'], restrictionCounts: { vegan: 9 } }),
    ).toEqual([{ key: 'vegan', kind: 'diet', count: 4 }])
    expect(cleanCounts(4, ['אגוזים'], ['vegan'], { vegan: 1, stale: 2 })).toEqual({ אגוזים: 4, vegan: 1 })
  })

  it('treats restricted people as different people unless the counts force overlap', () => {
    const r = restrictionsOf({
      people: 4,
      allergens: ['אגוזים'],
      diets: ['vegan'],
      restrictionCounts: { vegan: 1, אגוזים: 1 },
    })
    expect(dietProfiles(4, r)).toEqual([
      { allergens: [], diets: [], count: 2 },
      { allergens: ['אגוזים'], diets: [], count: 1 },
      { allergens: [], diets: ['vegan'], count: 1 },
    ])
    // 3 nut allergies and 2 vegans among 4: one person is forced to be both.
    const forced = dietProfiles(
      4,
      restrictionsOf({
        people: 4,
        allergens: ['אגוזים'],
        diets: ['vegan'],
        restrictionCounts: { אגוזים: 3, vegan: 2 },
      }),
    )
    expect(forced.reduce((n, p) => n + p.count, 0)).toBe(4)
    expect(forced.find((p) => p.allergens.length && p.diets.length)?.count).toBe(1)
  })
})

describe('buildGame with per-person diets', () => {
  it('1 vegan of 4: a mixed stop, the regular tasting for 3 and the vegan one for 1', () => {
    const { game, flags } = buildGame({
      ...withAlternatives(),
      order: order({ diets: ['vegan'], restrictionCounts: { vegan: 1 } }),
    })
    expect(flags).toEqual([])
    const bakery = game.stops[1]
    expect(bakery.stall.id).toBe(3)
    expect(bakery.swappedToBackup).toBe(false)
    expect(bakery.swap).toBeUndefined()
    expect(bakery.tasting.name).toBe("ג'חנון")
    expect(names(bakery.portions)).toEqual(["3 × ג'חנון", '1 × לחוח טבעוני'])
    expect(bakery.portions?.[1].for).toEqual(['vegan'])
    // Stops the vegan can eat: nothing changes.
    expect(names(game.stops[0].portions)).toEqual(['4 × מיץ תפוזים'])
    expect(names(game.stops[2].portions)).toEqual(['4 × בירה'])
    expect(game.restrictionCounts).toEqual({ vegan: 1 })
  })

  it('no alternative at the stall: the whole group goes to the backup stall', () => {
    // Without the bakery's alternatives, one vegan sends everyone to the falafel backup.
    const { game, flags } = buildGame({
      ...catalog(),
      order: order({ diets: ['vegan'], restrictionCounts: { vegan: 1 } }),
    })
    expect(flags).toEqual([])
    expect(game.stops[1].stall.id).toBe(4)
    expect(game.stops[1].swappedToBackup).toBe(true)
    expect(game.stops[1].swap?.reason).toBe('diet')
    expect(names(game.stops[1].portions)).toEqual(['4 × פלאפל'])
  })

  it('no alternative anywhere: blocks and flags, as before', () => {
    const { flags } = buildGame({
      ...catalog(),
      order: order({ allergens: ['גלוטן', 'שומשום'], restrictionCounts: { גלוטן: 1, שומשום: 1 } }),
    })
    expect(flags).toEqual([expect.objectContaining({ code: 'blocked_stop', stopIndex: 1 })])
  })

  it('combined restrictions: 1 vegan and 1 nut allergy each get what fits them', () => {
    const { game, flags } = buildGame({
      ...withAlternatives(),
      order: order({
        allergens: ['אגוזים'],
        diets: ['vegan'],
        restrictionCounts: { vegan: 1, אגוזים: 1 },
      }),
    })
    expect(flags).toEqual([])
    // The nut allergy eats the jachnun; the vegan gets the first vegan tasting (lowest id).
    expect(names(game.stops[1].portions)).toEqual(["3 × ג'חנון", '1 × לחוח טבעוני'])
  })

  it('a vegan with a nut allergy (forced by the counts) never gets the nut pastry', () => {
    const c = withAlternatives()
    // Only the nut pastry is vegan at the bakery now.
    c.tastings = c.tastings.filter((t) => t.id !== 7)
    const both = buildGame({
      ...c,
      order: order({
        people: 2,
        allergens: ['אגוזים'],
        diets: ['vegan'],
        restrictionCounts: { vegan: 1, אגוזים: 2 },
      }),
    })
    // Everyone is allergic to nuts and one is vegan: nothing at the bakery fits, the group moves.
    expect(both.game.stops[1].stall.id).toBe(4)
    expect(names(both.game.stops[1].portions)).toEqual(['2 × פלאפל'])
    // Different people: the vegan eats the nut pastry, the allergic one the jachnun.
    const apart = buildGame({
      ...c,
      order: order({
        people: 2,
        allergens: ['אגוזים'],
        diets: ['vegan'],
        restrictionCounts: { vegan: 1, אגוזים: 1 },
      }),
    })
    expect(names(apart.game.stops[1].portions)).toEqual(["1 × ג'חנון", '1 × מאפה אגוזים טבעוני'])
  })

  it('everyone restricted: the whole group gets the alternative, as before', () => {
    const { game } = buildGame({ ...withAlternatives(), order: order({ diets: ['vegan'] }) })
    expect(names(game.stops[1].portions)).toEqual(['4 × לחוח טבעוני'])
    expect(game.stops[1].swap).toEqual({ reason: 'diet', listedTasting: "ג'חנון" })
  })

  it("kids' adults-only stays whole-group", () => {
    const c = withAlternatives()
    for (const t of c.tastings) if (t.id === 5 || t.id === 6) t.adultsOnly = true
    c.tastings.push({
      id: 9,
      stallId: 5,
      name: 'מיץ',
      allergens: [],
      diets: ['vegan', 'vegetarian', 'gluten_free'],
      feeAgorot: 1200,
      active: true,
    })
    const { game } = buildGame({
      ...c,
      forKids: true,
      order: order({ diets: ['vegan'], restrictionCounts: { vegan: 1 } }),
    })
    expect(names(game.stops[2].portions)).toEqual(['4 × מיץ'])
    expect(game.stops[2].swap?.reason).toBe('kids')
  })

  it('the day-of backup carries its own portions', () => {
    const c = withAlternatives()
    c.route.stops[0] = { ...c.route.stops[0], backupStallId: 3, backupRiddleId: 3 }
    const { game } = buildGame({ ...c, order: order({ diets: ['vegan'], restrictionCounts: { vegan: 1 } }) })
    expect(names(stopPortions(game.stops[0], game.people, true))).toEqual(["3 × ג'חנון", '1 × לחוח טבעוני'])
  })
})

describe('portions on the day', () => {
  const tasting = (id: number, name: string) => ({ id, name, allergens: [], diets: [], feeAgorot: 1000 })
  const mixed = [
    { tasting: tasting(1, 'בוריק'), count: 3, for: [] },
    { tasting: tasting(2, 'בוריק טבעוני'), count: 1, for: ['vegan'] },
  ]
  it('fewer players: the regular portions shrink first', () => {
    expect(names(portionsForPlayers(mixed, 4))).toEqual(['3 × בוריק', '1 × בוריק טבעוני'])
    expect(names(portionsForPlayers(mixed, 2))).toEqual(['1 × בוריק', '1 × בוריק טבעוני'])
    expect(names(portionsForPlayers(mixed, 1))).toEqual(['1 × בוריק טבעוני'])
  })
  it('older games have one tasting for the whole group', () => {
    const stop = { tasting: tasting(1, 'בוריק'), backup: null }
    expect(names(stopPortions(stop, 4))).toEqual(['4 × בוריק'])
  })
})

describe('settlement with mixed stops', () => {
  const row = (over: Partial<SettlementRow>): SettlementRow => ({
    redemptionId: 1,
    redeemedAt: new Date('2026-11-10T10:00:00Z'),
    orderId: 1,
    stopIndex: 2,
    orderNo: 'MR-AAAAAA',
    stallId: 1,
    stallName: 'בוריק',
    tastingName: 'בוריק',
    portions: 3,
    feeAgorot: 1200,
    usedBackup: false,
    ...over,
  })
  it('pays each tasting its own fee and counts the stop once', () => {
    const s = summarize(
      '2026-11',
      [
        row({}),
        row({ redemptionId: 2, tastingName: 'בוריק טבעוני', portions: 1, feeAgorot: 1400 }),
        row({ redemptionId: 3, orderId: 2, orderNo: 'MR-BBBBBB', portions: 2 }),
      ],
      (d) => d.toISOString().slice(0, 10),
    )
    const [stall] = s.stalls
    expect(stall.redemptions).toBe(2)
    expect(stall.portions).toBe(6)
    expect(stall.totalAgorot).toBe(3 * 1200 + 1400 + 2 * 1200)
    expect(stall.byTasting).toEqual([
      { tastingName: 'בוריק', feeAgorot: 1200, portions: 5, totalAgorot: 6000 },
      { tastingName: 'בוריק טבעוני', feeAgorot: 1400, portions: 1, totalAgorot: 1400 },
    ])
  })
})
