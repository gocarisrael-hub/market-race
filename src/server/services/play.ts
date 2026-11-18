// Playing a game: one shared state per order, advanced by any phone.
// The client never receives a later stop's answer, stall or tasting before it is reached.
import { and, eq, sql } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { gameStates, markets, orders, redemptions, stalls } from '../db/schema.ts'
import { dailyCode } from '../domain/dailycode.ts'
import { israelDate } from '../domain/dates.ts'
import { matchAnswer } from '../domain/matcher.ts'
import type { GameSnapshot, Palette, SnapshotStall, SnapshotTasting, TextPart } from '../domain/types.ts'
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
  status: 'ready' | 'active' | 'done' | 'expired' | 'not_ready'
  version: number
  pollSeconds: number
  theme: { name: string; map: string | null; palette: Palette } | null
  company: { name: string; logo: string | null } | null
  honoree: string
  form: string
  people: number
  allergens: string[]
  diets: string[]
  totalStops: number
  step: Step
  stopIndex: number
  current: null | {
    index: number
    finale: boolean
    riddle: { parts: TextPart[]; hint: string | null; hasHint: boolean }
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

function isExpired(order: Loaded['order'], today: string) {
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

async function buildView(db: DB, l: Loaded, pollSeconds: number, now: Date): Promise<PlayerView> {
  const { order, game, state } = l
  const today = israelDate(now)
  const status: PlayerView['status'] = isExpired(order, today)
    ? 'expired'
    : state.step === 'done'
      ? 'done'
      : state.step === 'opening'
        ? 'ready'
        : 'active'
  const base: PlayerView = {
    status,
    version: state.version,
    pollSeconds,
    theme: { name: game.theme.name, map: fileUrl(game.theme.map), palette: game.theme.palette },
    company: game.company ? { name: game.company.name, logo: fileUrl(game.company.logo) } : null,
    honoree: game.honoree,
    form: game.form,
    people: game.people,
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
  if (state.step === 'opening') return base

  const stop = game.stops[state.stopIndex]
  const hintShown = state.hintsShown.includes(stop.index)
  const current: NonNullable<PlayerView['current']> = {
    index: stop.index,
    finale: stop.finale,
    riddle: {
      parts: stop.riddle.parts,
      hint: hintShown ? stop.riddle.hint : null,
      hasHint: !!stop.riddle.hint,
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
        portions: game.people,
        tasting: tasting.name,
        allergens: game.allergens,
        name: game.company?.name ?? game.honoree,
      }
    }
  }
  base.current = current
  return base
}

export type PlayAction =
  | { type: 'start' }
  | { type: 'answer'; stopIndex: number; answer: string }
  | { type: 'hint'; stopIndex: number }
  | { type: 'arrived'; stopIndex: number }
  | { type: 'redeemed'; stopIndex: number }
  // The group found the shown stall closed. `stallId` is the stall the phone shows, so a phone
  // still showing a stall another phone already reported is stale, not a second report.
  | { type: 'stall_closed'; stopIndex: number; stallId?: number }

export type PlayResult =
  // noBackup: a reported closed stall has no backup; the group is told to contact us.
  | { ok: true; view: PlayerView; correct?: boolean; noBackup?: boolean }
  | { ok: false; error: 'not_found' | 'not_ready' | 'expired' | 'stale'; view?: PlayerView }

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

  if (action.type === 'start') {
    if (state.step !== 'opening') return stale()
    if (!(await update({ step: 'riddle', stopIndex: 0, startedAt: now }))) return stale()
    await db.update(orders).set({ status: 'active' }).where(eq(orders.id, order.id))
    return reload()
  }

  if (action.stopIndex !== state.stopIndex) return stale()
  const stop = game.stops[state.stopIndex]

  switch (action.type) {
    case 'hint': {
      if (state.step !== 'riddle') return stale()
      if (state.hintsShown.includes(stop.index)) return reload()
      if (!(await update({ hintsShown: [...state.hintsShown, stop.index] }))) return stale()
      return reload()
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
          portions: game.people,
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
