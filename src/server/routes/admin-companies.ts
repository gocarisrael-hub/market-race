// Admin: company leads, quotes (company orders), company answers, logo + palette, payment links.
import { createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { and, desc, eq, gt, max } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import { leads, messages, occasions, orders, routes, themes, uploads } from '../db/schema.ts'
import type { Palette } from '../domain/types.ts'
import { requireOwner } from '../lib/auth.ts'
import { randomToken } from '../lib/tokens.ts'
import { links, sendToBuyer } from '../services/delivery.ts'
import { paletteFromLogo } from '../services/logo.ts'
import { BuildError, buildOrderGame, createOrder, getOrder, type Order } from '../services/orders.ts'
import { afterBuilt } from '../services/payments.ts'
import { EDITABLE } from './admin-orders.ts'

const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const idParam = z.object({ id: z.coerce.number().int() })
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, '#RRGGBB')
const palette = z.object({
  background: hex,
  accent: hex,
  accent2: hex.optional(),
  ink: hex,
  paper: hex,
  dark: z.boolean().optional(),
})
const letterNote = z.object({ text: z.string().max(600), signature: z.string().max(60) })
const LEAD_STATUSES = ['new', 'quoted', 'won', 'lost'] as const

const quoteBody = z.object({
  occasionKey: z.string().min(1),
  people: z.number().int().min(1).max(500),
  priceAgorot: z.number().int().min(1),
  themeId: z.number().int(),
  routeId: z.number().int(),
  companyName: z.string().trim().min(1).max(80).optional(),
})

const companyPatch = z.object({
  companyName: z.string().trim().min(1).max(80).optional(),
  occasionKey: z.string().min(1).optional(),
  people: z.number().int().min(1).max(500).optional(),
  priceAgorot: z.number().int().min(1).optional(),
  themeId: z.number().int().optional(),
  routeId: z.number().int().optional(),
  buyerName: z.string().trim().max(60).optional(),
  buyerPhone: z.string().trim().max(20).optional(),
  buyerEmail: z.union([z.literal(''), z.string().email().max(120)]).optional(),
  companyPalette: palette.nullable().optional(),
})

const FALLBACK_THEME: Palette = { background: '#FFFFFF', paper: '#FFFFFF', accent: '#000000', ink: '#000000' }

