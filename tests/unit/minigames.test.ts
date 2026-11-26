import { describe, expect, it } from 'vitest'
import {
  ALEFBET,
  buildMinigames,
  checkMinigame,
  DEFAULT_MINIGAMES,
  type MinigameContent,
  type MinigameInput,
  placements,
  publicMinigame,
  regenerateMinigame,
  shiftHebrew,
} from '../../src/server/domain/minigames.ts'
import type { MinigameType, SnapshotMinigame } from '../../src/server/domain/types.ts'

const RICH = {
  name: 'מיכל',
  catchphrase: 'אני רק שואלת',
  favorite_food: 'שקשוקה',
  favorite_place: 'הכנרת',
  one_word: 'עקשנית',
  dream: 'לגור בפריז',
  photo_where: 'אילת',
}

const only = (...types: MinigameType[]): MinigameContent => ({ ...DEFAULT_MINIGAMES, after: [2], types })

const input = (over: Partial<MinigameInput> = {}): MinigameInput => ({
  form: 'she',
  answers: RICH,
  questions: [],
  photos: ['photos/1.webp'],
  letterNotes: [],
  content: DEFAULT_MINIGAMES,
  stopCount: 5,
  seed: 'MR-1001',
  ...over,
})

const one = (types: MinigameType[], over: Partial<MinigameInput> = {}) => {
  const games = buildMinigames(input({ content: only(...types), ...over }))
  expect(games).toHaveLength(1)
  return games[0]
}

/** Everything a phone receives for a game, as text. */
const payload = (g: SnapshotMinigame) => JSON.stringify(publicMinigame(g, 0, false, (f) => `/uploads/${f}`))

