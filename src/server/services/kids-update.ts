// Safe update for kids' games (2026-11-26): the kid's birthday is a kids' occasion, the demo
// route's alcohol is adults-only, and the stall that pours it gets a drink for kids. Used by the
// demo refresh and, on production (never seeded), by scripts/kids-juice-2026-11.ts (a dry run
// unless --apply). Only touches rows still as they were: nothing is deleted or renamed, a flag the
// owner already set is left alone, and the drink is added only where the stall has none by that name.
import { eq, inArray } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { occasions, stalls, tastings } from '../db/schema.ts'
import { ADULTS_ONLY_TASTINGS, DEMO_OCCASIONS, KIDS_DRINK } from './seed-demo.ts'

/** Words that suggest alcohol: such a tasting not on the list is reported for the owner to check. */
const ALCOHOL_WORDS = ['בירה', 'יין', 'סיידר', 'ערק', 'וודקה', 'ויסקי', 'אלכוהול', "צ'ייסר", 'קוקטייל']

export async function updateKidsTastings(db: DB, opts: { apply: boolean }): Promise<string[]> {
  const log: string[] = []
  const say = (line: string) => log.push(`${opts.apply ? '' : '[dry run] '}${line}`)

  // Occasions the demo marks for kids (by key).
  const kidsKeys = DEMO_OCCASIONS.filter((o) => o.forKids).map((o) => o.key)
  const occ = kidsKeys.length ? await db.select().from(occasions).where(inArray(occasions.key, kidsKeys)) : []
  for (const key of kidsKeys) {
    const o = occ.find((x) => x.key === key)
    if (!o) say(`occasion ${key}: not found, skipped`)
    else if (o.forKids) say(`occasion ${key}: already for kids`)
    else {
      say(`occasion ${key}: marked for kids (adults-only tastings are swapped)`)
      if (opts.apply) await db.update(occasions).set({ forKids: true }).where(eq(occasions.id, o.id))
    }
  }

  // Alcohol on the list: adults-only. The stalls that pour it get the kids' drink.
  const all = await db.select().from(tastings)
  const listed = all.filter((t) => ADULTS_ONLY_TASTINGS.includes(t.name))
  const stallIds = [...new Set(listed.map((t) => t.stallId))]
  const stallRows = stallIds.length ? await db.select().from(stalls).where(inArray(stalls.id, stallIds)) : []
  const stallName = (id: number) => stallRows.find((s) => s.id === id)?.name ?? `#${id}`
  for (const t of listed) {
    if (t.adultsOnly) say(`tasting "${t.name}" (${stallName(t.stallId)}): already adults-only`)
    else {
      say(`tasting "${t.name}" (${stallName(t.stallId)}): marked adults-only`)
      if (opts.apply) await db.update(tastings).set({ adultsOnly: true }).where(eq(tastings.id, t.id))
    }
  }
  for (const stallId of stallIds) {
    const have = all.find((t) => t.stallId === stallId && t.name === KIDS_DRINK.name)
    if (have) {
      say(
        `stall "${stallName(stallId)}": already has "${KIDS_DRINK.name}"${have.active ? '' : ' (inactive)'}`,
      )
      continue
    }
    // The stall is paid what it gets for the drink it replaces (the owner can change it).
    const fee = listed.find((t) => t.stallId === stallId)?.feeAgorot ?? 0
    say(`stall "${stallName(stallId)}": added "${KIDS_DRINK.name}" for kids (${fee / 100} ₪ a portion)`)
    if (opts.apply)
      await db.insert(tastings).values({
        stallId,
        name: KIDS_DRINK.name,
        teaser: KIDS_DRINK.teaser,
        teaserIcon: KIDS_DRINK.teaserIcon,
        allergens: [...KIDS_DRINK.allergens],
        diets: [...KIDS_DRINK.diets],
        feeAgorot: fee,
        adultsOnly: false,
        active: true,
      })
  }
  if (!listed.length) say(`no tasting named ${ADULTS_ONLY_TASTINGS.map((n) => `"${n}"`).join(' or ')}`)

  // Anything else that sounds like alcohol: the owner decides in the admin.
  for (const t of all)
    if (
      !t.adultsOnly &&
      !ADULTS_ONLY_TASTINGS.includes(t.name) &&
      ALCOHOL_WORDS.some((w) => t.name.includes(w))
    )
      say(`tasting "${t.name}" (#${t.id}): sounds like alcohol. Check "למבוגרים בלבד" in the admin.`)
  return log
}
