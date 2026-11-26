// One-off, safe update of the occasions on a database that is never seeded (production), for the
// owner's occasion changes of 2026-11-26: clearer names, a kid's birthday and a wedding anniversary,
// and the parent's birthday folded into the birthday. Seeded databases get all of this from the
// demo refresh instead. Only touches what is still as it was: a renamed or edited row is reported
// and left alone, nothing is deleted, and a new occasion without a price is added inactive.
// Run through scripts/occasions-2026-11.ts (a dry run unless --apply).
import { eq } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { occasions, questionSets, settings, themes } from '../db/schema.ts'
import { formsOfRecipients } from '../domain/recipient.ts'
import type { OccasionRecipients } from '../domain/types.ts'
import { DEMO_OCCASIONS, RECIPIENT_SETS } from './seed-demo.ts'

/** Labels the update renames, only from exactly these. */
const RENAMES: { key: string; from: string; to: string }[] = [
  { key: 'couple', from: 'אהבה וזוגיות', to: 'דייט רומנטי' },
  { key: 'family', from: 'משפחתי', to: 'יום משפחתי' },
]

/** The new occasions, with the sets (by RECIPIENT_SETS key) each recipient gets. */
const NEW_OCCASIONS: {
  key: string
  sets: Partial<Record<keyof OccasionRecipients, keyof typeof RECIPIENT_SETS>>
}[] = [
  { key: 'birthday_kid', sets: { she: 'kidShe', he: 'kidHe' } },
  {
    key: 'anniversary',
    sets: { she: 'anniversaryShe', he: 'anniversaryHe', couple: 'anniversaryCouple' },
  },
]

/** Styles (by key) that also take these occasions, when they list occasions at all. */
const THEME_OCCASIONS: Record<string, string[]> = {
  gold: ['anniversary', 'birthday_friend'],
  cobalt: ['birthday_friend', 'birthday_kid', 'anniversary'],
  riso: ['birthday_kid'],
}

export async function updateOccasions(db: DB, opts: { apply: boolean }): Promise<string[]> {
  const log: string[] = []
  const say = (line: string) => log.push(`${opts.apply ? '' : '[dry run] '}${line}`)
  const all = await db.select().from(occasions)
  const byKey = new Map(all.map((o) => [o.key, o]))

  for (const r of RENAMES) {
    const o = byKey.get(r.key)
    if (!o) say(`${r.key}: not found, skipped`)
    else if (o.label === r.to) say(`${r.key}: already "${r.to}"`)
    else if (o.label !== r.from) say(`${r.key}: named "${o.label}" by the owner, left alone`)
    else {
      say(`${r.key}: "${r.from}" -> "${r.to}"`)
      if (opts.apply) await db.update(occasions).set({ label: r.to }).where(eq(occasions.id, o.id))
    }
  }

  const parent = byKey.get('birthday_parent')
  if (parent?.active) {
    say('birthday_parent: deactivated (its orders keep working; "יום הולדת" offers her and him)')
    if (opts.apply) await db.update(occasions).set({ active: false }).where(eq(occasions.id, parent.id))
    const bd = byKey.get('birthday_friend')
    const offered = Object.keys(bd?.recipients ?? {})
    if (bd && offered.length && !(offered.includes('she') && offered.includes('he')))
      say('birthday_friend: does not offer both her and him. Check its recipients in the admin.')
  }

  // New occasions: their question sets (by name, added when missing) and the occasion itself.
  const [pricesRow] = await db.select().from(settings).where(eq(settings.key, 'prices'))
  const prices = (pricesRow?.value ?? {}) as Record<string, unknown>
  let sort = Math.max(0, ...all.map((o) => o.sort))
  for (const n of NEW_OCCASIONS) {
    if (byKey.has(n.key)) {
      say(`${n.key}: already exists, left alone`)
      continue
    }
    const def = DEMO_OCCASIONS.find((d) => d.key === n.key)!
    const recipients: OccasionRecipients = {}
    for (const [recipient, setKey] of Object.entries(n.sets) as [
      keyof OccasionRecipients,
      keyof typeof RECIPIENT_SETS,
    ][]) {
      const set = RECIPIENT_SETS[setKey]
      const [have] = await db.select().from(questionSets).where(eq(questionSets.name, set.name))
      if (have) recipients[recipient] = have.id
      else {
        say(`question set "${set.name}": added`)
        recipients[recipient] = opts.apply
          ? (
              await db
                .insert(questionSets)
                .values({ name: set.name, questions: [...set.questions] })
                .returning()
            )[0].id
          : -1
      }
    }
    const priced = n.key in prices
    say(
      `${n.key}: added as "${def.label}"${priced ? '' : ', inactive until it has a price (admin: settings, prices), then switch it on'}`,
    )
    if (opts.apply)
      await db.insert(occasions).values({
        key: n.key,
        label: def.label,
        audience: 'private',
        decor: def.decor,
        questionSetId: Object.values(recipients)[0] ?? null,
        recipients,
        forms: formsOfRecipients(recipients),
        recipientLabels: { ...def.recipientLabels },
        playersFeminine: false,
        sort: ++sort,
        active: priced,
      })
  }

  // Styles: offer the new occasions on the ones meant for them (by key; the owner's own are untouched).
  for (const t of await db.select().from(themes)) {
    const add = t.key ? THEME_OCCASIONS[t.key] : undefined
    if (!add || !t.occasionKeys.length) continue
    const missing = add.filter((k) => !t.occasionKeys.includes(k))
    if (!missing.length) continue
    say(`style "${t.name}": now also offered for ${missing.join(', ')}`)
    if (opts.apply)
      await db
        .update(themes)
        .set({ occasionKeys: [...t.occasionKeys, ...missing] })
        .where(eq(themes.id, t.id))
  }
  return log
}