describe('mini-game generation, per type', () => {
  it("who said it: the honoree's own line among curated ones", () => {
    const g = one(['who_said'])
    expect(g.type).toBe('who_said')
    expect(g.options).toHaveLength(4)
    expect(g.options).toContain('אני רק שואלת')
    expect(g.options![g.solution.option!]).toBe('אני רק שואלת')
    for (const o of g.options!) if (o !== 'אני רק שואלת') expect(DEFAULT_MINIGAMES.lines).toContain(o)
    expect(g.prompt.map((p) => p.v).join('')).toBe('איזה משפט מיכל אומרת כל הזמן?')
    expect(checkMinigame(g, { option: g.solution.option })).toBe(true)
    expect(checkMinigame(g, { option: (g.solution.option! + 1) % 4 })).toBe(false)
    // The phone gets the choices, never which one is right.
    expect(payload(g)).not.toContain('"solution"')
    expect(payload(g)).not.toContain('"option"')
  })

  it('who said it: never offers a curated line that is the real one', () => {
    const g = one(['who_said'], { answers: { ...RICH, catchphrase: 'יאללה, זזים!' } })
    expect(g.options!.filter((o) => o.replace(/[^א-ת ]/g, '').trim() === 'יאללה זזים')).toHaveLength(1)
  })

  it('true or false: 3-4 statements from the answers, at least one of each, false ones swapped', () => {
    const g = one(['true_false'])
    const truths = g.solution.truths!
    expect(g.statements!.length).toBeGreaterThanOrEqual(3)
    expect(g.statements!.length).toBeLessThanOrEqual(4)
    expect(truths).toHaveLength(g.statements!.length)
    expect(truths).toContain(true)
    expect(truths).toContain(false)
    g.statements!.forEach((st, i) => {
      const slot = st.find((p) => p.t === 'slot' && g.slots.includes(p.slot))
      expect(slot).toBeTruthy()
      const real = RICH[slot!.t === 'slot' ? (slot!.slot as keyof typeof RICH) : 'name']
      if (truths[i]) expect(slot!.v).toBe(real)
      else expect(slot!.v).not.toBe(real)
    })
    expect(checkMinigame(g, { truths })).toBe(true)
    expect(checkMinigame(g, { truths: truths.map((v) => !v) })).toBe(false)
    expect(checkMinigame(g, { truths: truths.slice(1) })).toBe(false)
    expect(payload(g)).not.toContain('truths')
  })

  it('true or false needs three facts', () => {
    const games = buildMinigames(
      input({ content: only('true_false'), answers: { name: 'מיכל', favorite_food: 'שקשוקה', dream: 'x' } }),
    )
    expect(games).toEqual([])
  })

  it('what is in the photo: the first photo, zoomed on a spot, with places to choose from', () => {
    const g = one(['photo'])
    expect(g.photo).toBe('photos/1.webp')
    expect(g.focus!.x).toBeGreaterThanOrEqual(30)
    expect(g.focus!.x).toBeLessThanOrEqual(70)
    expect(g.options).toContain('אילת')
    expect(g.options![g.solution.option!]).toBe('אילת')
    const pub = publicMinigame(g, 0, false, (f) => `/uploads/${f}`)
    expect(pub.photo).toBe('/uploads/photos/1.webp')
    expect(payload(g)).not.toContain('solution')
  })

  it('the photo game needs a photo and the answer about it', () => {
    expect(buildMinigames(input({ content: only('photo'), photos: [] }))).toEqual([])
    const { photo_where: _, ...rest } = RICH
    expect(buildMinigames(input({ content: only('photo'), answers: rest }))).toEqual([])
  })

  it('personal cipher: a short answer shifted by the letters of another, with a personal key hint', () => {
    const g = one(['cipher'])
    const plain = g.solution.text!
    const shift = g.solution.shift!
    expect(shift).toBeGreaterThan(0)
    expect(g.cipher).toBe(shiftHebrew(plain, shift))
    expect(shiftHebrew(g.cipher!, -shift)).toBe(shiftHebrew(plain, 0))
    const hint = g.keyHint!.map((p) => p.v).join('')
    expect(hint).toContain('מזיזים כל אות אחורה')
    // The key is one of the honoree's answers, not the enciphered one.
    expect(g.slots).toHaveLength(2)
    expect(g.slots[0]).not.toBe(g.slots[1])
    expect(checkMinigame(g, { text: plain })).toBe(true)
    expect(checkMinigame(g, { text: shiftHebrew(plain, 0) })).toBe(true) // typed without final letters
    expect(checkMinigame(g, { text: g.cipher })).toBe(false)
    const pub = payload(g)
    expect(pub).not.toContain(plain)
    expect(pub).not.toContain('shift')
    expect(publicMinigame(g, 0, false, String).alefbet).toBe(ALEFBET)
  })

  it('shifts along the alef-bet with wrap-around and plain letters for finals', () => {
    expect(shiftHebrew('אבת', 1)).toBe('בגא')
    expect(shiftHebrew('שלום', 0)).toBe('שלומ')
    expect(shiftHebrew('ת ש', 2)).toBe('ב א')
  })

  it("a reward per game: the buyer's letter notes in order, else one of our lines", () => {
    const notes = [{ text: 'נחכה לך עוד חמישים שנה.', signature: 'נועה' }]
    const games = buildMinigames(input({ letterNotes: notes }))
    expect(games).toHaveLength(2)
    expect(games[0].reward).toEqual({ text: 'נחכה לך עוד חמישים שנה.', signature: 'נועה' })
    expect(games[1].reward.text).toContain('מיכל')
    expect(games[1].reward.text).toContain('לגור בפריז')
    // Never sent before it is solved.
    expect(JSON.stringify(publicMinigame(games[0], 0, false, String))).not.toContain('חמישים')
    expect(publicMinigame(games[0], 0, true, String).reward?.signature).toBe('נועה')
  })
})

