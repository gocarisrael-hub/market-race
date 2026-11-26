// Admin catalog API (owner only): markets, stalls, tastings, riddles, question sets, occasions,
// routes, themes, palettes, settings. Everything lives under /admin/api/catalog.
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { asc, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import type { DB } from '../db/index.ts'
import {
  markets,
  occasions,
  orders,
  palettes,
  questionSets,
  riddles,
  routes,
  settings,
  stalls,
  tastings,
  themes,
  uploads,
} from '../db/schema.ts'
import { dailyCode } from '../domain/dailycode.ts'
import { israelDate } from '../domain/dates.ts'
import { paletteIssues } from '../domain/look.ts'
import { matchAnswer } from '../domain/matcher.ts'
import { formsOfRecipients } from '../domain/recipient.ts'
import { extractSlots, fallbackFor, fillTemplate, nameSlots, templateLines } from '../domain/template.ts'
import {
  ALLERGENS,
  DECORS,
  DIETS,
  FORMS,
  type Form,
  type OccasionRecipients,
  type Question,
  RECIPIENTS,
  type RouteStop,
  STYLE_COLORS,
  THEME_FONTS,
} from '../domain/types.ts'
import { requireOwner } from '../lib/auth.ts'
import { iconNames } from '../lib/icons.ts'
import { randomToken } from '../lib/tokens.ts'

const builtinMapsDir = fileURLToPath(new URL('../../../assets/maps', import.meta.url))
const builtinIconsDir = fileURLToPath(new URL('../../../assets/icons', import.meta.url))
const MAP_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const UPLOADED_MAP = /^maps\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/
const BUILTIN_MAP = /^builtin:([A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp))$/

// ---------- Schemas ----------

const str = z.string().trim()
const id = z.number().int().positive()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM')
const day = z.object({ open: time, close: time })
const hours = z
  .object({
    0: day.optional(),
    1: day.optional(),
    2: day.optional(),
    3: day.optional(),
    4: day.optional(),
    5: day.optional(),
    6: day.optional(),
  })
  .strict()
const formText = z
  .object({
    she: z.string().optional(),
    he: z.string().optional(),
    couple: z.string().optional(),
    group: z.string().optional(),
    company: z.string().optional(),
  })
  .strict()

const marketBody = z.object({ name: str.min(1), hours, active: z.boolean() })

const stallBase = z.object({
  name: str.min(1),
  locationHint: str,
  phone: str,
  active: z.boolean(),
  closedToday: z.boolean(),
  closedNote: str,
})
const stallCreate = stallBase.partial().extend({ marketId: id, name: str.min(1) })

const tastingBase = z.object({
  name: str.min(1),
  // Public, shown before purchase. The admin form warns not to name the stall.
  teaser: str.max(120),
  teaserIcon: z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .string()
      .refine((v) => iconNames().includes(v), 'unknown icon')
      .nullable(),
  ),
  allergens: z.array(z.enum(ALLERGENS)),
  diets: z.array(z.enum(DIETS)),
  feeAgorot: z.number().int().min(0),
  active: z.boolean(),
})
const tastingCreate = tastingBase.partial().extend({ stallId: id, name: str.min(1) })

const riddleBase = z.object({
  title: str,
  answer: str.min(1),
  accepted: z.array(str.min(1)),
  hint: str,
  templates: formText,
  afterText: str,
  active: z.boolean(),
})
const riddleCreate = riddleBase.partial().extend({ stallId: id, answer: str.min(1) })

const slotKey = z.string().regex(/^[a-z][a-z0-9_]*$/, 'slot: a-z, 0-9, _')
const question = z.object({
  slot: slotKey,
  text: formText,
  required: z.boolean(),
  fallback: z.union([z.string(), formText]),
  maxLen: z.number().int().min(1).max(1000),
  hidden: z.boolean().optional(),
})
const questionSetBase = z.object({
  name: str.min(1),
  questions: z.array(question).superRefine((qs, c) => {
    const seen = new Set<string>()
    qs.forEach((q, i) => {
      if (seen.has(q.slot)) c.addIssue({ code: 'custom', path: [i, 'slot'], message: 'duplicate slot' })
      seen.add(q.slot)
    })
  }),
})

