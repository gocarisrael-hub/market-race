// Business settings live in the `settings` table. Defaults here only fill keys the owner never set.
import { eq } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { settings } from '../db/schema.ts'
import { DEFAULT_ODD_RULES, type OddRules } from '../domain/oddcheck.ts'

export interface SettingsShape {
  odd_rules: OddRules
  // Price per occasion key, in agorot: { base, perPerson }. Open decision: owner sets them.
  prices: Record<string, { base: number; perPerson: number }>
  min_people: number
  max_people: number
  valid_years: number
  hint_after_seconds: number
  poll_seconds: number
}

export const SETTING_DEFAULTS: SettingsShape = {
  odd_rules: DEFAULT_ODD_RULES,
  prices: {},
  min_people: 2,
  max_people: 20,
  valid_years: 1,
  hint_after_seconds: 0,
  poll_seconds: 4,
}

export async function getSetting<K extends keyof SettingsShape>(db: DB, key: K): Promise<SettingsShape[K]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key))
  return (row?.value as SettingsShape[K] | undefined) ?? SETTING_DEFAULTS[key]
}

export async function setSetting<K extends keyof SettingsShape>(db: DB, key: K, value: SettingsShape[K]) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
}
