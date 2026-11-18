// Orders: creation, building the frozen game, review queue transitions.
import { and, eq, inArray } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import {
  markets,
  occasions,
  orders,
  palettes,
  questionSets,
  riddles,
  routes,
  stalls,
  tastings,
  themes,
} from '../db/schema.ts'
import { buildGame } from '../domain/builder.ts'
import { addYears, israelDate } from '../domain/dates.ts'
import { checkAnswers } from '../domain/oddcheck.ts'
import type { Form, LetterNote, OrderFlag, OrderStatus, Palette, Question } from '../domain/types.ts'
import { randomToken } from '../lib/tokens.ts'
import { getSetting } from './settings.ts'

export type Order = typeof orders.$inferSelect

export interface NewOrder {
  kind: 'private' | 'company'
  status: OrderStatus
  occasionKey: string
  form: Form
  honoreeName?: string
  themeId: number
  paletteId?: number | null
  routeId: number
  people: number
  allergens?: string[]
  diets?: string[]
  answers?: Record<string, string>
  letterNotes?: LetterNote[]
  buyerName?: string
  buyerPhone?: string
  buyerEmail?: string
  priceAgorot?: number
  companyName?: string | null
  companyLogo?: string | null
  companyPalette?: Palette | null
  notes?: string
}

/** Short human order number, e.g. "MR-7K3Q9". Unambiguous characters only. */
export function newOrderNo(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let s = ''
  for (const b of randomToken(8)) s += alphabet[b.charCodeAt(0) % alphabet.length]
  return `MR-${s.slice(0, 6)}`
}

export async function createOrder(db: DB, o: NewOrder): Promise<Order> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await db
        .insert(orders)
        .values({
          ...o,
          orderNo: newOrderNo(),
          gameToken: randomToken(),
          manageToken: randomToken(),
        })
        .returning()
      return row
    } catch (err) {
      if (attempt >= 3) throw err
    }
  }
}

export async function getOrder(db: DB, id: number): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id))
  return row
}

export async function questionsForOccasion(db: DB, occasionKey: string): Promise<Question[]> {
  const [occ] = await db.select().from(occasions).where(eq(occasions.key, occasionKey))
  if (!occ?.questionSetId) return []
  const [qs] = await db.select().from(questionSets).where(eq(questionSets.id, occ.questionSetId))
  return qs?.questions ?? []
}

export class BuildError extends Error {}

/**
 * Builds the frozen game for an order whose answers are complete, runs the odd-answer check
 * and moves it to `ready` (clean) or `review` (flagged). Returns the updated order.
 */
