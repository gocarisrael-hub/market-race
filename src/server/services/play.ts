// Playing a game: one shared state per order, advanced by any phone.
// The client never receives a later stop's answer, stall or tasting before it is reached.
// Only the captain (the buyer, on the manage page) starts it, choosing how many players arrived;
// until then every phone on the game link sees a waiting screen. The captain can also pause it
// ("עוצרים להיום", from the game on the captain's own phone) and resume it from the manage link,
// any day it is valid and any number of times, at the same stop. While paused nothing is sent and
// every play action is refused.
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { gameStates, markets, occasions, orders, redemptions, stalls } from '../db/schema.ts'
import { dailyCode } from '../domain/dailycode.ts'
import { israelDate } from '../domain/dates.ts'
import { matchAnswer } from '../domain/matcher.ts'
import {
  type Decor,
  type GameSnapshot,
  type HintQuestion,
  isDecor,
  type Palette,
  type SnapshotStall,
  type SnapshotTasting,
  type TextPart,
} from '../domain/types.ts'
import type { Services } from './context.ts'
import { alertOwner } from './delivery.ts'

export type Step = 'opening' | 'riddle' | 'revealed' | 'redeem' | 'done'

export function fileUrl(file: string | null | undefined): string | null {
  if (!file) return null
  if (file.startsWith('builtin:')) return `/static/maps/${file.slice('builtin:'.length)}`
  if (/^https?:\/\//.test(file)) return file
  return `/uploads/${file}`
}

export interface PlayerView {
  status: 'ready' | 'active' | 'paused' | 'done' | 'expired' | 'not_ready'
  version: number
  pollSeconds: number
  theme: { name: string; map: string | null; palette: Palette } | null
  /** The occasion's doodle set. */
  decor: Decor
  company: { name: string; logo: string | null } | null
  honoree: string
  form: string
  /**
   * The form the player's own copy is picked by. "she" only when the players are addressed in the
   * feminine plural (a bachelorette); a game for her from a mixed group reads in the plain plural.
   */
  voice: string
  /** Portions bought per stop. */
  people: number
  /** Players who arrived, chosen by the captain at the start: the portions each stall serves. */
  players: number
  allergens: string[]
  diets: string[]
  totalStops: number
  step: Step
  stopIndex: number
  current: null | {
    index: number
    finale: boolean
    riddle: {
      parts: TextPart[]
      hint: string | null
      hasHint: boolean
      /** A personal question to answer before the hint shows (never its answer). Null: plain hint. */
      hintQuestion: string | null
    }
    photo: string | null
    // From "revealed" on:
    reveal: null | {
      answer: string
      afterText: string
      stall: SnapshotStall
      tasting: SnapshotTasting
      usingBackup: boolean
      closedNote: string | null
      originalStallName: string | null
    }
    // On "redeem":
    redeem: null | { code: string; portions: number; tasting: string; allergens: string[]; name: string }
  }
  completed: { index: number; stall: string; tasting: string }[]
  letter: null | { notes: { text: string; signature: string }[]; photos: string[] }
}

type Loaded = {
  order: typeof orders.$inferSelect
  game: GameSnapshot
  state: typeof gameStates.$inferSelect
}

async function load(db: DB, token: string): Promise<Loaded | 'not_found' | 'not_ready'> {
  const [order] = await db.select().from(orders).where(eq(orders.gameToken, token))
  if (!order) return 'not_found'
  if (!order.game || !['ready', 'active', 'done', 'expired'].includes(order.status)) return 'not_ready'
  let [state] = await db.select().from(gameStates).where(eq(gameStates.orderId, order.id))
  if (!state) {
    ;[state] = await db.insert(gameStates).values({ orderId: order.id }).onConflictDoNothing().returning()
    if (!state) [state] = await db.select().from(gameStates).where(eq(gameStates.orderId, order.id))
  }
  return { order, game: order.game, state }
}

function isExpired(order: { status: string; validUntil: string | null }, today: string) {
  return (
    order.status === 'expired' ||
    (order.validUntil != null && today > order.validUntil && order.status !== 'done')
  )
}

async function stallClosedToday(db: DB, stallId: number, today: string) {
  const [s] = await db.select().from(stalls).where(eq(stalls.id, stallId))
  if (!s) return { closed: true, note: '' }
  return { closed: !s.active || s.closedOn === today, note: s.closedNote }
}

/** The snapshot's doodle set; games built before it existed use the occasion's current one. */
async function decorOf(db: DB, order: Loaded['order'], game: GameSnapshot): Promise<Decor> {
  if (isDecor(game.decor)) return game.decor
  const [occ] = await db
    .select({ decor: occasions.decor })
    .from(occasions)
    .where(eq(occasions.key, order.occasionKey))
  return isDecor(occ?.decor) ? occ.decor : 'generic'
}

/** Players who arrived (games started before the choice existed serve the portions bought). */
export const playersOf = (state: { players: number | null }, game: Pick<GameSnapshot, 'people'>) =>
  state.players ?? game.people

/** The personal question that unlocks this stop's hint: one per stop, in turn. Null: none. */
export function hintQuestionFor(questions: HintQuestion[] | null | undefined, stopIndex: number) {
  const list = (questions ?? []).filter((q) => q.question.trim() && q.answer.trim())
  return list.length ? list[stopIndex % list.length] : null
}

export type StartBlock = 'not_ready' | 'started' | 'expired'

/**
 * Why the captain cannot start the game now, or null when they can: a built game (status ready)
 * still on its opening screen, on a day it is valid (Israel time).
 */
export function startBlock(
  order: { status: string; validUntil: string | null; game: unknown },
  state: { step: string } | undefined,
  today: string,
): StartBlock | null {
  if (isExpired(order, today)) return 'expired'
  if (order.status === 'active' || order.status === 'done' || (state && state.step !== 'opening'))
    return 'started'
  if (order.status !== 'ready' || !order.game) return 'not_ready'
  return null
}

export type PauseBlock = 'not_playing' | 'expired'
export type ResumeBlock = 'not_paused' | 'expired'

/** Whether a game is paused now (a finished game never is). */
export const isPaused = (state: { pausedAt: Date | null; step: string }) =>
  state.pausedAt != null && state.step !== 'opening' && state.step !== 'done'

/**
 * Why the captain cannot pause now, or null: only a started, unfinished, valid game. Pausing a
 * game that is already paused is not an error (two taps); the caller sees it changed nothing.
 */
export function pauseBlock(
  order: { status: string; validUntil: string | null },
  state: { step: string } | undefined,
  today: string,
): PauseBlock | null {
  if (isExpired(order, today)) return 'expired'
  if (!state || state.step === 'opening' || state.step === 'done' || order.status !== 'active')
    return 'not_playing'
  return null
}

/** Why the captain cannot resume now, or null: a paused game, any day it is still valid. */
export function resumeBlock(
  order: { status: string; validUntil: string | null },
  state: { step: string; pausedAt: Date | null } | undefined,
  today: string,
): ResumeBlock | null {
  if (isExpired(order, today)) return 'expired'
  if (!state || !isPaused(state)) return 'not_paused'
  return null
}

async function buildView(db: DB, l: Loaded, pollSeconds: number, now: Date): Promise<PlayerView> {
  const { order, game, state } = l
  const today = israelDate(now)
  const players = playersOf(state, game)
  const status: PlayerView['status'] = isExpired(order, today)
    ? 'expired'
    : state.step === 'done'
      ? 'done'
      : state.step === 'opening'
        ? 'ready'
        : isPaused(state)
          ? 'paused'
          : 'active'
  const base: PlayerView = {
    status,
    version: state.version,
    pollSeconds,
    theme: { name: game.theme.name, map: fileUrl(game.theme.map), palette: game.theme.palette },
    decor: await decorOf(db, order, game),
    company: game.company ? { name: game.company.name, logo: fileUrl(game.company.logo) } : null,
    honoree: game.honoree,
    form: game.form,
    voice: playersVoice(game),
    people: game.people,
    players,
    allergens: game.allergens,
    diets: game.diets,
    totalStops: game.stops.length,
    step: state.step,
    stopIndex: state.stopIndex,
    current: null,
    completed: game.stops.slice(0, state.step === 'done' ? game.stops.length : state.stopIndex).map((s) => {
      const usedBackup = state.backupStops.includes(s.index) && s.backup
      return {
        index: s.index,
        stall: usedBackup ? s.backup!.stall.name : s.stall.name,
        tasting: usedBackup ? s.backup!.tasting.name : s.tasting.name,
      }
    }),
    letter: null,
  }
  if (status === 'expired') return base
  if (state.step === 'done') {
    base.letter = { notes: game.letter.notes, photos: game.letter.photos.map((p) => fileUrl(p)!) }
    return base
  }
  // Paused: where they stopped (stopIndex, totalStops) and nothing of the stop itself.
  if (state.step === 'opening' || status === 'paused') return base

  const stop = game.stops[state.stopIndex]
  const hintShown = state.hintsShown.includes(stop.index)
  const hasHint = !!stop.riddle.hint
  const current: NonNullable<PlayerView['current']> = {
    index: stop.index,
    finale: stop.finale,
    riddle: {
      parts: stop.riddle.parts,
      hint: hintShown ? stop.riddle.hint : null,
      hasHint,
      hintQuestion:
        hasHint && !hintShown ? (hintQuestionFor(order.hintQuestions, stop.index)?.question ?? null) : null,
    },
    photo: fileUrl(stop.photo),
    reveal: null,
    redeem: null,
  }
  if (state.step === 'revealed' || state.step === 'redeem') {
    const usingBackup = state.backupStops.includes(stop.index) && !!stop.backup
    const stall = usingBackup ? stop.backup!.stall : stop.stall
    const tasting = usingBackup ? stop.backup!.tasting : stop.tasting
    let closedNote: string | null = null
    if (usingBackup) {
      // The admin's note only when the admin closed it today (a group's report carries no note).
      const c = await stallClosedToday(db, stop.stall.id, today)
      closedNote = (c.closed && c.note) || null
    }
    current.reveal = {
      answer: stop.riddle.answer,
      afterText: stop.riddle.afterText,
      stall,
      tasting,
      usingBackup,
      closedNote,
      originalStallName: usingBackup ? stop.stall.name : null,
    }
    if (state.step === 'redeem') {
      const [market] = await db.select().from(markets).where(eq(markets.id, game.market.id))
      current.redeem = {
        code: dailyCode(market.codeSecret, today),
        portions: players,
        tasting: tasting.name,
        allergens: game.allergens,
        name: game.company?.name ?? game.honoree,
      }
    }
  }
  base.current = current
  return base
}

// What a phone on the game link can do. Starting is the captain's, on the manage page (startGame).
export type PlayAction =
  | { type: 'answer'; stopIndex: number; answer: string }
  // With personal questions on the order, `answer` answers this stop's question; wrong keeps the hint hidden.
  | { type: 'hint'; stopIndex: number; answer?: string }
  | { type: 'arrived'; stopIndex: number }
  | { type: 'redeemed'; stopIndex: number }
  // The group found the shown stall closed. `stallId` is the stall the phone shows, so a phone
  // still showing a stall another phone already reported is stale, not a second report.
  | { type: 'stall_closed'; stopIndex: number; stallId?: number }

export type PlayResult =
  // noBackup: a reported closed stall has no backup; the group is told to contact us.
  | { ok: true; view: PlayerView; correct?: boolean; noBackup?: boolean }
  | { ok: false; error: 'not_found' | 'not_ready' | 'expired' | 'stale' | 'paused'; view?: PlayerView }

export async function getView(db: DB, token: string, pollSeconds = 4, now = new Date()) {
  const l = await load(db, token)
  if (typeof l === 'string') return l
  return buildView(db, l, pollSeconds, now)
}

/**
 * Applies one action. Actions name the stop they are for; an action for a stop or step the
 * game has already moved past is "stale" (another phone got there first) and changes nothing.
 * Every update is conditional on the version read, so two phones never double-advance.
 */
export async function act(
  db: DB,
  token: string,
  action: PlayAction,
  pollSeconds = 4,
  now = new Date(),
  svc?: Services,
): Promise<PlayResult> {
  const l = await load(db, token)
  if (typeof l === 'string') return { ok: false, error: l }
  const { order, game, state } = l
  const today = israelDate(now)
  if (isExpired(order, today))
    return { ok: false, error: 'expired', view: await buildView(db, l, pollSeconds, now) }

  // Paused by the captain: nothing moves until the captain resumes from the manage link.
  if (isPaused(state)) return { ok: false, error: 'paused', view: await buildView(db, l, pollSeconds, now) }

  const stale = async () =>
    ({ ok: false, error: 'stale', view: await buildView(db, l, pollSeconds, now) }) as PlayResult

  const update = async (set: Partial<typeof gameStates.$inferInsert>) => {
    const rows = await db
      .update(gameStates)
      .set({ ...set, version: sql`${gameStates.version} + 1`, lastActivityAt: now })
      .where(and(eq(gameStates.orderId, order.id), eq(gameStates.version, state.version)))
      .returning()
    return rows.length > 0
  }
  const reload = async (correct?: boolean): Promise<PlayResult> => {
    const fresh = await load(db, token)
    if (typeof fresh === 'string') return { ok: false, error: fresh }
    return { ok: true, view: await buildView(db, fresh, pollSeconds, now), correct }
  }

  if (action.stopIndex !== state.stopIndex) return stale()
  const stop = game.stops[state.stopIndex]

  switch (action.type) {
    case 'hint': {
      if (state.step !== 'riddle') return stale()
      if (state.hintsShown.includes(stop.index)) return reload()
      const q = hintQuestionFor(order.hintQuestions, stop.index)
      if (q && !matchAnswer(action.answer ?? '', q.answer).ok)
        return { ok: true, view: await buildView(db, l, pollSeconds, now), correct: false }
      if (!(await update({ hintsShown: [...state.hintsShown, stop.index] }))) return stale()
      return reload(q ? true : undefined)
    }
    case 'answer': {
      if (state.step !== 'riddle') return stale()
      const m = matchAnswer(action.answer, stop.riddle.answer, stop.riddle.accepted)
      if (!m.ok) {
        await db
          .update(gameStates)
          .set({ wrongAnswers: sql`${gameStates.wrongAnswers} + 1`, lastActivityAt: now })
          .where(eq(gameStates.orderId, order.id))
        return { ok: true, view: await buildView(db, l, pollSeconds, now), correct: false }
      }
      // Check the stall on the day it is played; switch to the backup if it is closed.
      const { closed } = await stallClosedToday(db, stop.stall.id, today)
      const backupStops = closed && stop.backup ? [...state.backupStops, stop.index] : state.backupStops
      if (!(await update({ step: 'revealed', backupStops }))) return stale()
      return reload(true)
    }
    case 'arrived': {
      if (state.step !== 'revealed') return stale()
      if (!(await update({ step: 'redeem' }))) return stale()
      return reload()
    }
    case 'redeemed': {
      if (state.step !== 'redeem') return stale()
      const usingBackup = state.backupStops.includes(stop.index) && !!stop.backup
      const stall = usingBackup ? stop.backup!.stall : stop.stall
      const tasting = usingBackup ? stop.backup!.tasting : stop.tasting
      const last = state.stopIndex >= game.stops.length - 1
      if (
        !(await update(
          last ? { step: 'done', finishedAt: now } : { step: 'riddle', stopIndex: state.stopIndex + 1 },
        ))
      )
        return stale()
      await db
        .insert(redemptions)
        .values({
          orderId: order.id,
          stopIndex: stop.index,
          stallId: stall.id,
          tastingId: tasting.id,
          portions: playersOf(state, game),
          feeAgorot: tasting.feeAgorot,
          usedBackup: usingBackup,
          redeemedAt: now,
        })
        .onConflictDoNothing()
      if (last) await db.update(orders).set({ status: 'done' }).where(eq(orders.id, order.id))
      return reload()
    }
    case 'stall_closed': {
      if (state.step !== 'revealed' && state.step !== 'redeem') return stale()
      const usingBackup = state.backupStops.includes(stop.index) && !!stop.backup
      const shown = usingBackup ? stop.backup!.stall : stop.stall
      if (action.stallId != null && action.stallId !== shown.id) return stale()
      const where = [
        `הזמנה ${order.orderNo}, המירוץ של ${game.honoree}`,
        `תחנה ${stop.index + 1} מתוך ${game.stops.length}`,
        `הדוכן שדווח סגור: ${shown.name}`,
      ]
      const alert = async (subject: string, lines: string[]) => {
        console.info(`[play] stall_closed order=${order.orderNo} stop=${stop.index} stall=${shown.id}`)
        if (!svc) return
        try {
          await alertOwner(svc, subject, lines)
        } catch (e) {
          console.error('[play] stall_closed alert failed', e)
        }
      }
      if (usingBackup || !stop.backup) {
        // Nowhere to send them: the game stays as it is and the group is told to contact us.
        await alert(`הזמנה ${order.orderNo}: דוכן סגור ואין דוכן חלופי`, [
          ...where,
          usingBackup ? 'זה כבר הדוכן החלופי.' : 'לתחנה אין דוכן חלופי.',
          'הקבוצה התבקשה לפנות אלינו.',
        ])
        return { ok: true, view: await buildView(db, l, pollSeconds, now), noBackup: true }
      }
      if (!(await update({ step: 'revealed', backupStops: [...state.backupStops, stop.index] })))
        return stale()
      await alert(`הזמנה ${order.orderNo}: דוכן סגור, הקבוצה עברה לדוכן החלופי`, [
        ...where,
        `הדוכן החלופי: ${stop.backup.stall.name}`,
        'הדוכן נשאר פתוח לשאר המשחקים. לסגור אותו להיום: בממשק הניהול.',
      ])
      return reload()
    }
  }
}

export type StartResult =
  | { ok: true; view: PlayerView }
  | { ok: false; error: 'not_found' | 'bad_players' | StartBlock }

/**
 * The captain starts the game with the number of players who arrived (1..people bought). From
 * here the order is locked, every phone on the game link moves to the first riddle, and every
 * stall serves `players` portions.
 */
export async function startGame(
  db: DB,
  gameToken: string,
  opts: { players?: number; now?: Date; pollSeconds?: number } = {},
): Promise<StartResult> {
  const now = opts.now ?? new Date()
  const [order] = await db.select().from(orders).where(eq(orders.gameToken, gameToken))
  if (!order) return { ok: false, error: 'not_found' }
  const [existing] = await db.select().from(gameStates).where(eq(gameStates.orderId, order.id))
  const block = startBlock(order, existing, israelDate(now))
  if (block) return { ok: false, error: block }
  const l = await load(db, gameToken)
  if (typeof l === 'string') return { ok: false, error: l === 'not_found' ? 'not_found' : 'not_ready' }
  const players = opts.players ?? l.game.people
  if (!Number.isInteger(players) || players < 1 || players > l.game.people)
    return { ok: false, error: 'bad_players' }
  const rows = await db
    .update(gameStates)
    .set({
      step: 'riddle',
      stopIndex: 0,
      players,
      startedAt: now,
      version: sql`${gameStates.version} + 1`,
      lastActivityAt: now,
    })
    .where(
      and(
        eq(gameStates.orderId, order.id),
        eq(gameStates.version, l.state.version),
        eq(gameStates.step, 'opening'),
      ),
    )
    .returning()
  if (!rows.length) return { ok: false, error: 'started' }
  await db.update(orders).set({ status: 'active' }).where(eq(orders.id, order.id))
  const fresh = await load(db, gameToken)
  if (typeof fresh === 'string') return { ok: false, error: 'not_found' }
  return { ok: true, view: await buildView(db, fresh, opts.pollSeconds ?? 4, now) }
}

export type PauseResult =
  // changed: false when the game was already paused (nothing new happened, no email).
  | { ok: true; view: PlayerView; changed: boolean }
  | { ok: false; error: 'not_found' | 'not_ready' | PauseBlock }

/** The captain pauses the game ("עוצרים להיום"). Every phone moves to the paused screen. */
export async function pauseGame(
  db: DB,
  gameToken: string,
  opts: { now?: Date; pollSeconds?: number } = {},
): Promise<PauseResult> {
  const now = opts.now ?? new Date()
  const l = await load(db, gameToken)
  if (typeof l === 'string') return { ok: false, error: l }
  const block = pauseBlock(l.order, l.state, israelDate(now))
  if (block) return { ok: false, error: block }
  const pollSeconds = opts.pollSeconds ?? 4
  if (isPaused(l.state)) return { ok: true, view: await buildView(db, l, pollSeconds, now), changed: false }
  const rows = await db
    .update(gameStates)
    .set({ pausedAt: now, version: sql`${gameStates.version} + 1`, lastActivityAt: now })
    .where(
      and(
        eq(gameStates.orderId, l.order.id),
        isNull(gameStates.pausedAt),
        inArray(gameStates.step, ['riddle', 'revealed', 'redeem']),
      ),
    )
    .returning()
  const fresh = await load(db, gameToken)
  if (typeof fresh === 'string') return { ok: false, error: fresh }
  if (!rows.length && !isPaused(fresh.state)) return { ok: false, error: 'not_playing' }
  return { ok: true, view: await buildView(db, fresh, pollSeconds, now), changed: rows.length > 0 }
}

export type ResumeResult =
  | { ok: true; view: PlayerView }
  | { ok: false; error: 'not_found' | 'not_ready' | ResumeBlock }

/**
 * The captain resumes a paused game from the manage link: everyone continues at exactly the same
 * stop and step, on the same game link, with the players fixed at the start.
 */
export async function resumeGame(
  db: DB,
  gameToken: string,
  opts: { now?: Date; pollSeconds?: number } = {},
): Promise<ResumeResult> {
  const now = opts.now ?? new Date()
  const l = await load(db, gameToken)
  if (typeof l === 'string') return { ok: false, error: l }
  const block = resumeBlock(l.order, l.state, israelDate(now))
  if (block) return { ok: false, error: block }
  const rows = await db
    .update(gameStates)
    .set({ pausedAt: null, version: sql`${gameStates.version} + 1`, lastActivityAt: now })
    .where(and(eq(gameStates.orderId, l.order.id), isNotNull(gameStates.pausedAt)))
    .returning()
  if (!rows.length) return { ok: false, error: 'not_paused' }
  const fresh = await load(db, gameToken)
  if (typeof fresh === 'string') return { ok: false, error: fresh }
  return { ok: true, view: await buildView(db, fresh, opts.pollSeconds ?? 4, now) }
}

/** The players' grammar: feminine plural only for an occasion that says so (older games: by form). */
export function playersVoice(game: Pick<GameSnapshot, 'form' | 'playersFeminine'>): string {
  if (game.playersFeminine === undefined) return game.form
  if (game.playersFeminine) return 'she'
  return game.form === 'she' ? 'group' : game.form
}
