// The order as a guided build: which stages a draft goes through, their paths, what each checks,
// and where a visitor may land (src/web/site/stages.ts).
import { describe, expect, it } from 'vitest'
import type { Occasion, Question, Shop } from '../../src/web/site/api.ts'
import { chooseOccasion, type Draft, emptyDraft, withRecipient } from '../../src/web/site/logic.ts'
import {
  buildStages,
  createsOrder,
  findStage,
  gateStage,
  nameError,
  needsOrder,
  needsQuestions,
  QUESTIONS_PER_STAGE,
  questionParts,
  type Stage,
  stageError,
  stagePath,
  stopFractions,
} from '../../src/web/site/stages.ts'

const PAL = { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' }
const occ = (key: string, forms: string[], extra: Partial<Occasion> = {}): Occasion => ({
  key,
  label: key,
  audience: 'private',
  forms,
  ...extra,
})
const shop: Shop = {
  brand: '[שם המותג]',
  occasions: [occ('bachelorette', ['she']), occ('birthday', ['she', 'he', 'group'])],
  markets: [{ id: 1, name: 'שוק הכרמל' }],
  themes: [
    {
      id: 10,
      name: 'a',
      marketId: 1,
      map: null,
      palette: PAL,
      palettes: [
        { id: 1, name: 'red', palette: PAL },
        { id: 2, name: 'blue', palette: PAL },
      ],
    },
  ],
  routes: [{ id: 1, marketId: 1, name: 'r', stops: 1, tastings: [] }],
  prices: { bachelorette: { base: 0, perPerson: 9900 }, birthday: { base: 0, perPerson: 9900 } },
  minPeople: 1,
  maxPeople: 20,
  validYears: 1,
  gameDuration: '',
  allergens: [],
  diets: [],
  cardEnabled: false,
}
const q = (slot: string, required = false): Question => ({ slot, text: slot, required, maxLen: 20 })
const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, i) => q(s, i === 4))

const keys = (stages: Stage[]) => stages.map((s) => (s.key === 'questions' ? `questions${s.part}` : s.key))
const ready = (over: Partial<Draft> = {}): Draft => ({
  ...chooseOccasion(emptyDraft(), shop.occasions[1]),
  themeId: 10,
  paletteId: 1,
  honoreeName: 'מיכל',
  ...over,
})