const occasionBase = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/, 'key: a-z, 0-9, _, -'),
  label: str.min(1),
  audience: z.enum(['private', 'company']),
  questionSetId: id.nullable(),
  forms: z.array(z.enum(FORMS)).min(1),
  // Who a private game can be for, each with its question set (null: the occasion's own).
  recipients: z.partialRecord(z.enum(RECIPIENTS), id.nullable()),
  playersFeminine: z.boolean(),
  decor: z.enum(DECORS),
  sort: z.number().int(),
  active: z.boolean(),
})
const occasionCreate = occasionBase.partial().extend({
  key: occasionBase.shape.key,
  label: occasionBase.shape.label,
  audience: occasionBase.shape.audience,
  forms: occasionBase.shape.forms.optional(),
})

/**
 * Keeps `forms` in step with the recipients of a private occasion (older readers use it). A
 * company occasion has no recipients and the company form. Errors when nothing is offered.
 */
function withForms<T extends { audience?: string; forms?: Form[]; recipients?: OccasionRecipients }>(
  body: T,
  audience: string | undefined,
): T | 'no_forms' {
  if (audience === 'company') return { ...body, recipients: {}, forms: body.forms ?? ['company'] }
  if (body.recipients && Object.keys(body.recipients).length)
    return { ...body, forms: formsOfRecipients(body.recipients) }
  if (body.recipients) return 'no_forms'
  return body
}

const stop = z.object({
  stallId: id,
  tastingId: id,
  riddleId: id,
  backupStallId: id.nullable(),
  backupTastingId: id.nullable().optional(),
  backupRiddleId: id.nullable().optional(),
})
const routeBase = z.object({ marketId: id, name: str.min(1), stops: z.array(stop), active: z.boolean() })
const routeCreate = routeBase.partial().extend({ marketId: id, name: str.min(1) })

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, '#RRGGBB')
const palette = z.object({
  background: color,
  accent: color,
  accent2: color.optional(),
  ink: color,
  paper: color,
  dark: z.boolean().optional(),
  mapTint: color.optional(),
})
const pct = z.number().min(0).max(100)
const themeStyle = z
  .object({
    font: z.enum(THEME_FONTS).optional(),
    serifBody: z.boolean().optional(),
    mode: z.enum(['light', 'dark']).optional(),
    treatment: z.enum(['brush', 'neon', 'foil']).optional(),
    sheetLine: z.boolean().optional(),
    riddleTop: z.enum(['trail', 'banner']).optional(),
    icons: z
      .string()
      .regex(/^[a-z0-9-]*$/)
      .optional(),
    colors: z.partialRecord(z.enum(STYLE_COLORS), color).optional(),
  })
  .strict()
const themeBase = z.object({
  name: str.min(1),
  marketId: id,
  palette,
  sort: z.number().int(),
  active: z.boolean(),
  mapFile: z.string().refine((v) => UPLOADED_MAP.test(v) || BUILTIN_MAP.test(v), 'invalid map'),
  pins: z.record(z.string().regex(/^\d+$/), z.object({ x: pct, y: pct })),
  style: themeStyle,
  // The occasion keys and recipients it is offered for; empty: every one.
  occasionKeys: z.array(str.min(1)),
  recipients: z.array(z.enum(RECIPIENTS)),
})
const themeCreate = themeBase.partial().extend({
  name: themeBase.shape.name,
  marketId: id,
  palette,
  mapFile: themeBase.shape.mapFile,
})

const paletteBase = z.object({
  name: str.min(1),
  palette,
  themeIds: z.array(id),
  sort: z.number().int(),
  active: z.boolean(),
})
const paletteCreate = paletteBase.partial().extend({ name: paletteBase.shape.name, palette })

const settingKey = z.string().regex(/^[a-z0-9_.-]{1,100}$/, 'key: a-z, 0-9, _, ., -')

// ---------- Helpers ----------

type Issue = { path: string; message: string }

function invalid(reply: FastifyReply, issues: Issue[], error = 'invalid') {
  return reply.code(400).send({ error, issues })
}

function parse<T extends z.ZodType>(schema: T, body: unknown, reply: FastifyReply): z.infer<T> | null {
  const r = schema.safeParse(body ?? {})
  if (r.success) return r.data
  invalid(
    reply,
    r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  )
  return null
}

function paramId(params: unknown): number | null {
  const n = Number((params as { id?: string }).id)
  return Number.isInteger(n) && n > 0 ? n : null
}

function isFkViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === '23503' || err?.cause?.code === '23503'
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === '23505' || err?.cause?.code === '23505'
}

