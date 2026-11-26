// Recipient-first: occasion × recipient picks the question set and the form (grammar).
import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { occasions, orders, questionSets } from '../../src/server/db/schema.ts'
import {
  defaultRecipient,
  formsOfRecipients,
  occasionRecipients,
  orderRecipient,
  questionSetIdFor,
  resolveRecipient,
} from '../../src/server/domain/recipient.ts'
import { partsToString } from '../../src/server/domain/template.ts'
import { buildOrderGame, questionsForOrder } from '../../src/server/services/orders.ts'
import { playersVoice } from '../../src/server/services/play.ts'
import { ensureRecipientSets, RECIPIENT_SETS, seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp, ownerCookie } from '../helpers/app.ts'

describe('occasion × recipient (pure)', () => {
  const love = {
    audience: 'private' as const,
    forms: [],
    questionSetId: 1,
    recipients: { couple: 30, he: 20, she: 10 },
  }

  it('lists recipients one person first, each with its form and set', () => {
    expect(occasionRecipients(love)).toEqual([
      { recipient: 'she', form: 'she', questionSetId: 10 },
      { recipient: 'he', form: 'he', questionSetId: 20 },
      { recipient: 'couple', form: 'couple', questionSetId: 30 },
    ])
    expect(defaultRecipient(love)).toBe('she')
    expect(resolveRecipient(love, 'group')).toBeNull()
    expect(resolveRecipient(love, null)).toBeNull()
  })

  it('a null set means the occasion default; an unoffered recipient falls back to it', () => {
    const o = { ...love, recipients: { she: null, family: 7 } }
    expect(questionSetIdFor(o, 'she')).toBe(1)
    expect(questionSetIdFor(o, 'family')).toBe(7)
    expect(questionSetIdFor(o, 'he')).toBe(1)
    expect(resolveRecipient(o, 'family')?.form).toBe('group')
    expect(formsOfRecipients({ family: 7, group: null, she: null })).toEqual(['she', 'group'])
  })

  it('an occasion saved before recipients derives them from its forms', () => {
    const old = { audience: 'private' as const, forms: ['he', 'she'] as ('he' | 'she')[], questionSetId: 4 }
    expect(occasionRecipients({ ...old, recipients: {} }).map((c) => c.recipient)).toEqual(['she', 'he'])
    const fam = { audience: 'private' as const, forms: ['group' as const], questionSetId: 5, decor: 'family' }
    expect(occasionRecipients(fam)).toEqual([{ recipient: 'family', form: 'group', questionSetId: 5 }])
    expect(occasionRecipients({ ...fam, audience: 'company' })).toEqual([])
  })

  it('maps old orders (form only) to a recipient', () => {
    expect(orderRecipient({ form: 'he' })).toBe('he')
    expect(orderRecipient({ form: 'group' }, { decor: 'family' })).toBe('family')
    expect(orderRecipient({ form: 'group' }, { decor: 'friends' })).toBe('group')
    expect(orderRecipient({ form: 'company', kind: 'company' })).toBeNull()
    expect(orderRecipient({ form: 'she', recipient: 'she' })).toBe('she')
  })

  it('addresses the players in the feminine plural only when the occasion says so', () => {
    expect(playersVoice({ form: 'she', playersFeminine: true })).toBe('she')
    expect(playersVoice({ form: 'she', playersFeminine: false })).toBe('group')
    expect(playersVoice({ form: 'he', playersFeminine: false })).toBe('he')
    // Games built before the flag keep what they showed.
    expect(playersVoice({ form: 'she' })).toBe('she')
  })
})

