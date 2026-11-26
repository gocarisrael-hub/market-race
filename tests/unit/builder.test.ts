import { describe, expect, it } from 'vitest'
import { attachPhotos, buildGame, previewRoute } from '../../src/server/domain/builder.ts'
import { partsToString } from '../../src/server/domain/template.ts'
import { catalog, order } from '../helpers/fixtures.ts'

describe('buildGame', () => {
  it('builds every stop with filled riddles and no flags', () => {
    const { game, flags } = buildGame({ ...catalog(), order: order() })
    expect(flags).toEqual([])
    expect(game.stops).toHaveLength(3)
    expect(partsToString(game.stops[0].riddle.parts)).toContain('מאז יואב מהשכבה, מיכל יודעת')
    expect(game.stops[0].stall.pin).toEqual({ x: 40, y: 30 })
    expect(game.stops[0].backup?.stall.id).toBe(2)
    expect(game.stops[2].finale).toBe(true)
    expect(game.stops[1].tasting.feeAgorot).toBe(1500)
  })

  it('swaps to another safe tasting at the same stall', () => {
    const { game, flags } = buildGame({ ...catalog(), order: order({ allergens: ['גלוטן'] }) })
    expect(game.stops[2].tasting.name).toBe('סיידר')
    expect(game.stops[2].swappedToBackup).toBe(false)
    // The bakery has no gluten-free tasting: goes to the falafel backup with its own riddle.
    expect(game.stops[1].stall.id).toBe(4)
    expect(game.stops[1].riddle.answer).toBe('פלאפל')
    expect(game.stops[1].swappedToBackup).toBe(true)
    expect(flags).toEqual([])
  })

  it('blocks and flags when neither the stall nor the backup is safe, keeping the stop', () => {
    const { game, flags } = buildGame({ ...catalog(), order: order({ allergens: ['גלוטן', 'שומשום'] }) })
    expect(game.stops).toHaveLength(3)
    expect(flags).toEqual([expect.objectContaining({ code: 'blocked_stop', stopIndex: 1 })])
  })

  it('uses the backup when the main stall is inactive', () => {
    const c = catalog()
    c.stalls[0].active = false
    const { game } = buildGame({ ...c, order: order() })
    // Stall 2 has no riddle → cannot swap → blocked
    expect(game.stops[0].stall.id).toBe(1)
  })

  it('applies the diet filter', () => {
    const { game, flags } = buildGame({ ...catalog(), order: order({ diets: ['vegan'] }) })
    expect(game.stops[1].stall.id).toBe(4)
    expect(game.stops[2].tasting.name).toBe('בירה')
    expect(flags).toEqual([])
  })

  it('uses the form template and flags a missing form', () => {
    const he = buildGame({ ...catalog(), order: order({ form: 'he', honoreeName: 'דני' }) })
    expect(partsToString(he.game.stops[0].riddle.parts)).toContain('דני יודע')
    const couple = buildGame({ ...catalog(), order: order({ form: 'couple' }) })
    expect(couple.flags.filter((f) => f.code === 'blocked_stop')).toHaveLength(3)
  })

  it('attaches photos to non-finale stops and the letter, and uses the company palette', () => {
    const palette = { background: '#fff', accent: '#123456', ink: '#000', paper: '#fff' }
    const { game } = buildGame({
      ...catalog(),
      order: order({
        photos: ['a.jpg', 'b.jpg', 'c.jpg'],
        company: { name: 'אקמה', logo: 'logo.png', palette },
      }),
    })
    expect(game.stops.map((s) => s.photo)).toEqual(['a.jpg', 'b.jpg', null])
    expect(game.letter.photos).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    expect(game.theme.palette.accent).toBe('#123456')
    expect(game.company).toEqual({ name: 'אקמה', logo: 'logo.png' })
  })

  describe("kids' games (occasion forKids)", () => {
    // The beer stall: beer and cider are alcohol; a juice is the kids' drink.
    const kidsCatalog = () => {
      const c = catalog()
      for (const t of c.tastings) if (t.id === 5 || t.id === 6) t.adultsOnly = true
      c.tastings.push({
        id: 7,
        stallId: 5,
        name: 'מיץ',
        allergens: [],
        diets: ['vegan', 'vegetarian', 'gluten_free'],
        feeAgorot: 1200,
        active: true,
      })
      return c
    }

    it('kids get the juice at the same stall; the owner sees why', () => {
      const { game, flags } = buildGame({ ...kidsCatalog(), forKids: true, order: order() })
      expect(flags).toEqual([])
      expect(game.stops[2].stall.id).toBe(5)
      expect(game.stops[2].tasting.name).toBe('מיץ')
      expect(game.stops[2].swappedToBackup).toBe(false)
      expect(game.stops[2].swap).toEqual({ reason: 'kids', listedTasting: 'בירה' })
      expect(game.stops[0].swap).toBeUndefined()
    })

    it('adults get the beer, unswapped', () => {
      const { game, flags } = buildGame({ ...kidsCatalog(), order: order() })
      expect(flags).toEqual([])
      expect(game.stops[2].tasting.name).toBe('בירה')
      expect(game.stops[2].swap).toBeUndefined()
    })

    it('an allergy swap stays an allergy swap', () => {
      const { game } = buildGame({ ...kidsCatalog(), order: order({ allergens: ['גלוטן'] }) })
      expect(game.stops[2].tasting.name).toBe('סיידר')
      expect(game.stops[2].swap).toEqual({ reason: 'diet', listedTasting: 'בירה' })
    })

    it('no drink for kids at the stall: the backup stall, else block and flag', () => {
      const c = catalog()
      for (const t of c.tastings) if (t.id === 5 || t.id === 6) t.adultsOnly = true
      const blocked = buildGame({ ...c, forKids: true, order: order() })
      expect(blocked.flags).toEqual([
        expect.objectContaining({
          code: 'blocked_stop',
          stopIndex: 2,
          message: expect.stringContaining('ילדים'),
        }),
      ])
      // With a backup that has a riddle and a soft drink, the stop moves there.
      c.route.stops[2] = { ...c.route.stops[2], backupStallId: 1, backupRiddleId: 1 }
      const moved = buildGame({ ...c, forKids: true, order: order() })
      expect(moved.flags).toEqual([])
      expect(moved.game.stops[2]).toMatchObject({
        swappedToBackup: true,
        swap: { reason: 'kids', listedTasting: 'בירה' },
      })
      expect(moved.game.stops[2].tasting.name).toBe('מיץ תפוזים')
    })

    it('previews the juice for kids as a swap with its reason', () => {
      const c = kidsCatalog()
      const kids = previewRoute({ ...c, stops: c.route.stops, allergens: [], diets: [], forKids: true })
      expect(kids[2]).toMatchObject({ status: 'swapped', reason: 'kids' })
      expect(kids[2].tasting?.name).toBe('מיץ')
      const adults = previewRoute({ ...c, stops: c.route.stops, allergens: [], diets: [] })
      expect(adults[2]).toMatchObject({ status: 'as_listed' })
      expect(adults[2].tasting?.name).toBe('בירה')
    })
  })

  describe('photos', () => {
    const build = (photos: string[]) => buildGame({ ...catalog(), order: order({ photos }) }).game

    it('no photos: no stop and no letter photo', () => {
      const game = build([])
      expect(game.stops.map((s) => s.photo)).toEqual([null, null, null])
      expect(game.letter.photos).toEqual([])
    })

    it('fewer photos than riddles: the first stops get them, in order', () => {
      expect(build(['a.jpg']).stops.map((s) => s.photo)).toEqual(['a.jpg', null, null])
    })

    it('more photos than riddle stops: the extra ones are only in the letter', () => {
      const game = build(['a', 'b', 'c', 'd', 'e'])
      expect(game.stops.map((s) => s.photo)).toEqual(['a', 'b', null])
      expect(game.letter.photos).toEqual(['a', 'b', 'c', 'd', 'e'])
    })

    it('caps at five, drops blanks and duplicates', () => {
      expect(build(['a', '', 'a', 'b', 'c', 'd', 'e', 'f']).letter.photos).toEqual(['a', 'b', 'c', 'd', 'e'])
    })

    it('attachPhotos replaces the photos of a built game without touching the rest', () => {
      const game = build(['a', 'b'])
      const next = attachPhotos(game, ['x'])
      expect(next.stops.map((s) => s.photo)).toEqual(['x', null, null])
      expect(next.letter).toEqual({ notes: game.letter.notes, photos: ['x'] })
      expect(next.stops.map((s) => s.riddle)).toEqual(game.stops.map((s) => s.riddle))
      // Pure: the original is unchanged.
      expect(game.stops[0].photo).toBe('a')
    })

    it('a one-stop route (finale only) shows photos only in the letter', () => {
      const game = build(['a'])
      const single = attachPhotos({ ...game, stops: [{ ...game.stops[2] }] }, ['a'])
      expect(single.stops[0].photo).toBeNull()
      expect(single.letter.photos).toEqual(['a'])
    })
  })
})