function publicMarket(m: typeof markets.$inferSelect) {
  return { id: m.id, name: m.name, hours: m.hours, active: m.active, createdAt: m.createdAt }
}

function publicStall(s: typeof stalls.$inferSelect) {
  return { ...s, closedToday: s.closedOn !== null && s.closedOn === israelDate() }
}

function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, i + 1))
    return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() }
  })
}

/** Checks every stop of a route against the catalog. Returns one issue per problem. */
export async function validateStops(db: DB, marketId: number, stops: RouteStop[]): Promise<Issue[]> {
  const [allStalls, allTastings, allRiddles] = await Promise.all([
    db.select({ id: stalls.id, marketId: stalls.marketId }).from(stalls),
    db.select({ id: tastings.id, stallId: tastings.stallId }).from(tastings),
    db.select({ id: riddles.id, stallId: riddles.stallId }).from(riddles),
  ])
  const stallById = new Map(allStalls.map((s) => [s.id, s]))
  const tastingById = new Map(allTastings.map((t) => [t.id, t]))
  const riddleById = new Map(allRiddles.map((r) => [r.id, r]))
  const issues: Issue[] = []
  const add = (i: number, field: string, message: string) =>
    issues.push({ path: `stops.${i}.${field}`, message })

  const checkStall = (i: number, field: string, stallId: number) => {
    const s = stallById.get(stallId)
    if (!s) add(i, field, 'stall not found')
    else if (s.marketId !== marketId) add(i, field, 'stall is in another market')
    return !!s
  }
  const checkOwned = (
    i: number,
    field: string,
    what: string,
    row: { stallId: number } | undefined,
    stallId: number,
  ) => {
    if (!row) add(i, field, `${what} not found`)
    else if (row.stallId !== stallId) add(i, field, `${what} belongs to another stall`)
  }

  stops.forEach((s, i) => {
    checkStall(i, 'stallId', s.stallId)
    checkOwned(i, 'tastingId', 'tasting', tastingById.get(s.tastingId), s.stallId)
    checkOwned(i, 'riddleId', 'riddle', riddleById.get(s.riddleId), s.stallId)
    if (s.backupStallId == null) {
      if (s.backupTastingId != null) add(i, 'backupTastingId', 'backup tasting without a backup stall')
      if (s.backupRiddleId != null) add(i, 'backupRiddleId', 'backup riddle without a backup stall')
      return
    }
    if (s.backupStallId === s.stallId) add(i, 'backupStallId', 'backup stall is the main stall')
    checkStall(i, 'backupStallId', s.backupStallId)
    if (s.backupTastingId != null)
      checkOwned(i, 'backupTastingId', 'tasting', tastingById.get(s.backupTastingId), s.backupStallId)
    if (s.backupRiddleId != null)
      checkOwned(i, 'backupRiddleId', 'riddle', riddleById.get(s.backupRiddleId), s.backupStallId)
  })
  return issues
}

async function validatePins(db: DB, marketId: number, pins: Record<string, unknown>): Promise<Issue[]> {
  const rows = await db.select({ id: stalls.id }).from(stalls).where(eq(stalls.marketId, marketId))
  const ids = new Set(rows.map((r) => String(r.id)))
  return Object.keys(pins)
    .filter((k) => !ids.has(k))
    .map((k) => ({ path: `pins.${k}`, message: 'stall not in this market' }))
}

/** Which routes use a stall, tasting or riddle in any stop (main or backup). */
async function routesUsing(db: DB, kind: 'stall' | 'tasting' | 'riddle', refId: number) {
  const all = await db.select({ id: routes.id, stops: routes.stops }).from(routes)
  return all.filter((r) =>
    r.stops.some((s) =>
      kind === 'stall'
        ? s.stallId === refId || s.backupStallId === refId
        : kind === 'tasting'
          ? s.tastingId === refId || s.backupTastingId === refId
          : s.riddleId === refId || s.backupRiddleId === refId,
    ),
  )
}

async function builtinMaps(): Promise<string[]> {
  if (!existsSync(builtinMapsDir)) return []
  return (await readdir(builtinMapsDir)).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort()
}

async function mapExists(ctx: AppContext, mapFile: string): Promise<boolean> {
  const b = BUILTIN_MAP.exec(mapFile)
  if (b) return existsSync(path.join(builtinMapsDir, b[1]))
  return UPLOADED_MAP.test(mapFile) && existsSync(path.join(ctx.config.uploadDir, mapFile))
}

