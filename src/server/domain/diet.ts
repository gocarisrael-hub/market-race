// Per-person allergens and diets (decided 2026-11-27). An order ticks allergens and diets and says
// how many of the group each one is for (`restrictionCounts`, keyed by the allergen or the diet).
// At each stop the regular tasting goes to everyone it fits, and a fitting alternative at the same
// stall to the others. Pure: shared by the builder, the route preview, the player and the admin.
import type { SnapshotPortion, SnapshotStop, SnapshotTasting } from './types.ts'

/** How many of the group each ticked allergen or diet is for. Missing: everyone (older orders). */
export type RestrictionCounts = Record<string, number>

export interface Restriction {
  key: string
  kind: 'allergen' | 'diet'
  count: number
}

/** People who share the same restrictions (none: the regular eaters). */
export interface DietProfile {
  allergens: string[]
  diets: string[]
  count: number
}

/**
 * The order's restrictions with their counts: each ticked allergen or diet, its count clamped to
 * 1..people. A ticked one without a count is everyone, which is how orders placed before counts
 * existed keep their behaviour (the whole group's tastings are swapped).
 */
export function restrictionsOf(order: {
  people: number
  allergens: readonly string[]
  diets: readonly string[]
  restrictionCounts?: RestrictionCounts | null
}): Restriction[] {
  const people = Math.max(1, Math.floor(order.people) || 1)
  const counts = order.restrictionCounts ?? {}
  const count = (key: string) => {
    const n = Math.floor(Number(counts[key]))
    return Number.isFinite(n) && n >= 1 ? Math.min(n, people) : people
  }
  return [
    ...[...new Set(order.allergens)].map((key) => ({ key, kind: 'allergen' as const, count: count(key) })),
    ...[...new Set(order.diets)].map((key) => ({ key, kind: 'diet' as const, count: count(key) })),
  ]
}

/** Only the counts of what is ticked, each clamped to 1..people (what an order stores). A ticked
 * one sent without a count (a page from before counts) is everyone. */
export function cleanCounts(
  people: number,
  allergens: readonly string[],
  diets: readonly string[],
  counts: RestrictionCounts | null | undefined,
): RestrictionCounts {
  const out: RestrictionCounts = {}
  for (const r of restrictionsOf({ people, allergens, diets, restrictionCounts: counts ?? {} }))
    out[r.key] = r.count
  return out
}

/**
 * Splits the group into people with the same restrictions. Each restricted person is treated as
 * someone else (the worst case): restrictions are dealt out in turn, so one person carries several
 * only when the counts force it (2 vegans and 3 nut allergies among 4 people: one person is both).
 */
export function dietProfiles(people: number, restrictions: Restriction[]): DietProfile[] {
  const n = Math.max(1, Math.floor(people) || 1)
  const persons = Array.from({ length: n }, () => ({ allergens: [] as string[], diets: [] as string[] }))
  let at = 0
  for (const r of restrictions) {
    for (let i = 0; i < Math.min(r.count, n); i++) {
      const p = persons[(at + i) % n]
      ;(r.kind === 'allergen' ? p.allergens : p.diets).push(r.key)
    }
    at = (at + r.count) % n
  }
  const byKey = new Map<string, DietProfile>()
  for (const p of persons) {
    const key = `${p.allergens.join(',')}|${p.diets.join(',')}`
    const have = byKey.get(key)
    if (have) have.count++
    else byKey.set(key, { allergens: p.allergens, diets: p.diets, count: 1 })
  }
  // The regular eaters first, then the most restricted.
  return [...byKey.values()].sort(
    (a, b) => a.allergens.length + a.diets.length - (b.allergens.length + b.diets.length),
  )
}

/** The fields a tasting needs to be checked and served. */
export interface ServableTasting {
  id: number
  stallId: number
  allergens: string[]
  diets: string[]
  active: boolean
  adultsOnly?: boolean
}