describe('recipient-first in the demo catalog', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  let ids: Awaited<ReturnType<typeof seedDemo>>
  beforeAll(async () => {
    t = await makeTestApp()
    ids = await seedDemo(t.db)
  })
  afterAll(() => t.close())

  const questions = async (occasion: string, recipient: string) => {
    const res = await t.app.inject({ url: `/api/shop/questions?occasion=${occasion}&recipient=${recipient}` })
    expect(res.statusCode).toBe(200)
    return res.json().questions as { slot: string; text: string }[]
  }

  it('offers who the game is for on the shop, one person first', async () => {
    const shop = (await t.app.inject({ url: '/api/shop' })).json()
    const r = (key: string) => shop.occasions.find((o: { key: string }) => o.key === key).recipients
    expect(r('birthday_friend')).toEqual(['she', 'he', 'group'])
    expect(r('birthday_parent')).toEqual(['she', 'he'])
    expect(r('couple')).toEqual(['she', 'he', 'couple'])
    expect(r('bachelorette')).toEqual(['she'])
    expect(r('family')).toEqual(['family'])
    expect(r('team_day')).toEqual([])
    // No question set ids leak.
    expect(JSON.stringify(shop.occasions)).not.toContain('questionSetId')
  })

  it('asks questions that match occasion × recipient', async () => {
    const bdShe = await questions('birthday_friend', 'she')
    expect(bdShe.map((q) => q.text)).toContain(RECIPIENT_SETS.birthdayShe.questions[1].text.she)
    expect(bdShe.every((q) => !/ביניכם|שלו\b/.test(q.text))).toBe(true)
    const bdHe = await questions('birthday_friend', 'he')
    expect(bdHe[1].text).toBe('מה הוא היה אוכל כל יום, אם רק היה אפשר?')
    const loveHe = await questions('couple', 'he')
    expect(loveHe[0].text).toMatch(/ביניכם/) // the giver's side
    expect(loveHe[1].text).toMatch(/הוא מזמין/)
    const couple = await questions('couple', 'couple')
    expect(couple[0].text).toMatch(/אצלם/) // the two of them
    const group = await questions('birthday_friend', 'group')
    expect(group.map((q) => q.slot)).toContain('who_late') // "who is the most…"
    const family = await questions('generic', 'family')
    expect(family[0].text).toBe('שם המשפחה?')
    // Older pages asked by form.
    const byForm = await t.app.inject({ url: '/api/shop/questions?occasion=couple&form=he' })
    expect(byForm.json().questions[0].text).toBe(loveHe[0].text)
    const bad = await t.app.inject({ url: '/api/shop/questions?occasion=couple' })
    expect(bad.statusCode).toBe(400)
  })

  const order = (over: Record<string, unknown>) => ({
    occasionKey: 'couple',
    recipient: 'he',
    honoreeName: 'יואב',
    themeId: ids.carmelThemeId,
    people: 2,
    answers: {},
    ...over,
  })

  it('a love game for him: stored recipient and form, he grammar, mixed players', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: order({ answers: { first_love: 'הדייט הראשון ביפו', favorite_food: 'שקשוקה' } }),
    })
    expect(res.statusCode).toBe(200)
    const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, res.json().manageToken))
    expect(o).toMatchObject({ recipient: 'he', form: 'he' })
    const built = await buildOrderGame(t.db, o.id)
    expect(built.flags).toEqual([])
    const first = partsToString(built.game!.stops[0].riddle.parts)
    expect(first).toBe(
      'מאז הדייט הראשון ביפו, יואב יודע שאסור לוותר עליה. היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?',
    )
    expect(built.game).toMatchObject({ form: 'he', recipient: 'he', playersFeminine: false })
    const manage = (await t.app.inject({ url: `/api/manage/${o.manageToken}` })).json()
    expect(manage.recipient).toBe('he')
  })

  it('refuses a recipient the occasion does not offer', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: order({ occasionKey: 'birthday_parent', recipient: 'couple' }),
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('bad_form')
  })

  it('a birthday for her builds in her grammar; a bachelorette addresses women players', async () => {
    const make = async (occasionKey: string) => {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: order({ occasionKey, recipient: 'she', honoreeName: 'מיכל' }),
      })
      const [o] = await t.db.select().from(orders).where(eq(orders.manageToken, res.json().manageToken))
      return buildOrderGame(t.db, o.id)
    }
    const bd = await make('birthday_friend')
    expect(bd.flags).toEqual([])
    expect(partsToString(bd.game!.stops[0].riddle.parts)).toContain('מיכל יודעת')
    expect(playersVoice(bd.game!)).toBe('group')
    const bach = await make('bachelorette')
    expect(playersVoice(bach.game!)).toBe('she')
  })

  it('an order placed before recipients (form only) keeps its questions', async () => {
    const [o] = await t.db
      .insert(orders)
      .values({
        orderNo: 'MR-OLD001',
        kind: 'private',
        status: 'awaiting_answers',
        occasionKey: 'family',
        form: 'group',
        honoreeName: 'משפחת כהן',
        gameToken: 'old-game-token-0001',
        manageToken: 'old-manage-token-0001',
      })
      .returning()
    expect(o.recipient).toBeNull()
    const qs = await questionsForOrder(t.db, o)
    expect(qs[0].slot).toBe('group_name')
    expect(qs.find((q) => q.slot === 'family_tradition')?.hidden).toBeFalsy()
    const manage = (await t.app.inject({ url: `/api/manage/${o.manageToken}` })).json()
    expect(manage.recipient).toBe('family')
  })

  it('the admin edits who an occasion is for, and its forms follow', async () => {
    const cookie = await ownerCookie(t.app)
    const [occ] = await t.db.select().from(occasions).where(eq(occasions.key, 'birthday_parent'))
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/admin/api/catalog/occasions/${occ.id}`,
      headers: { cookie },
      payload: { recipients: { he: null, family: null } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ forms: ['he', 'group'], recipients: { he: null, family: null } })
    const none = await t.app.inject({
      method: 'PATCH',
      url: `/admin/api/catalog/occasions/${occ.id}`,
      headers: { cookie },
      payload: { recipients: {} },
    })
    expect(none.statusCode).toBe(400)
  })

  it('the migration maps old occasions and orders to recipients', async () => {
    const t3 = await makeTestApp()
    try {
      await seedDemo(t3.db)
      const [fam] = await t3.db.select().from(occasions).where(eq(occasions.key, 'family'))
      await t3.db.insert(occasions).values([
        {
          key: 'old_bd',
          label: 'x',
          audience: 'private',
          forms: ['she', 'he'],
          questionSetId: fam.questionSetId,
        },
        { key: 'old_bach', label: 'x', audience: 'private', forms: ['she'], questionSetId: null },
        { key: 'old_fam', label: 'x', audience: 'private', forms: ['group'], decor: 'family' },
      ])
      const base = { kind: 'private' as const, status: 'awaiting_answers' as const }
      await t3.db.insert(orders).values([
        {
          ...base,
          orderNo: 'MR-M1',
          occasionKey: 'old_fam',
          form: 'group',
          gameToken: 'gt-mig-000001',
          manageToken: 'mt-mig-000001',
        },
        {
          ...base,
          orderNo: 'MR-M2',
          occasionKey: 'old_bd',
          form: 'he',
          gameToken: 'gt-mig-000002',
          manageToken: 'mt-mig-000002',
        },
        {
          kind: 'company',
          status: 'quoted',
          orderNo: 'MR-M3',
          occasionKey: 'team_day',
          form: 'company',
          gameToken: 'gt-mig-000003',
          manageToken: 'mt-mig-000003',
        },
      ])
      const file = readFileSync(new URL('../../drizzle/0010_recipients.sql', import.meta.url), 'utf8')
      for (const stmt of file.split('--> statement-breakpoint').filter((x) => x.includes('UPDATE')))
        await t3.db.execute(sql.raw(stmt))
      const occ = Object.fromEntries((await t3.db.select().from(occasions)).map((o) => [o.key, o]))
      expect(occ.old_bd.recipients).toEqual({ she: fam.questionSetId, he: fam.questionSetId })
      expect(occ.old_bach).toMatchObject({ recipients: { she: null }, playersFeminine: true })
      expect(occ.old_fam.recipients).toEqual({ family: null })
      expect(occ.team_day.recipients).toEqual({})
      const ord = Object.fromEntries((await t3.db.select().from(orders)).map((o) => [o.orderNo, o.recipient]))
      expect(ord).toMatchObject({ 'MR-M1': 'family', 'MR-M2': 'he', 'MR-M3': null })
    } finally {
      await t3.close()
    }
  })

  it('tops up a database seeded before recipients, leaving owner changes alone', async () => {
    const t2 = await makeTestApp()
    try {
      await seedDemo(t2.db)
      // Back to what the migration leaves: recipients from the old forms, on the occasion's own set.
      const rows = await t2.db.select().from(occasions)
      for (const o of rows)
        if (o.audience === 'private') {
          const rec = Object.fromEntries(
            occasionRecipients({ ...o, recipients: {} }).map((c) => [c.recipient, o.questionSetId]),
          )
          await t2.db.update(occasions).set({ recipients: rec }).where(eq(occasions.id, o.id))
        }
      const [fam] = rows.filter((o) => o.key === 'family')
      await t2.db
        .update(occasions)
        .set({ recipients: { family: fam.questionSetId, group: fam.questionSetId } })
        .where(eq(occasions.id, fam.id))
      const before = (await t2.db.select().from(questionSets)).length
      expect(await ensureRecipientSets(t2.db)).toBe(4) // not family (owner changed), bachelorette and friends (same)
      expect((await t2.db.select().from(questionSets)).length).toBe(before)
      const [love] = await t2.db.select().from(occasions).where(eq(occasions.key, 'couple'))
      expect(Object.keys(love.recipients).sort()).toEqual(['couple', 'he', 'she'])
      const [famAfter] = await t2.db.select().from(occasions).where(eq(occasions.key, 'family'))
      expect(Object.keys(famAfter.recipients).sort()).toEqual(['family', 'group'])
      expect(await ensureRecipientSets(t2.db)).toBe(0)
    } finally {
      await t2.close()
    }
  })
})
