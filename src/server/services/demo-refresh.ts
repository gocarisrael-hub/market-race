// Versioned refresh of the demo content on a database seeded earlier (staging, local dev, e2e).
// Runs at boot only with SEED_DEMO or E2E_SEED outside production (see index.ts): never in
// production. When the stored `demo_seed_version` is below DEMO_SEED_VERSION it upserts the demo
// riddles, question sets, occasion recipients and the `minigames` setting by their stable demo
// keys, then rebuilds the games that have not started so they pick the new content up.
//
// Rows the admin edited after the last refresh are left alone: every catalog row has an
// `updated_at`, and the refresh records when it ran (`demo_seed_at`). A database refreshed for the
// first time has no record, so its demo-keyed rows are overwritten (only those).
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import {
  gameStates,
  markets,
  occasions,
  orders,
  paySessions,
  questionSets,
  riddles,
  settings,
  stalls,
} from '../db/schema.ts'
import { DEFAULT_MINIGAMES } from '../domain/minigames.ts'
import { formsOfRecipients } from '../domain/recipient.ts'
import type { Question } from '../domain/types.ts'
import { BuildError, buildOrderGame } from './orders.ts'
import {
  DEMO_MARKET,
  DEMO_RIDDLE_ROWS,
  demoQuestionSets,
  demoRecipients,
  demoRiddleValues,
} from './seed-demo.ts'

/** Demo seeding and its refresh run only when asked (SEED_DEMO or E2E_SEED) and never in production. */
export function demoSeedingEnabled(env: Record<string, string | undefined>, appEnv: string): boolean {
  return (env.SEED_DEMO === '1' || env.E2E_SEED === '1') && appEnv !== 'production'
}

/** Bump when the demo content changes, so seeded databases pick it up at their next boot. */
export const DEMO_SEED_VERSION = 1

export interface RefreshReport {
  ran: boolean
  from: number
  riddles: { updated: number; inserted: number; kept: number }
  questionSets: { updated: number; inserted: number; kept: number }
  occasions: { updated: number; kept: number }
  minigames: 'written' | 'kept'
  rebuilt: string[]
  rebuildFailed: string[]
  /** Not started, but not a demo game (neither a test game nor paid through the mock): untouched. */
  skippedNotDemo: string[]
  /** Why the whole refresh was skipped (real payments in the database), if it was. */
  refused?: string
}

/** The note the admin's test-game route puts on its orders. */
export const TEST_GAME_NOTE = 'test game'

/** Orders with a paid pay window of the mock provider. */
async function mockPaidOrderIds(db: DB): Promise<Set<number>> {
  const rows = await db
    .select({ orderId: paySessions.orderId })
    .from(paySessions)
    .where(and(eq(paySessions.provider, 'mock'), eq(paySessions.status, 'paid')))
  return new Set(rows.map((r) => r.orderId))
}

/** A demo game: an admin test game, or an order paid through the mock provider. */
export const isDemoOrder = (o: { id: number; notes: string }, mockPaid: Set<number>) =>
  o.notes === TEST_GAME_NOTE || mockPaid.has(o.id)

/**
 * Orders paid for real: a paid window of a real provider, or marked paid with no paid mock window
 * and not a test game (unknown counts as real). Their order numbers.
 */
export async function realPaidOrders(db: DB): Promise<string[]> {
  const realWindows = await db
    .select({ orderId: paySessions.orderId })
    .from(paySessions)
    .where(and(ne(paySessions.provider, 'mock'), eq(paySessions.status, 'paid')))
  const realIds = new Set(realWindows.map((r) => r.orderId))
  const mockPaid = await mockPaidOrderIds(db)
  const paid = await db
    .select({ id: orders.id, orderNo: orders.orderNo, notes: orders.notes })
    .from(orders)
    .where(isNotNull(orders.paidAt))
  const out = new Set<string>()
  for (const o of paid) if (realIds.has(o.id) || !isDemoOrder(o, mockPaid)) out.add(o.orderNo)
  // A real paid window on an order not marked paid still counts.
  if (realIds.size) {
    const rows = await db
      .select({ orderNo: orders.orderNo })
      .from(orders)
      .where(inArray(orders.id, [...realIds]))
    for (const r of rows) out.add(r.orderNo)
  }
  return [...out]
}

async function storedVersion(db: DB): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'demo_seed_version'))
  return typeof row?.value === 'number' ? row.value : 0
}

async function seededAt(db: DB): Promise<Date | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'demo_seed_at'))
  return typeof row?.value === 'string' ? new Date(row.value) : null
}

/** Marks a freshly seeded database as up to date (nothing to refresh). */
export async function markDemoSeeded(db: DB, at = new Date()) {
  await db
    .insert(settings)
    .values({ key: 'demo_seed_version', value: DEMO_SEED_VERSION })
    .onConflictDoUpdate({ target: settings.key, set: { value: DEMO_SEED_VERSION, updatedAt: at } })
  await db
    .insert(settings)
    .values({ key: 'demo_seed_at', value: at.toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value: at.toISOString(), updatedAt: at } })
}