describe('order build stages', () => {
  it('splits the questions into small even parts, one screen each', () => {
    expect(QUESTIONS_PER_STAGE).toBe(3)
    expect(questionParts(seven, false).map((p) => p.length)).toEqual([3, 2, 2])
    expect(questionParts(seven.slice(0, 4), false).map((p) => p.length)).toEqual([2, 2])
    expect(questionParts(seven.slice(0, 3), false).map((p) => p.length)).toEqual([3])
    expect(questionParts([], false)).toEqual([])
    // Answering later leaves one screen with only that choice.
    expect(questionParts(seven, true)).toEqual([[]])
  })

  it('lists the stages of a draft: who-for only when there is a choice, no notes or hints when answering later', () => {
    const parts = questionParts(seven, false)
    expect(keys(buildStages(shop, ready(), parts))).toEqual([
      'occasion',
      'for',
      'people',
      'name',
      'look',
      'questions1',
      'questions2',
      'questions3',
      'photos',
      'notes',
      'hints',
      'diet',
      'details',
      'pay',
    ])
    const bachelorette = chooseOccasion(emptyDraft(), shop.occasions[0])
    // No recipient to choose: how many come follows the occasion.
    expect(keys(buildStages(shop, bachelorette, parts)).slice(0, 3)).toEqual(['occasion', 'people', 'name'])
    const later = keys(buildStages(shop, ready({ answersLater: true }), questionParts(seven, true)))
    expect(later).toEqual([
      'occasion',
      'for',
      'people',
      'name',
      'look',
      'questions1',
      'photos',
      'diet',
      'details',
      'pay',
    ])
    // Before the questions are known they count as one part.
    expect(keys(buildStages(shop, ready(), null)).filter((k) => k.startsWith('questions'))).toEqual([
      'questions1',
    ])
  })

  it('gives every stage a path; the photos, details and pay carry the order token', () => {
    const s = (key: Stage['key'], part = 1): Stage => ({ key, part })
    expect(stagePath(s('occasion'), null)).toBe('/order')
    expect(stagePath(s('for'), null)).toBe('/order/for')
    expect(stagePath(s('questions'), null)).toBe('/order/questions')
    expect(stagePath(s('questions', 2), null)).toBe('/order/questions/2')
    expect(stagePath(s('notes'), 'tok')).toBe('/order/notes')
    expect(stagePath(s('photos'), 'tok')).toBe('/order/tok/photos')
    expect(stagePath(s('details'), 'tok')).toBe('/order/tok/details')
    expect(stagePath(s('pay'), 'tok')).toBe('/order/tok/pay')
    expect(needsQuestions('look')).toBe(true)
    expect(needsQuestions('for')).toBe(false)
  })

  it('checks each stage before moving on, with the same messages as before', () => {
    const parts = questionParts(seven, false)
    const err = (key: Stage['key'], d: Draft, part = 1) => stageError({ key, part }, d, shop, parts)
    expect(err('occasion', emptyDraft())).toBe('בחרו איזה משחק')
    expect(err('occasion', ready())).toBeNull()
    expect(err('for', { ...ready(), recipient: null, form: null })).toBe('בחרו למי המשחק')
    expect(err('name', ready({ honoreeName: ' ' }))).toMatch(/איך קוראים לה/)
    expect(err('name', ready({ honoreeName: 'א'.repeat(41) }))).toMatch(/ארוכה/)
    expect(err('look', ready({ themeId: 99 }))).toBe('בחרו איך זה ייראה')
    expect(err('look', ready({ paletteId: 99 }))).toBe('בחרו צבע')
    // Part 2 holds the required question.
    expect(err('questions', ready(), 1)).toBeNull()
    expect(err('questions', ready(), 2)).toMatch(/חובה/)
    expect(err('questions', ready({ answers: { e: 'x' } }), 2)).toBeNull()
    expect(err('questions', ready({ answersLater: true }), 2)).toBeNull()
    expect(err('hints', ready({ hintQuestions: [{ question: 'q', answer: '' }] }))).toMatch(/תשובה/)
    expect(err('people', ready({ people: 21 }))).toBeTruthy()
    expect(err('details', ready())).toBeTruthy()
    expect(
      err('details', ready({ buyer: { name: 'נועה', phone: '050-1234567', email: 'n@x.co' } })),
    ).toBeNull()
    expect(err('photos', ready())).toBeNull()
  })

  it('offers she/he next to the name only for one person, and requires the pick', () => {
    const he = withRecipient(ready(), 'he')
    expect(nameError(he, shop)).toBeNull()
    expect(nameError({ ...he, form: null }, shop)).toBe('בחרו: עליה או עליו?')
  })

  it('lands a visitor on the first stage left undone, or before the photos until the order exists', () => {
    const parts = questionParts(seven, false)
    const stages = buildStages(shop, ready(), parts)
    const at = (k: string) => keys(stages).indexOf(k)
    // A fresh draft asking for the look goes back to the occasion.
    expect(gateStage(stages, at('look'), emptyDraft(), shop, parts)).toBe(0)
    // No name yet: back to the name.
    expect(gateStage(stages, at('look'), ready({ honoreeName: '' }), shop, parts)).toBe(at('name'))
    // The required question in part 2 is unanswered: back there.
    expect(gateStage(stages, at('diet'), ready({ manageToken: 't' }), shop, parts)).toBe(at('questions2'))
    // How many come is asked before the order exists, right after who it is for.
    expect(gateStage(stages, at('people'), ready(), shop, parts)).toBe(at('people'))
    expect(gateStage(stages, at('name'), ready({ people: 99 }), shop, parts)).toBe(at('people'))
    expect(needsOrder('people')).toBe(false)
    const answered = ready({ answers: { e: 'x' } })
    // Everything answered but no order yet: the last question part, whose button creates it.
    expect(gateStage(stages, at('notes'), answered, shop, parts)).toBe(at('questions3'))
    expect(createsOrder(stages, at('questions3'))).toBe(true)
    expect(createsOrder(stages, at('questions2'))).toBe(false)
    expect(gateStage(stages, at('notes'), { ...answered, manageToken: 't' }, shop, parts)).toBe(at('notes'))
    // The summary needs the buyer's details.
    expect(gateStage(stages, at('pay'), { ...answered, manageToken: 't' }, shop, parts)).toBe(at('details'))
  })

  it('finds the asked stage, or the next one when this draft skips it', () => {
    const stages = buildStages(
      shop,
      chooseOccasion(emptyDraft(), shop.occasions[0]),
      questionParts(seven, false),
    )
    expect(findStage(stages, { key: 'people', part: 1 })).toBe(1)
    expect(findStage(stages, { key: 'name', part: 1 })).toBe(2)
    // No who-for for a bachelorette: how many come is next.
    expect(findStage(stages, { key: 'for', part: 1 })).toBe(1)
    // A question part beyond the last: the photos.
    expect(stages[findStage(stages, { key: 'questions', part: 9 })].key).toBe('photos')
  })

  it('spreads the stops evenly along the drawn route', () => {
    expect(stopFractions(1)).toEqual([0])
    expect(stopFractions(3)).toEqual([0, 0.5, 1])
  })
})