export async function adminCompanyRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx
  const base = ctx.config.publicBaseUrl

  const bad = (reply: FastifyReply, error: string, code = 400) => reply.code(code).send({ error })

  /** Checks occasion (company audience), theme and route (same market). Returns an error or null. */
  async function checkCompanySetup(o: { occasionKey: string; themeId: number; routeId: number }) {
    const [occ] = await db.select().from(occasions).where(eq(occasions.key, o.occasionKey))
    if (occ?.audience !== 'company') return 'bad_occasion'
    const [theme] = await db.select().from(themes).where(eq(themes.id, o.themeId))
    const [route] = await db.select().from(routes).where(eq(routes.id, o.routeId))
    if (!theme || !route) return 'bad_theme_or_route'
    if (theme.marketId !== route.marketId) return 'theme_route_market_mismatch'
    return null
  }

  async function companyOrder(id: number, reply: FastifyReply): Promise<Order | null> {
    const order = await getOrder(db, id)
    if (!order) {
      bad(reply, 'not_found', 404)
      return null
    }
    if (order.kind !== 'company') {
      bad(reply, 'not_company')
      return null
    }
    return order
  }

  await app.register(async (r) => {
    r.addHook('preHandler', requireOwner(db))

    // ----- leads -----
    r.get('/admin/api/leads', async (req) => {
      const q = z.object({ status: z.enum(LEAD_STATUSES).optional() }).parse(req.query)
      const rows = await db
        .select({
          lead: leads,
          orderNo: orders.orderNo,
          orderStatus: orders.status,
          paidAt: orders.paidAt,
        })
        .from(leads)
        .leftJoin(orders, eq(orders.id, leads.orderId))
        .where(q.status ? eq(leads.status, q.status) : undefined)
        .orderBy(desc(leads.createdAt), desc(leads.id))
        .limit(500)
      return {
        items: rows.map((x) => ({
          ...x.lead,
          order: x.orderNo ? { orderNo: x.orderNo, status: x.orderStatus, paid: !!x.paidAt } : null,
        })),
      }
    })

    r.patch('/admin/api/leads/:id', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const body = z
        .object({ status: z.enum(LEAD_STATUSES).optional(), notes: z.string().max(5000).optional() })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues })
      const [row] = await db.update(leads).set(body.data).where(eq(leads.id, id)).returning()
      if (!row) return bad(reply, 'not_found', 404)
      return row
    })

    // A quote = a company order in `quoted`, linked to the lead. The buyer is the lead's contact.
    r.post('/admin/api/leads/:id/quote', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const body = quoteBody.safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues })
      const [lead] = await db.select().from(leads).where(eq(leads.id, id))
      if (!lead) return bad(reply, 'not_found', 404)
      if (lead.orderId) return bad(reply, 'already_quoted', 409)
      const b = body.data
      const err = await checkCompanySetup(b)
      if (err) return bad(reply, err)
      const order = await createOrder(db, {
        kind: 'company',
        status: 'quoted',
        form: 'company',
        occasionKey: b.occasionKey,
        people: b.people,
        priceAgorot: b.priceAgorot,
        themeId: b.themeId,
        routeId: b.routeId,
        companyName: b.companyName ?? lead.companyName,
        honoreeName: '',
        buyerName: lead.contactName,
        buyerPhone: lead.phone,
        buyerEmail: lead.email,
      })
      await db.update(leads).set({ orderId: order.id, status: 'quoted' }).where(eq(leads.id, id))
      return reply.code(201).send({ order, links: links(base, order) })
    })

    // ----- company order -----
    r.patch('/admin/api/orders/:id/company', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const body = companyPatch.safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues })
      const order = await companyOrder(id, reply)
      if (!order) return
      if (!(EDITABLE as readonly string[]).includes(order.status))
        return bad(reply, `order is ${order.status}; a started game is frozen`)
      const b = body.data
      const pricing = b.people !== undefined || b.priceAgorot !== undefined || b.occasionKey !== undefined
      if (pricing && order.paidAt) return bad(reply, 'already_paid')
      const next = {
        occasionKey: b.occasionKey ?? order.occasionKey,
        themeId: b.themeId ?? order.themeId ?? 0,
        routeId: b.routeId ?? order.routeId ?? 0,
      }
      if (b.occasionKey || b.themeId || b.routeId) {
        const err = await checkCompanySetup(next)
        if (err) return bad(reply, err)
      }
      const [row] = await db.update(orders).set(b).where(eq(orders.id, id)).returning()
      return { order: row }
    })

    // The owner fills the company questions with the company. `done` marks the answers final;
    // a paid order is then built and delivered.
    r.put('/admin/api/orders/:id/company-answers', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const body = z
        .object({
          answers: z.record(z.string(), z.string().max(300)),
          letterNotes: z.array(letterNote).max(10).default([]),
          done: z.boolean().default(false),
        })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues })
      const order = await companyOrder(id, reply)
      if (!order) return
      if (!(EDITABLE as readonly string[]).includes(order.status))
        return bad(reply, `order is ${order.status}; a started game is frozen`)
      const answers: Record<string, string> = {}
      for (const [k, v] of Object.entries(body.data.answers)) if (v.trim()) answers[k] = v.trim()
      const submitted = order.answersSubmittedAt ?? (body.data.done ? new Date() : null)
      let row = (
        await db
          .update(orders)
          .set({
            answers,
            letterNotes: body.data.letterNotes.filter((n) => n.text.trim()),
            answersSubmittedAt: submitted,
          })
          .where(eq(orders.id, id))
          .returning()
      )[0]
      if (
        row.paidAt &&
        row.answersSubmittedAt &&
        ['awaiting_answers', 'review', 'ready'].includes(row.status)
      ) {
        try {
          row = await buildOrderGame(db, id)
        } catch (e) {
          if (e instanceof BuildError) return bad(reply, e.message)
          throw e
        }
        if (row.status === 'ready') await afterBuilt(db, ctx.services, base, row)
        row = (await getOrder(db, id)) ?? row
      }
      return { order: row }
    })

    // Logo upload: stored on the volume, palette extracted from it (owner can override later).
    r.post('/admin/api/orders/:id/logo', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const order = await companyOrder(id, reply)
      if (!order) return
      if (!(EDITABLE as readonly string[]).includes(order.status))
        return bad(reply, `order is ${order.status}; a started game is frozen`)
      const file = await req.file()
      if (!file) return bad(reply, 'no_file')
      const ext = LOGO_TYPES[file.mimetype]
      if (!ext) {
        file.file.resume()
        return bad(reply, 'png, jpg or webp only')
      }
      const rel = `logos/${randomToken(12)}.${ext}`
      const dest = path.join(ctx.config.uploadDir, rel)
      await mkdir(path.dirname(dest), { recursive: true })
      await pipeline(file.file, createWriteStream(dest))
      if (file.file.truncated) {
        await unlink(dest)
        return bad(reply, 'too_large', 413)
      }
      const [theme] = order.themeId ? await db.select().from(themes).where(eq(themes.id, order.themeId)) : []
      let extracted: Awaited<ReturnType<typeof paletteFromLogo>>
      try {
        extracted = await paletteFromLogo(dest, theme?.palette ?? FALLBACK_THEME)
      } catch {
        await unlink(dest)
        return bad(reply, 'bad_image')
      }
      await db.insert(uploads).values({ orderId: id, kind: 'logo', originalPath: rel, path: rel })
      const [row] = await db
        .update(orders)
        .set({ companyLogo: rel, companyPalette: extracted.palette })
        .where(eq(orders.id, id))
        .returning()
      return { order: row, url: `/uploads/${rel}`, palette: extracted.palette, swatches: extracted.swatches }
    })

    // The payment link for a quoted company order; optionally sent to the contact.
    r.post('/admin/api/orders/:id/payment-link', async (req, reply) => {
      const { id } = idParam.parse(req.params)
      const body = z.object({ send: z.boolean().default(false) }).safeParse(req.body ?? {})
      if (!body.success) return reply.code(400).send({ error: 'invalid' })
      const order = await companyOrder(id, reply)
      if (!order) return
      if (order.paidAt) return bad(reply, 'already_paid')
      if (!['quoted', 'pending_payment'].includes(order.status)) return bad(reply, 'not_payable')
      if (!(order.priceAgorot > 0)) return bad(reply, 'no_price')
      const url = links(base, order).payLink
      if (!body.data.send) return { url, messages: [] }
      if (!order.buyerEmail && !order.buyerPhone) return bad(reply, 'no_contact')
      const [{ last }] = await db
        .select({ last: max(messages.id) })
        .from(messages)
        .where(eq(messages.orderId, id))
      await sendToBuyer(db, ctx.services, base, order, 'company_payment_link')
      const sent = await db
        .select()
        .from(messages)
        .where(and(eq(messages.orderId, id), gt(messages.id, last ?? 0)))
      return { url, messages: sent }
    })
  })
}