export async function buildOrderGame(db: DB, orderId: number, now = new Date()): Promise<Order> {
  const order = await getOrder(db, orderId)
  if (!order) throw new BuildError('order not found')
  if (!order.routeId || !order.themeId) throw new BuildError('order has no route or theme')
  const [route] = await db.select().from(routes).where(eq(routes.id, order.routeId))
  const [theme] = await db.select().from(themes).where(eq(themes.id, order.themeId))
  if (!route || !theme) throw new BuildError('route or theme missing')
  if (theme.marketId !== route.marketId) throw new BuildError('theme and route are in different markets')
  const [market] = await db.select().from(markets).where(eq(markets.id, route.marketId))
  const marketStalls = await db.select().from(stalls).where(eq(stalls.marketId, route.marketId))
  const stallIds = marketStalls.map((s) => s.id)
  const [marketTastings, marketRiddles] = stallIds.length
    ? await Promise.all([
        db.select().from(tastings).where(inArray(tastings.stallId, stallIds)),
        db.select().from(riddles).where(inArray(riddles.stallId, stallIds)),
      ])
    : [[], []]
  const questions = await questionsForOccasion(db, order.occasionKey)
  const [occasion] = await db.select().from(occasions).where(eq(occasions.key, order.occasionKey))
  // The chosen palette, if it still exists (a deleted palette falls back to the theme's own).
  const [palette] = order.paletteId
    ? await db.select().from(palettes).where(eq(palettes.id, order.paletteId))
    : []

  const company =
    order.kind === 'company' && order.companyName
      ? { name: order.companyName, logo: order.companyLogo, palette: order.companyPalette ?? null }
      : null
  const { game, flags: buildFlags } = buildGame({
    market: { id: market.id, name: market.name },
    route: { id: route.id, stops: route.stops },
    theme: {
      id: theme.id,
      name: theme.name,
      mapFile: theme.mapFile,
      palette: theme.palette,
      pins: theme.pins,
    },
    palette: palette ? { id: palette.id, palette: palette.palette } : null,
    decor: occasion?.decor ?? 'generic',
    stalls: marketStalls,
    tastings: marketTastings,
    riddles: marketRiddles,
    questions,
    order: {
      form: order.form,
      honoreeName: order.honoreeName,
      people: order.people,
      allergens: order.allergens,
      diets: order.diets,
      answers: order.answers,
      letterNotes: order.letterNotes,
      photos: order.photos,
      company,
    },
    now,
  })

  const rules = await getSetting(db, 'odd_rules')
  const extra: Record<string, string> = {}
  order.letterNotes.forEach((n, i) => {
    extra[`letter_${i}`] = `${n.text} ${n.signature}`
  })
  // Same defaults as the builder: a company's name fills the company_name slot.
  const checked = {
    name: order.honoreeName,
    ...(company ? { company_name: company.name } : {}),
    ...order.answers,
  }
  const answerFlags = checkAnswers(checked, questions, rules, extra)
  // De-duplicate: the builder and the checker can both report the same empty slot.
  const seen = new Set<string>()
  const flags: OrderFlag[] = []
  for (const f of [...answerFlags, ...buildFlags]) {
    const k = `${f.code}:${f.slot ?? ''}:${f.code === 'blocked_stop' ? f.stopIndex : ''}`
    if (!seen.has(k)) {
      seen.add(k)
      flags.push(f)
    }
  }

  const validYears = await getSetting(db, 'valid_years')
  const [updated] = await db
    .update(orders)
    .set({
      game,
      flags,
      status: flags.length ? 'review' : 'ready',
      validUntil: order.validUntil ?? addYears(israelDate(now), validYears),
    })
    .where(eq(orders.id, orderId))
    .returning()
  return updated
}

/** Owner approves a flagged order (after fixing it). Blocked stops must be rebuilt clean first. */
export async function approveOrder(db: DB, orderId: number): Promise<Order> {
  const order = await getOrder(db, orderId)
  if (!order) throw new BuildError('order not found')
  if (order.status !== 'review') throw new BuildError(`order is ${order.status}, not in review`)
  if (!order.game) throw new BuildError('order has no game')
  if (order.flags.some((f) => f.code === 'blocked_stop'))
    throw new BuildError('order has blocked stops; fix the catalog or route and rebuild')
  const [row] = await db
    .update(orders)
    .set({ status: 'ready', flags: order.flags.map((f) => ({ ...f, resolved: true })) })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'review')))
    .returning()
  return row
}

/** Owner edits answers / letter notes inline from the review queue, then the game is rebuilt. */
export async function updateAnswersAndRebuild(
  db: DB,
  orderId: number,
  patch: { answers?: Record<string, string>; letterNotes?: LetterNote[]; honoreeName?: string },
): Promise<Order> {
  const order = await getOrder(db, orderId)
  if (!order) throw new BuildError('order not found')
  if (['active', 'done', 'expired', 'cancelled'].includes(order.status))
    throw new BuildError(`order is ${order.status}; a started game is frozen`)
  await db
    .update(orders)
    .set({
      answers: patch.answers ?? order.answers,
      letterNotes: patch.letterNotes ?? order.letterNotes,
      honoreeName: patch.honoreeName ?? order.honoreeName,
    })
    .where(eq(orders.id, orderId))
  return buildOrderGame(db, orderId)
}
