// Orders: creation, building the frozen game, review queue transitions.
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import {
  gameStates,
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
import { attachPhotos, buildGame, defaultAnswers } from '../domain/builder.ts'
import { addYears, israelDate } from '../domain/dates.ts'
import { regenerateMinigame } from '../domain/minigames.ts'
import { checkAnswers } from '../domain/oddcheck.ts'
import { orderRecipient, questionSetIdFor } from '../domain/recipient.ts'
import type {
  Form,
  LetterNote,
  OrderFlag,
  OrderStatus,
  Palette,
  Question,
  Recipient,
} from '../domain/types.ts'
import { randomToken } from '../lib/tokens.ts'
import { getSetting, minigameContent } from './settings.ts'

export type Order = typeof orders.$inferSelect

export interface NewOrder {
  kind: 'private' | 'company'
  status: OrderStatus
  occasionKey: string
  form: Form
  recipient?: Recipient | null
  honoreeName?: string
  themeId: number
  paletteId?: number | null
  routeId: number
  people: number
  allergens?: string[]
  diets?: string[]
  restrictionCounts?: Record<string, number>
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

/**
 * The questions of an occasion for a recipient: the recipient's question set on the occasion, else
 * the occasion's own set (company games, or a recipient the occasion does not offer).
 */
export async function questionsForOccasion(
  db: DB,
  occasionKey: string,
  recipient?: Recipient | null,
): Promise<Question[]> {
  const [occ] = await db.select().from(occasions).where(eq(occasions.key, occasionKey))
  if (!occ) return []
  const setId = questionSetIdFor(occ, recipient)
  if (!setId) return []
  const [qs] = await db.select().from(questionSets).where(eq(questionSets.id, setId))
  return qs?.questions ?? []
}

/** The questions of an order: its occasion and recipient (old orders: mapped from the form). */
export async function questionsForOrder(
  db: DB,
  order: { occasionKey: string; recipient?: string | null; form: Form; kind?: string },
): Promise<Question[]> {
  const [occ] = await db.select().from(occasions).where(eq(occasions.key, order.occasionKey))
  return questionsForOccasion(db, order.occasionKey, orderRecipient(order, occ))
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
  const [occasion] = await db.select().from(occasions).where(eq(occasions.key, order.occasionKey))
  const recipient = orderRecipient(order, occasion)
  const questions = await questionsForOccasion(db, order.occasionKey, recipient)
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
      style: theme.style,
    },
    palette: palette ? { id: palette.id, palette: palette.palette } : null,
    decor: occasion?.decor ?? 'generic',
    playersFeminine: occasion?.playersFeminine ?? false,
    stalls: marketStalls,
    tastings: marketTastings,
    riddles: marketRiddles,
    questions,
    minigames: await minigameContent(db),
    occasionKey: order.occasionKey,
    forKids: occasion?.forKids ?? false,
    seed: order.orderNo,
    order: {
      form: order.form,
      recipient,
      honoreeName: order.honoreeName,
      people: order.people,
      allergens: order.allergens,
      diets: order.diets,
      restrictionCounts: order.restrictionCounts,
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
  // Same defaults as the builder (honoree, group name, company name).
  const checked = defaultAnswers({ ...order, company })
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

  // A rebuild (the buyer edited before the game started) keeps what the owner already approved:
  // the same flag on the same text stays resolved and does not send the order back to review.
  // A blocked stop is never approved, so it always counts.
  const approved = new Set(order.flags.filter((f) => f.resolved && f.code !== 'blocked_stop').map(flagKey))
  for (const f of flags) if (approved.has(flagKey(f))) f.resolved = true
  const open = flags.filter((f) => !f.resolved)

  const validYears = await getSetting(db, 'valid_years')
  const [updated] = await db
    .update(orders)
    .set({
      game,
      flags,
      status: open.length ? 'review' : 'ready',
      validUntil: order.validUntil ?? addYears(israelDate(now), validYears),
    })
    // Never over a game that started meanwhile: a started game is frozen.
    .where(and(eq(orders.id, orderId), notInArray(orders.status, STARTED)))
    .returning()
  if (!updated) throw new BuildError('the game already started')
  return updated
}

/** Statuses after the game started (or ended): its frozen game never changes again. */
export const STARTED: OrderStatus[] = ['active', 'done', 'expired', 'cancelled']

const flagKey = (f: OrderFlag) => `${f.code}|${f.slot ?? ''}|${f.stopIndex ?? ''}|${f.message}`

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

/**
 * The owner rebuilds one mini-game of an order (another type or other choices), from the order's
 * own answers and the current mini-game content. Allowed until the group reaches that game.
 */
export async function regenerateOrderMinigame(db: DB, orderId: number, index: number, now = new Date()) {
  const order = await getOrder(db, orderId)
  if (!order?.game) throw new BuildError('order has no game')
  const games = order.game.minigames ?? []
  const current = games[index]
  if (!current) throw new BuildError('no such mini-game')
  if (['done', 'expired', 'cancelled'].includes(order.status))
    throw new BuildError(`order is ${order.status}`)
  const [state] = await db.select().from(gameStates).where(eq(gameStates.orderId, orderId))
  if (state && state.step !== 'opening' && state.stopIndex >= current.afterStop)
    throw new BuildError('the group already reached this mini-game')
  const [occ] = await db.select().from(occasions).where(eq(occasions.key, order.occasionKey))
  const questions = await questionsForOccasion(db, order.occasionKey, orderRecipient(order, occ))
  const company = order.kind === 'company' && order.companyName ? { name: order.companyName } : null
  const game = order.game
  const seed = `${order.orderNo}:${now.getTime()}`
  const next = regenerateMinigame(
    {
      form: order.form,
      answers: defaultAnswers({ ...order, company }),
      questions,
      photos: game.letter.photos,
      letterNotes: order.letterNotes,
      content: await minigameContent(db),
      occasionKey: order.occasionKey,
      stopCount: game.stops.length,
      riddleSlots: game.stops.map((s) => s.riddle.parts.flatMap((p) => (p.t === 'slot' ? [p.slot] : []))),
      seed,
    },
    games,
    index,
    seed,
  )
  if (!next) throw new BuildError('not enough personal answers for another mini-game')
  const minigames = games.map((g, i) => (i === index ? next : g))
  const [row] = await db
    .update(orders)
    .set({ game: attachPhotos({ ...game, minigames }, game.letter.photos) })
    .where(eq(orders.id, orderId))
    .returning()
  return row
}