export async function refreshDemoContent(db: DB, now = new Date()): Promise<RefreshReport> {
  const from = await storedVersion(db)
  const report: RefreshReport = {
    ran: false,
    from,
    riddles: { updated: 0, inserted: 0, kept: 0 },
    questionSets: { updated: 0, inserted: 0, kept: 0 },
    occasions: { updated: 0, kept: 0 },
    minigames: 'kept',
    rebuilt: [],
    rebuildFailed: [],
    skippedNotDemo: [],
  }
  if (from >= DEMO_SEED_VERSION) return report
  // A database with real payments is not a demo database, whatever the environment says.
  const real = await realPaidOrders(db)
  if (real.length) {
    report.refused = `orders paid through a real payment provider: ${real.slice(0, 5).join(', ')}${real.length > 5 ? ', …' : ''}`
    console.warn(`[demo] refresh refused: ${report.refused}`)
    return report
  }
  const [market] = await db.select().from(markets).where(eq(markets.name, DEMO_MARKET))
  if (!market) return report
  report.ran = true
  const since = await seededAt(db)
  // Changed after the last refresh: the admin's, keep it. Unknown (first refresh): overwrite.
  const edited = (row: { updatedAt: Date }) => since != null && row.updatedAt.getTime() > since.getTime()

  // Riddles, keyed by the demo market's stall name and the answer.
  const marketStalls = await db.select().from(stalls).where(eq(stalls.marketId, market.id))
  const stallByName = new Map(marketStalls.map((s) => [s.name, s]))
  const stallIds = marketStalls.map((s) => s.id)
  const existing = stallIds.length
    ? await db.select().from(riddles).where(inArray(riddles.stallId, stallIds))
    : []
  for (const d of DEMO_RIDDLE_ROWS) {
    const stall = stallByName.get(d.stall)
    if (!stall) continue
    const row = existing.find((r) => r.stallId === stall.id && r.answer === d.answer)
    if (row && edited(row)) {
      report.riddles.kept++
      continue
    }
    const values = { ...demoRiddleValues(d), updatedAt: now }
    if (row) {
      await db.update(riddles).set(values).where(eq(riddles.id, row.id))
      report.riddles.updated++
    } else {
      await db.insert(riddles).values({ ...values, stallId: stall.id })
      report.riddles.inserted++
    }
  }

  // Question sets, keyed by name.
  const sets = await db.select().from(questionSets)
  const setIds: Record<string, number> = {}
  for (const [key, def] of Object.entries(demoQuestionSets())) {
    const row = sets.find((q) => q.name === def.name)
    if (row && edited(row)) {
      report.questionSets.kept++
      setIds[key] = row.id
      continue
    }
    const questions = def.questions.map((q) => ({ ...q })) as Question[]
    if (row) {
      await db.update(questionSets).set({ questions, updatedAt: now }).where(eq(questionSets.id, row.id))
      report.questionSets.updated++
      setIds[key] = row.id
    } else {
      const [ins] = await db
        .insert(questionSets)
        .values({ name: def.name, questions, updatedAt: now })
        .returning()
      report.questionSets.inserted++
      setIds[key] = ins.id
    }
  }

  // Occasion recipients, keyed by the occasion's key (the demo occasions only; none is created).
  const recipients = demoRecipients(setIds as Parameters<typeof demoRecipients>[0])
  const occs = await db
    .select()
    .from(occasions)
    .where(inArray(occasions.key, Object.keys(recipients)))
  for (const o of occs) {
    if (o.audience !== 'private') continue
    if (edited(o)) {
      report.occasions.kept++
      continue
    }
    const want = recipients[o.key]
    await db
      .update(occasions)
      .set({
        recipients: want,
        forms: formsOfRecipients(want),
        playersFeminine: o.key === 'bachelorette',
        updatedAt: now,
      })
      .where(eq(occasions.id, o.id))
    report.occasions.updated++
  }

  // The mini-game setting.
  const [mg] = await db.select().from(settings).where(eq(settings.key, 'minigames'))
  if (!mg || !edited(mg)) {
    await db
      .insert(settings)
      .values({ key: 'minigames', value: DEFAULT_MINIGAMES, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value: DEFAULT_MINIGAMES, updatedAt: now } })
    report.minigames = 'written'
  }

  // Games built but not started get the new riddles and their mini-games; tokens stay.
  // Only demo games: the admin's test games and orders paid through the mock provider.
  const built = await db
    .select({ id: orders.id, orderNo: orders.orderNo, notes: orders.notes, step: gameStates.step })
    .from(orders)
    .leftJoin(gameStates, eq(gameStates.orderId, orders.id))
    .where(and(isNotNull(orders.game), inArray(orders.status, ['review', 'ready'])))
  const mockPaid = await mockPaidOrderIds(db)
  for (const o of built) {
    if (o.step && o.step !== 'opening') continue
    if (!isDemoOrder(o, mockPaid)) {
      report.skippedNotDemo.push(o.orderNo)
      continue
    }
    try {
      await buildOrderGame(db, o.id, now)
      report.rebuilt.push(o.orderNo)
    } catch (e) {
      if (!(e instanceof BuildError)) throw e
      report.rebuildFailed.push(o.orderNo)
    }
  }

  // Recorded last: everything written above counts as the demo's, not the admin's.
  await markDemoSeeded(db, new Date(Math.max(Date.now(), now.getTime())))
  return report
}
