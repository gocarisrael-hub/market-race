// The one-off occasion update for databases that are never seeded (production): renames only what
// is still as it was, adds the kid's birthday and the anniversary, retires the parent's birthday.
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { occasions, questionSets, settings, themes } from '../../src/server/db/schema.ts'
import { updateOccasions } from '../../src/server/services/occasions-update.ts'
import { RECIPIENT_SETS, seedDemo } from '../../src/server/services/seed-demo.ts'
import { makeTestApp } from '../helpers/app.ts'

describe('one-off occasion update', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  const occ = async (key: string) => (await t.db.select().from(occasions).where(eq(occasions.key, key)))[0]
  beforeEach(async () => {
    t = await makeTestApp()
    await seedDemo(t.db)
    // What a database from before the change looks like.
    await t.db.update(occasions).set({ label: 'אהבה וזוגיות' }).where(eq(occasions.key, 'couple'))
    await t.db.update(occasions).set({ label: 'המשפחה שלנו' }).where(eq(occasions.key, 'family')) // the owner's
    await t.db.update(occasions).set({ active: true }).where(eq(occasions.key, 'birthday_parent'))
    await t.db.delete(occasions).where(eq(occasions.key, 'birthday_kid'))
    await t.db.delete(occasions).where(eq(occasions.key, 'anniversary'))
    for (const k of ['kidShe', 'kidHe', 'anniversaryShe'] as const)
      await t.db.delete(questionSets).where(eq(questionSets.name, RECIPIENT_SETS[k].name))
    const [p] = await t.db.select().from(settings).where(eq(settings.key, 'prices'))
    const { birthday_kid: _k, ...prices } = p.value as Record<string, unknown>
    await t.db.update(settings).set({ value: prices }).where(eq(settings.key, 'prices'))
    await t.db
      .update(themes)
      .set({ occasionKeys: ['couple'] })
      .where(eq(themes.key, 'gold'))
  })
  afterEach(() => t.close())

  it('changes nothing on a dry run', async () => {
    const log = await updateOccasions(t.db, { apply: false })
    expect(log.every((l) => l.startsWith('[dry run]'))).toBe(true)
    expect((await occ('couple')).label).toBe('אהבה וזוגיות')
    expect(await occ('birthday_kid')).toBeUndefined()
  })

  it('renames, retires and adds safely, and is idempotent', async () => {
    const log = await updateOccasions(t.db, { apply: true })
    expect((await occ('couple')).label).toBe('דייט רומנטי')
    expect((await occ('family')).label).toBe('המשפחה שלנו')
    expect(log).toContain('family: named "המשפחה שלנו" by the owner, left alone')
    expect((await occ('birthday_parent')).active).toBe(false)
    const kid = await occ('birthday_kid')
    // No price yet: added, but not offered until the owner prices it.
    expect(kid).toMatchObject({ label: 'יום הולדת לילד', active: false, decor: 'kids' })
    expect(kid.recipientLabels).toEqual({ she: 'לילדה', he: 'לילד' })
    const [kidSet] = await t.db
      .select()
      .from(questionSets)
      .where(eq(questionSets.name, RECIPIENT_SETS.kidShe.name))
    expect(kid.recipients.she).toBe(kidSet.id)
    const anniversary = await occ('anniversary')
    expect(anniversary).toMatchObject({ active: true, forms: ['she', 'he', 'couple'] })
    const [gold] = await t.db.select().from(themes).where(eq(themes.key, 'gold'))
    expect(gold.occasionKeys).toEqual(['couple', 'anniversary', 'birthday_friend'])
    const sets = (await t.db.select().from(questionSets)).length
    const again = await updateOccasions(t.db, { apply: true })
    expect(again).toEqual(
      expect.arrayContaining(['couple: already "דייט רומנטי"', 'birthday_kid: already exists, left alone']),
    )
    expect((await t.db.select().from(questionSets)).length).toBe(sets)
  })
})