// ---------- Routes ----------

export async function adminCatalogRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx
  await app.register(
    async (r) => {
      r.addHook('onRequest', requireOwner(db))

      // Deletes a row; a row still referenced elsewhere answers 409 (deactivate it instead).
      async function tryDelete(reply: FastifyReply, run: () => Promise<unknown[]>) {
        try {
          const rows = await run()
          if (rows.length === 0) return reply.code(404).send({ error: 'not_found' })
          return { ok: true }
        } catch (e) {
          if (isFkViolation(e)) return reply.code(409).send({ error: 'in_use' })
          throw e
        }
      }

      // ----- markets -----
      r.get('/markets', async () => ({
        items: (await db.select().from(markets).orderBy(asc(markets.id))).map(publicMarket),
      }))
      r.post('/markets', async (req, reply) => {
        const body = parse(marketBody.partial().extend({ name: str.min(1) }), req.body, reply)
        if (!body) return
        const [row] = await db
          .insert(markets)
          .values({ ...body, codeSecret: randomToken(24) })
          .returning()
        return reply.code(201).send(publicMarket(row))
      })
      r.patch('/markets/:id', async (req, reply) => {
        const mid = paramId(req.params) ?? 0
        const body = parse(marketBody.partial(), req.body, reply)
        if (!body) return
        const [row] = await db.update(markets).set(body).where(eq(markets.id, mid)).returning()
        if (!row) return reply.code(404).send({ error: 'not_found' })
        return publicMarket(row)
      })
      r.delete('/markets/:id', async (req, reply) => {
        const mid = paramId(req.params) ?? 0
        return tryDelete(reply, () => db.delete(markets).where(eq(markets.id, mid)).returning())
      })
      r.get('/markets/:id/codes', async (req, reply) => {
        const mid = paramId(req.params) ?? 0
        const q = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).safeParse(req.query ?? {})
        if (!q.success) return invalid(reply, [{ path: 'month', message: 'YYYY-MM' }])
        const [m] = await db.select().from(markets).where(eq(markets.id, mid))
        if (!m) return reply.code(404).send({ error: 'not_found' })
        return {
          market: { id: m.id, name: m.name, hours: m.hours },
          month: q.data.month,
          days: daysInMonth(q.data.month).map((d) => ({ ...d, code: dailyCode(m.codeSecret, d.date) })),
        }
      })

      // ----- stalls -----
      r.get('/stalls', async (req) => {
        const marketId = Number((req.query as { marketId?: string }).marketId)
        const rows = await db
          .select()
          .from(stalls)
          .where(marketId ? eq(stalls.marketId, marketId) : undefined)
          .orderBy(asc(stalls.id))
        return { items: rows.map(publicStall) }
      })
      const stallValues = (b: Partial<z.infer<typeof stallBase>>) => {
        const { closedToday, ...rest } = b
        return closedToday === undefined ? rest : { ...rest, closedOn: closedToday ? israelDate() : null }
      }
      r.post('/stalls', async (req, reply) => {
        const body = parse(stallCreate, req.body, reply)
        if (!body) return
        const [m] = await db.select({ id: markets.id }).from(markets).where(eq(markets.id, body.marketId))
        if (!m) return invalid(reply, [{ path: 'marketId', message: 'market not found' }])
        const [row] = await db
          .insert(stalls)
          .values({ ...stallValues(body), marketId: body.marketId, name: body.name })
          .returning()
        return reply.code(201).send(publicStall(row))
      })
      r.patch('/stalls/:id', async (req, reply) => {
        const sid = paramId(req.params) ?? 0
        const body = parse(stallBase.partial(), req.body, reply)
        if (!body) return
        const [row] = await db.update(stalls).set(stallValues(body)).where(eq(stalls.id, sid)).returning()
        if (!row) return reply.code(404).send({ error: 'not_found' })
        return publicStall(row)
      })
      r.delete('/stalls/:id', async (req, reply) => {
        const sid = paramId(req.params) ?? 0
        if ((await routesUsing(db, 'stall', sid)).length) return reply.code(409).send({ error: 'in_use' })
        return tryDelete(reply, () => db.delete(stalls).where(eq(stalls.id, sid)).returning())
      })

      // ----- tastings -----
      r.get('/icons', async () => ({ items: iconNames() }))
      r.get('/tastings', async (req) => {
        const stallId = Number((req.query as { stallId?: string }).stallId)
        const items = await db
          .select()
          .from(tastings)
          .where(stallId ? eq(tastings.stallId, stallId) : undefined)
          .orderBy(asc(tastings.id))
        return { items }
      })
      r.post('/tastings', async (req, reply) => {
        const body = parse(tastingCreate, req.body, reply)
        if (!body) return
        const [s] = await db.select({ id: stalls.id }).from(stalls).where(eq(stalls.id, body.stallId))
        if (!s) return invalid(reply, [{ path: 'stallId', message: 'stall not found' }])
        const [row] = await db.insert(tastings).values(body).returning()
        return reply.code(201).send(row)
      })
      r.patch('/tastings/:id', async (req, reply) => {
        const tid = paramId(req.params) ?? 0
        const body = parse(tastingBase.partial(), req.body, reply)
        if (!body) return
        const [row] = await db.update(tastings).set(body).where(eq(tastings.id, tid)).returning()
        if (!row) return reply.code(404).send({ error: 'not_found' })
        return row
      })
      r.delete('/tastings/:id', async (req, reply) => {
        const tid = paramId(req.params) ?? 0
        if ((await routesUsing(db, 'tasting', tid)).length) return reply.code(409).send({ error: 'in_use' })
        return tryDelete(reply, () => db.delete(tastings).where(eq(tastings.id, tid)).returning())
      })

      // ----- riddles -----
      r.get('/riddles', async (req) => {
        const stallId = Number((req.query as { stallId?: string }).stallId)
        const items = await db
          .select()
          .from(riddles)
          .where(stallId ? eq(riddles.stallId, stallId) : undefined)
          .orderBy(asc(riddles.id))
        return { items }
      })
      r.post('/riddles', async (req, reply) => {
        const body = parse(riddleCreate, req.body, reply)
        if (!body) return
        const [s] = await db.select({ id: stalls.id }).from(stalls).where(eq(stalls.id, body.stallId))
        if (!s) return invalid(reply, [{ path: 'stallId', message: 'stall not found' }])
        const [row] = await db.insert(riddles).values(body).returning()
        return reply.code(201).send(row)
      })
      r.patch('/riddles/:id', async (req, reply) => {
        const rid = paramId(req.params) ?? 0
        const body = parse(riddleBase.partial(), req.body, reply)
        if (!body) return
        const [row] = await db.update(riddles).set(body).where(eq(riddles.id, rid)).returning()
        if (!row) return reply.code(404).send({ error: 'not_found' })
        return row
      })
      r.delete('/riddles/:id', async (req, reply) => {
        const rid = paramId(req.params) ?? 0
        if ((await routesUsing(db, 'riddle', rid)).length) return reply.code(409).send({ error: 'in_use' })
        return tryDelete(reply, () => db.delete(riddles).where(eq(riddles.id, rid)).returning())
      })
      // Fills a template the way the game builder will. Without answers, uses the question set's
      // fallbacks as sample answers ("[slot]" where a question has no fallback).
      r.post('/riddles/preview', async (req, reply) => {
        const body = parse(
          z.object({
            template: z.string(),
            form: z.enum(FORMS),
            answers: z.record(z.string(), z.string()).optional(),
            questionSetId: id.nullable().optional(),
          }),
          req.body,
          reply,
        )
        if (!body) return
        let questions: Question[] = []
        if (body.questionSetId) {
          const [qs] = await db.select().from(questionSets).where(eq(questionSets.id, body.questionSetId))
          if (!qs) return invalid(reply, [{ path: 'questionSetId', message: 'question set not found' }])
          questions = qs.questions
        }
        // Sample answers: each question's fallback, and a placeholder for the name slots.
        const keep = [...nameSlots(body.form), 'company_name']
        const answers = body.answers ?? {
          ...Object.fromEntries(keep.map((k) => [k, `[${k}]`])),
          ...Object.fromEntries(questions.map((q) => [q.slot, fallbackFor(q, body.form) || `[${q.slot}]`])),
        }
        const slots = extractSlots(body.template)
        const known = new Set(questions.map((q) => q.slot))
        // The same riddle when the buyer answered nothing: personal lines fall back or are skipped.
        const bareAnswers = Object.fromEntries(keep.map((k) => [k, answers[k] || `[${k}]`]))
        return {
          ...fillTemplate(body.template, answers, questions, body.form),
          bare: fillTemplate(body.template, bareAnswers, questions, body.form).parts,
          lines: templateLines(body.template),
          slots,
          unknownSlots: body.questionSetId ? slots.filter((s) => !known.has(s)) : [],
          answers,
        }
      })
      r.post('/riddles/test-answer', async (req, reply) => {
        const body = parse(
          z.object({ answer: z.string(), accepted: z.array(z.string()).optional(), input: z.string() }),
          req.body,
          reply,
        )
        if (!body) return
        return matchAnswer(body.input, body.answer, body.accepted ?? [])
      })

      // ----- question sets -----
      r.get('/question-sets', async () => ({
        items: await db.select().from(questionSets).orderBy(asc(questionSets.id)),
      }))
      r.post('/question-sets', async (req, reply) => {
        const body = parse(questionSetBase.partial().extend({ name: str.min(1) }), req.body, reply)
        if (!body) return
        const [row] = await db.insert(questionSets).values(body).returning()
        return reply.code(201).send(row)
      })
      r.patch('/question-sets/:id', async (req, reply) => {
        const qid = paramId(req.params) ?? 0
        const body = parse(questionSetBase.partial(), req.body, reply)
        if (!body) return
        const [row] = await db.update(questionSets).set(body).where(eq(questionSets.id, qid)).returning()
        if (!row) return reply.code(404).send({ error: 'not_found' })
        return row
      })
      r.delete('/question-sets/:id', async (req, reply) => {
        const qid = paramId(req.params) ?? 0
        return tryDelete(reply, () => db.delete(questionSets).where(eq(questionSets.id, qid)).returning())
      })

      // ----- occasions -----
      const checkQuestionSet = async (qid: number | null | undefined) => {
        if (qid == null) return true
        const [qs] = await db
          .select({ id: questionSets.id })
          .from(questionSets)
          .where(eq(questionSets.id, qid))
        return !!qs
      }
      r.get('/occasions', async () => ({
        items: await db.select().from(occasions).orderBy(asc(occasions.sort), asc(occasions.id)),
      }))
      const checkRecipientSets = async (rec: OccasionRecipients | undefined) => {
        for (const qid of Object.values(rec ?? {})) if (!(await checkQuestionSet(qid))) return false
        return true
      }
      r.post('/occasions', async (req, reply) => {
        const parsed = parse(occasionCreate, req.body, reply)
        if (!parsed) return
        const body = withForms(parsed, parsed.audience)
        if (body === 'no_forms' || !body.forms?.length)
          return invalid(reply, [{ path: 'recipients', message: 'pick at least one recipient' }])
        if (!(await checkQuestionSet(body.questionSetId)) || !(await checkRecipientSets(body.recipients)))
          return invalid(reply, [{ path: 'questionSetId', message: 'question set not found' }])
        try {
          const [row] = await db
            .insert(occasions)
            .values({ ...body, forms: body.forms ?? [] })
            .returning()
          return reply.code(201).send(row)
        } catch (e) {
          if (isUniqueViolation(e)) return invalid(reply, [{ path: 'key', message: 'key already exists' }])
          throw e
        }
      })
      r.patch('/occasions/:id', async (req, reply) => {
        const oid = paramId(req.params) ?? 0
        const parsed = parse(occasionBase.partial(), req.body, reply)
        if (!parsed) return
        const [current] = await db.select().from(occasions).where(eq(occasions.id, oid))
        if (!current) return reply.code(404).send({ error: 'not_found' })
        const body = withForms(parsed, parsed.audience ?? current.audience)
        if (body === 'no_forms')
          return invalid(reply, [{ path: 'recipients', message: 'pick at least one recipient' }])
        if (!(await checkQuestionSet(body.questionSetId)) || !(await checkRecipientSets(body.recipients)))
          return invalid(reply, [{ path: 'questionSetId', message: 'question set not found' }])
        try {
          const [row] = await db.update(occasions).set(body).where(eq(occasions.id, oid)).returning()
          if (!row) return reply.code(404).send({ error: 'not_found' })
          return row
        } catch (e) {
          if (isUniqueViolation(e)) return invalid(reply, [{ path: 'key', message: 'key already exists' }])
          throw e
        }
      })
      r.delete('/occasions/:id', async (req, reply) => {
        const oid = paramId(req.params) ?? 0
        const [o] = await db.select().from(occasions).where(eq(occasions.id, oid))
        if (!o) return reply.code(404).send({ error: 'not_found' })
        const [used] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.occasionKey, o.key))
          .limit(1)
        if (used) return reply.code(409).send({ error: 'in_use' })
        return tryDelete(reply, () => db.delete(occasions).where(eq(occasions.id, oid)).returning())
      })

      // ----- routes -----
      const checkMarket = async (mid: number) => {
        const [m] = await db.select({ id: markets.id }).from(markets).where(eq(markets.id, mid))
        return !!m
      }
      r.get('/routes', async () => ({ items: await db.select().from(routes).orderBy(asc(routes.id)) }))
      r.post('/routes', async (req, reply) => {
        const body = parse(routeCreate, req.body, reply)
        if (!body) return
        if (!(await checkMarket(body.marketId)))
          return invalid(reply, [{ path: 'marketId', message: 'market not found' }])
        const issues = await validateStops(db, body.marketId, body.stops ?? [])
        if (issues.length) return invalid(reply, issues)
        const [row] = await db.insert(routes).values(body).returning()
        return reply.code(201).send(row)
      })
      r.patch('/routes/:id', async (req, reply) => {
        const rid = paramId(req.params) ?? 0
        const body = parse(routeBase.partial(), req.body, reply)
        if (!body) return
        const [cur] = await db.select().from(routes).where(eq(routes.id, rid))
        if (!cur) return reply.code(404).send({ error: 'not_found' })
        const marketId = body.marketId ?? cur.marketId
        if (!(await checkMarket(marketId)))
          return invalid(reply, [{ path: 'marketId', message: 'market not found' }])
        const issues = await validateStops(db, marketId, body.stops ?? cur.stops)
        if (issues.length) return invalid(reply, issues)
        const [row] = await db.update(routes).set(body).where(eq(routes.id, rid)).returning()
        return row
      })
      r.delete('/routes/:id', async (req, reply) => {
        const rid = paramId(req.params) ?? 0
        return tryDelete(reply, () => db.delete(routes).where(eq(routes.id, rid)).returning())
      })

      // ----- themes -----
      r.get('/themes', async () => ({
        items: await db.select().from(themes).orderBy(asc(themes.sort), asc(themes.id)),
      }))
      r.get('/maps', async () => ({ builtin: (await builtinMaps()).map((f) => `builtin:${f}`) }))
      r.post('/maps', async (req, reply) => {
        const file = await req.file()
        if (!file) return invalid(reply, [{ path: 'file', message: 'no file' }])
        const ext = MAP_TYPES[file.mimetype]
        if (!ext) {
          file.file.resume()
          return invalid(reply, [{ path: 'file', message: 'jpg, png or webp only' }])
        }
        const rel = `maps/${randomToken(12)}.${ext}`
        const dest = path.join(ctx.config.uploadDir, rel)
        await mkdir(path.dirname(dest), { recursive: true })
        await pipeline(file.file, createWriteStream(dest))
        if (file.file.truncated) {
          await unlink(dest)
          return reply.code(413).send({ error: 'too_large' })
        }
        await db.insert(uploads).values({ kind: 'map', originalPath: rel, path: rel })
        return reply.code(201).send({ mapFile: rel, url: `/uploads/${rel}` })
      })
      const checkTheme = async (t: {
        marketId: number
        mapFile: string
        pins?: Record<string, unknown>
        palette: z.infer<typeof palette>
        style?: z.infer<typeof themeStyle>
        occasionKeys?: string[]
      }) => {
        // The look must read everywhere in the game, with its fixed colors.
        const issues: Issue[] = paletteIssues(t.palette, t.style ?? {}).map((i) => ({
          path: 'palette',
          message: `ניגודיות נמוכה מדי: ${i.check} (${i.ratio}:1, צריך ${i.min}:1)`,
        }))
        if (t.style?.icons && !existsSync(path.join(builtinIconsDir, t.style.icons)))
          issues.push({ path: 'style.icons', message: 'icon set not found' })
        if (t.occasionKeys?.length) {
          const known = new Set((await db.select({ key: occasions.key }).from(occasions)).map((o) => o.key))
          for (const k of t.occasionKeys)
            if (!known.has(k)) issues.push({ path: 'occasionKeys', message: `unknown occasion ${k}` })
        }
        if (!(await checkMarket(t.marketId))) issues.push({ path: 'marketId', message: 'market not found' })
        else if (t.pins) issues.push(...(await validatePins(db, t.marketId, t.pins)))
        if (!(await mapExists(ctx, t.mapFile)))
          issues.push({ path: 'mapFile', message: 'map file not found' })
        return issues
      }
      r.post('/themes', async (req, reply) => {
        const body = parse(themeCreate, req.body, reply)
        if (!body) return
        const issues = await checkTheme(body)
        if (issues.length) return invalid(reply, issues)
        const [row] = await db.insert(themes).values(body).returning()
        return reply.code(201).send(row)
      })
      r.patch('/themes/:id', async (req, reply) => {
        const tid = paramId(req.params) ?? 0
        const body = parse(themeBase.partial(), req.body, reply)
        if (!body) return
        const [cur] = await db.select().from(themes).where(eq(themes.id, tid))
        if (!cur) return reply.code(404).send({ error: 'not_found' })
        const issues = await checkTheme({ ...cur, ...body })
        if (issues.length) return invalid(reply, issues)
        const [row] = await db.update(themes).set(body).where(eq(themes.id, tid)).returning()
        return row
      })
      r.delete('/themes/:id', async (req, reply) => {
        const tid = paramId(req.params) ?? 0
        return tryDelete(reply, () => db.delete(themes).where(eq(themes.id, tid)).returning())
      })

      // ----- palettes -----
      // A palette must stay readable everywhere in the game (domain/look.ts) and name real themes.
      const checkPalette = async (p: { palette: z.infer<typeof palette>; themeIds?: number[] }) => {
        const issues: Issue[] = paletteIssues(p.palette).map((i) => ({
          path: 'palette',
          message: `ניגודיות נמוכה מדי: ${i.check} (${i.ratio}:1, צריך ${i.min}:1)`,
        }))
        const ids = [...new Set(p.themeIds ?? [])]
        if (ids.length) {
          const found = await db.select({ id: themes.id }).from(themes).where(inArray(themes.id, ids))
          if (found.length !== ids.length) issues.push({ path: 'themeIds', message: 'theme not found' })
        }
        return issues
      }
      r.get('/palettes', async () => ({
        items: await db.select().from(palettes).orderBy(asc(palettes.sort), asc(palettes.id)),
      }))
      r.post('/palettes', async (req, reply) => {
        const body = parse(paletteCreate, req.body, reply)
        if (!body) return
        const issues = await checkPalette(body)
        if (issues.length) return invalid(reply, issues)
        const [row] = await db.insert(palettes).values(body).returning()
        return reply.code(201).send(row)
      })
      r.patch('/palettes/:id', async (req, reply) => {
        const pid = paramId(req.params) ?? 0
        const body = parse(paletteBase.partial(), req.body, reply)
        if (!body) return
        const [cur] = await db.select().from(palettes).where(eq(palettes.id, pid))
        if (!cur) return reply.code(404).send({ error: 'not_found' })
        const issues = await checkPalette({ ...cur, ...body })
        if (issues.length) return invalid(reply, issues)
        const [row] = await db.update(palettes).set(body).where(eq(palettes.id, pid)).returning()
        return row
      })
      // Orders that chose a deleted palette fall back to the theme's own (FK on delete set null);
      // games already built keep their snapshot.
      r.delete('/palettes/:id', async (req, reply) => {
        const pid = paramId(req.params) ?? 0
        return tryDelete(reply, () => db.delete(palettes).where(eq(palettes.id, pid)).returning())
      })

      // ----- settings -----
      r.get('/settings', async () => ({ items: await db.select().from(settings).orderBy(asc(settings.key)) }))
      r.put('/settings/:key', async (req, reply) => {
        const key = settingKey.safeParse((req.params as { key: string }).key)
        if (!key.success) return invalid(reply, [{ path: 'key', message: key.error.issues[0].message }])
        const body = parse(z.object({ value: z.json() }), req.body, reply)
        if (!body) return
        if (body.value === undefined) return invalid(reply, [{ path: 'value', message: 'required' }])
        const value = body.value
        const [row] = await db
          .insert(settings)
          .values({ key: key.data, value })
          .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
          .returning()
        return row
      })
      r.delete('/settings/:key', async (req, reply) => {
        const key = (req.params as { key: string }).key
        return tryDelete(reply, () => db.delete(settings).where(eq(settings.key, key)).returning())
      })
    },
    { prefix: '/admin/api/catalog' },
  )
}
