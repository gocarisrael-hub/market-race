import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orders, riddles, routes } from '../../src/server/db/schema.ts'
import { defaultAnswers } from '../../src/server/domain/builder.ts'
import { checkAnswers, DEFAULT_ODD_RULES } from '../../src/server/domain/oddcheck.ts'
import {
  extractSlots,
  fallbackFor,
  fillTemplate,
  partsToString,
  questionTextFor,
  textFor,
} from '../../src/server/domain/template.ts'
import type { Question } from '../../src/server/domain/types.ts'
import { buildOrderGame } from '../../src/server/services/orders.ts'
import { GROUP_OCCASIONS, GROUP_TEMPLATES, seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

// Family, friends and generic games: the "group" form, named by {group_name}.
describe('group form: templates and answers', () => {
  const qs: Question[] = [
    { slot: 'group_name', text: { group: 'שם המשפחה?' }, required: true, fallback: '', maxLen: 40 },
    { slot: 'who_late', text: { group: 'מי מאחר?' }, required: false, fallback: 'מישהו', maxLen: 30 },
    {
      slot: 'one_word',
      text: { she: 'מילה עליה', couple: 'מילה עליהם' },
      required: false,
      fallback: { she: 'רכה', couple: 'רכים' },
      maxLen: 20,
    },
    { slot: 'group_legend', text: {}, required: true, fallback: 'סבא וסבתא', maxLen: 40, hidden: true },
  ]

  it('fills a group template, with fallbacks for empty slots', () => {
    const tpl = '{who_late} עוד בדרך, אבל {group_name} כבר יודעים. לכבוד {group_legend}, {one_word}.'
    const answers = defaultAnswers({ form: 'group', honoreeName: 'משפחת כהן', answers: {} })
    const r = fillTemplate(tpl, answers, qs, 'group')
    expect(partsToString(r.parts)).toBe('מישהו עוד בדרך, אבל משפחת כהן כבר יודעים. לכבוד סבא וסבתא, רכים.')
    expect(r.missing).toEqual([])
    const filled = fillTemplate(tpl, { ...answers, who_late: 'דני' }, qs, 'group')
    expect(partsToString(filled.parts)).toMatch(/^דני עוד בדרך/)
  })

  it('a group reads per-form texts in its own form, else the plural (couple)', () => {
    expect(textFor({ she: 'א', couple: 'ב', group: 'ג' }, 'group')).toBe('ג')
    expect(textFor({ she: 'א', couple: 'ב' }, 'group')).toBe('ב')
    expect(textFor({ she: 'א' }, 'group')).toBe('א')
    expect(textFor({ he: 'ה' }, 'she')).toBe('ה')
    expect(fallbackFor(qs[2], 'group')).toBe('רכים')
    expect(fallbackFor(qs[2], 'he')).toBe('רכה')
    expect(questionTextFor(qs[0], 'group')).toBe('שם המשפחה?')
    expect(questionTextFor(qs[3], 'group')).toBe('group_legend')
  })

  it('the group name is the honoree field, even over a stale answer', () => {
    const a = defaultAnswers({ form: 'group', honoreeName: 'צוות אלפא', answers: { group_name: 'ישן' } })
    expect(a).toMatchObject({ name: 'צוות אלפא', group_name: 'צוות אלפא' })
    expect(defaultAnswers({ form: 'she', honoreeName: 'מיכל', answers: {} }).group_name).toBeUndefined()
  })

  it('the odd check skips hidden questions', () => {
    const flags = checkAnswers({ group_name: 'משפחת כהן' }, qs, DEFAULT_ODD_RULES)
    expect(flags).toEqual([])
  })
})

describe('group games in the demo catalog', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())

  it('every group set defines every slot of the group templates, and the route uses each asked slot', async () => {
    const [route] = await t.db.select().from(routes).where(eq(routes.id, ids.carmelRouteId))
    const all = await t.db.select().from(riddles)
    for (const r of all) expect(r.templates.group, r.answer).toBe(GROUP_TEMPLATES[r.answer])
    const onRoute = route.stops.map((s) => all.find((r) => r.id === s.riddleId)!)
    const routeSlots = new Set(onRoute.flatMap((r) => extractSlots(r.templates.group ?? '')))
    const anySlots = new Set(Object.values(GROUP_TEMPLATES).flatMap(extractSlots))
    for (const g of GROUP_OCCASIONS) {
      const slots = new Set(g.questions.map((q) => q.slot))
      for (const s of anySlots) expect(slots.has(s), `${g.key} defines ${s}`).toBe(true)
      for (const q of g.questions.filter((x) => !x.hidden))
        expect(routeSlots.has(q.slot), `${g.key}: {${q.slot}} on the route`).toBe(true)
      for (const q of g.questions.filter((x) => x.slot !== 'group_name'))
        expect(fallbackFor(q, 'group'), `${g.key}: fallback for ${q.slot}`).not.toBe('')
    }
  })

  it('lists the group occasions on the shop and their questions without hidden ones', async () => {
    const shop = (await t.app.inject({ url: '/api/shop' })).json()
    for (const key of ['family', 'friends', 'generic']) {
      const o = shop.occasions.find((x: { key: string }) => x.key === key)
      expect(o, key).toMatchObject({ audience: 'private', forms: ['group'] })
      expect(shop.prices[key].perPerson).toBeGreaterThan(0)
    }
    const res = await t.app.inject({ url: '/api/shop/questions?occasion=family&form=group' })
    expect(res.statusCode).toBe(200)
    const slots = res.json().questions.map((q: { slot: string }) => q.slot)
    expect(slots).toEqual([
      'group_name',
      'group_food',
      'group_saying',
      'group_place',
      'family_tradition',
      'who_late',
      'group_wish',
    ])
    expect(res.json().questions[0]).toMatchObject({ text: 'שם המשפחה?', required: true })
  })

  const draft = (over: Record<string, unknown> = {}) => ({
    occasionKey: 'family',
    form: 'group',
    honoreeName: 'משפחת כהן',
    themeId: ids.carmelThemeId,
    people: 6,
    answers: { group_name: 'משפחת כהן', who_late: 'דוד שמעון', group_food: 'קובה', group_legend: 'x' },
    ...over,
  })

  it('accepts a family order with the group form, refuses other forms for it', async () => {
    const bad = await t.app.inject({ method: 'POST', url: '/api/orders', payload: draft({ form: 'she' }) })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error).toBe('bad_form')
    const res = await t.app.inject({ method: 'POST', url: '/api/orders', payload: draft() })
    expect(res.statusCode).toBe(200)
    expect(res.json().amountAgorot).toBe(6 * 9900)
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, res.json().manageToken))
    expect(o.form).toBe('group')
    // Hidden slots cannot be answered by the buyer.
    expect(o.answers).toEqual({ group_name: 'משפחת כהן', who_late: 'דוד שמעון', group_food: 'קובה' })

    const built = await buildOrderGame(t.db, o.id)
    expect(built.flags).toEqual([])
    expect(built.status).toBe('ready')
    const first = partsToString(built.game!.stops[0].riddle.parts)
    expect(first).toMatch(/^דוד שמעון עוד בדרך, אבל משפחת כהן כבר יודעים/)
    expect(first).toContain('מאז היום הראשון') // the family set's fallback for a slot it doesn't ask
    expect(built.game!.honoree).toBe('משפחת כהן')
    expect(built.game!.form).toBe('group')
  })

  it('friends and generic games build clean with no answers at all', async () => {
    for (const occasionKey of ['friends', 'generic']) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: draft({ occasionKey, honoreeName: 'צוות אלפא', answers: {} }),
      })
      expect(res.statusCode, occasionKey).toBe(200)
      const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, res.json().manageToken))
      const built = await buildOrderGame(t.db, o.id)
      expect(built.flags, occasionKey).toEqual([])
      const texts = built.game!.stops.map((s) => partsToString(s.riddle.parts))
      for (const x of texts) expect(x).not.toMatch(/[{}]/)
      expect(texts[0]).toContain('צוות אלפא')
    }
  })
})