export function fits(
  t: ServableTasting,
  allergens: readonly string[],
  diets: readonly string[],
  forKids: boolean,
) {
  return (
    t.active &&
    !t.allergens.some((a) => allergens.includes(a)) &&
    diets.every((d) => t.diets.includes(d)) &&
    !(forKids && t.adultsOnly)
  )
}

export interface Portion<T> {
  tasting: T
  count: number
  /** The restrictions this tasting is served for (empty: the regular tasting). */
  for: string[]
}

/**
 * What a stall serves the group: the regular tasting (the preferred one, else the first other one
 * at the stall) to everyone it fits, and to each other profile a tasting at the stall that fits it
 * (one already served at this stop first, then the lowest id). Undefined when someone has nothing:
 * the whole group then goes to the backup stall. A kids' game never gets an adults-only tasting.
 */
export function servePortions<T extends ServableTasting>(
  tastings: T[],
  stallId: number,
  preferredId: number | null | undefined,
  profiles: DietProfile[],
  forKids = false,
): Portion<T>[] | undefined {
  const atStall = tastings.filter((t) => t.stallId === stallId).sort((a, b) => a.id - b.id)
  const preferred = atStall.find((t) => t.id === preferredId)
  const regular =
    preferred && fits(preferred, [], [], forKids) ? preferred : atStall.find((t) => fits(t, [], [], forKids))
  if (!regular) return undefined
  const out: Portion<T>[] = []
  const add = (t: T, count: number, why: string[]) => {
    const have = out.find((p) => p.tasting.id === t.id)
    if (have) {
      have.count += count
      for (const w of why) if (!have.for.includes(w)) have.for.push(w)
    } else out.push({ tasting: t, count, for: [...why] })
  }
  for (const p of profiles) {
    if (p.count <= 0) continue
    if (fits(regular, p.allergens, p.diets, forKids)) {
      add(regular, p.count, [])
      continue
    }
    const fitting = (t: T) => fits(t, p.allergens, p.diets, forKids)
    const alt = out.map((x) => x.tasting).find(fitting) ?? atStall.find(fitting)
    if (!alt) return undefined
    add(alt, p.count, [...p.allergens, ...p.diets])
  }
  // The regular tasting first, then the alternatives.
  return out.sort((a, b) => (a.tasting.id === regular.id ? -1 : b.tasting.id === regular.id ? 1 : 0))
}

/**
 * The portions a stall serves the players who arrived (the captain's count, at most the people
 * bought). Restricted people are assumed to have come: the regular portions shrink first.
 */
export function portionsForPlayers<T extends { count: number; for?: string[] }>(
  portions: T[],
  players: number,
): T[] {
  const total = portions.reduce((n, p) => n + p.count, 0)
  let extra = Math.max(0, total - Math.max(0, players))
  if (!extra) return portions.map((p) => ({ ...p }))
  const order = portions
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.for?.length ?? 0) - (b.p.for?.length ?? 0) || a.i - b.i)
  const counts = portions.map((p) => p.count)
  for (const { i } of order) {
    const cut = Math.min(counts[i], extra)
    counts[i] -= cut
    extra -= cut
    if (!extra) break
  }
  return portions.map((p, i) => ({ ...p, count: counts[i] })).filter((p) => p.count > 0)
}

/**
 * A built stop's portions where it is served (the backup stall when the group was sent there).
 * Games built before per-person diets have one tasting for the whole group.
 */
export function stopPortions(
  stop: Pick<SnapshotStop, 'tasting' | 'portions' | 'backup'>,
  people: number,
  usingBackup = false,
): SnapshotPortion[] {
  if (usingBackup && stop.backup)
    return stop.backup.portions?.length
      ? stop.backup.portions
      : [{ tasting: stop.backup.tasting, count: people, for: [] }]
  return stop.portions?.length ? stop.portions : [{ tasting: stop.tasting, count: people, for: [] }]
}

/** "3 × בוריק, 1 × בוריק טבעוני" (one tasting: just its count and name is the caller's choice). */
export function portionsLine(portions: { count: number; tasting: Pick<SnapshotTasting, 'name'> }[]): string {
  return portions.map((p) => `${p.count} × ${p.tasting.name}`).join(', ')
}