describe('builder selection', () => {
  it('picks two games of different types, one per placement', () => {
    const games = buildMinigames(input())
    expect(games.map((g) => g.afterStop)).toEqual([2, 4])
    expect(new Set(games.map((g) => g.type)).size).toBe(2)
  })

  it('is reproducible from the seed, and varies between orders', () => {
    const a = buildMinigames(input())
    expect(buildMinigames(input())).toEqual(a)
    const types = new Set(
      Array.from({ length: 12 }, (_, i) => buildMinigames(input({ seed: `MR-${i}` }))[0].type),
    )
    expect(types.size).toBeGreaterThan(1)
  })

  it('only picks types the order has data for, and fewer when the data runs out', () => {
    // Only a catchphrase: one "who said it", nothing else.
    const games = buildMinigames(
      input({ answers: { name: 'מיכל', catchphrase: 'אני רק שואלת' }, photos: [] }),
    )
    expect(games.map((g) => g.type)).toEqual(['who_said'])
    expect(buildMinigames(input({ answers: { name: 'מיכל' } }))).toEqual([])
  })

  it('keeps games after a stop and before the last one, whatever the setting says', () => {
    expect(placements([4, 2, 2, 0, 9, 1.5], 5)).toEqual([2, 4])
    expect(placements([2, 4], 3)).toEqual([2])
    const games = buildMinigames(input({ stopCount: 3 }))
    expect(games.map((g) => g.afterStop)).toEqual([2])
    expect(buildMinigames(input({ content: { ...DEFAULT_MINIGAMES, after: [] } }))).toEqual([])
  })

  it("plays a kid's birthday as true/false then the photo, never the cipher", () => {
    const kid = {
      name: 'נועה',
      favorite_food: 'פיצה',
      favorite_game: 'מחבואים',
      dream: 'להיות וטרינרית',
      one_word: 'שובבה',
      favorite_place: 'גן השעשועים',
      catchphrase: 'עוד פעם!',
      photo_where: 'הים',
    }
    for (let i = 0; i < 12; i++) {
      const games = buildMinigames(input({ answers: kid, occasionKey: 'birthday_kid', seed: `MR-${i}` }))
      expect(games.map((g) => g.type)).toEqual(['true_false', 'photo'])
      const again = regenerateMinigame(
        input({ answers: kid, occasionKey: 'birthday_kid' }),
        games,
        1,
        `again-${i}`,
      )
      // Another try may be any allowed type except the other game's, never the cipher.
      expect(['photo', 'who_said']).toContain(again?.type)
    }
    // The kid's favourite game is one of the statements it can make.
    const tf = buildMinigames(
      input({ answers: kid, occasionKey: 'birthday_kid', content: only('true_false') }),
    )
    expect(tf[0].slots.length).toBeGreaterThanOrEqual(3)
    const all = new Set(
      Array.from(
        { length: 12 },
        (_, i) =>
          buildMinigames(
            input({ answers: kid, occasionKey: 'birthday_kid', content: only('true_false'), seed: `S${i}` }),
          )[0].slots,
      ).flat(),
    )
    expect(all).toContain('favorite_game')
    // Other occasions keep every type; a type the setting turns off stays off for kids too.
    const other = new Set(
      Array.from({ length: 12 }, (_, i) =>
        buildMinigames(input({ seed: `MR-${i}` })).map((g) => g.type),
      ).flat(),
    )
    expect(other).toContain('cipher')
    const noPhoto = { ...DEFAULT_MINIGAMES, types: ['who_said', 'true_false'] as MinigameType[] }
    expect(
      buildMinigames(input({ answers: kid, occasionKey: 'birthday_kid', content: noPhoto })).map(
        (g) => g.type,
      ),
    ).toEqual(['true_false', 'who_said'])
  })

  it('prefers answers the riddles have not shown yet', () => {
    // The riddles before the game showed the food and the place: the statements lead with the rest.
    const games = buildMinigames(
      input({
        content: only('true_false'),
        answers: { ...RICH, favorite_food: 'שקשוקה' },
        riddleSlots: [['favorite_food'], ['favorite_place']],
      }),
    )
    const slots = games[0].slots
    expect(slots.slice(0, 2).sort()).toEqual(['dream', 'one_word'])
  })

  it('uses the group and company forms with their own slots', () => {
    const group = buildMinigames(
      input({
        form: 'group',
        answers: { group_name: 'משפחת כהן', group_saying: 'מי רוצה עוד?' },
        content: only('who_said'),
      }),
    )
    expect(group[0].prompt.map((p) => p.v).join('')).toBe('איזה משפט אומרים כל הזמן אצל משפחת כהן?')
    expect(group[0].options).toContain('מי רוצה עוד?')
  })

  it('regenerates one game with another type, keeping the others', () => {
    const games = buildMinigames(input())
    const next = regenerateMinigame(input(), games, 0, 'again')
    expect(next).not.toBeNull()
    expect(next!.afterStop).toBe(games[0].afterStop)
    expect(next!.type).not.toBe(games[1].type)
    expect(next!.reward).toEqual(games[0].reward)
  })
})
