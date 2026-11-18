// Site API: catalog for the order flow, creating and paying orders, the manage link, leads.
import { and, asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import { gameStates, leads, markets, occasions, orders, redemptions, routes, themes } from '../db/schema.ts'
import { ALLERGENS, DIETS, FORMS, type Form } from '../domain/types.ts'
import { links, qrPng } from '../services/delivery.ts'
import { buildOrderGame, createOrder, questionsForOccasion } from '../services/orders.ts'
import { afterBuilt, handleNotify, PaymentError, priceFor, startPayment } from '../services/payments.ts'
import { fileUrl } from '../services/play.ts'
import { getSetting } from '../services/settings.ts'

const phone = z.string().regex(/^[0-9+\-\s]{9,16}$/)
const letterNote = z.object({ text: z.string().max(600), signature: z.string().max(60) })

export async function publicOrderRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config, services } = ctx
  const base = config.publicBaseUrl

  app.get('/api/shop', async () => {
    const [occ, th, rt, mk] = await Promise.all([
      db.select().from(occasions).where(eq(occasions.active, true)).orderBy(asc(occasions.sort)),
      db.select().from(themes).where(eq(themes.active, true)).orderBy(asc(themes.sort)),
      db.select().from(routes).where(eq(routes.active, true)),
      db
        .select({ id: markets.id, name: markets.name, hours: markets.hours })
        .from(markets)
        .where(eq(markets.active, true)),
    ])
    return {
      brand: await getSetting(db, 'brand_name'),
      occasions: occ.map((o) => ({ key: o.key, label: o.label, audience: o.audience, forms: o.forms })),
      markets: mk,
      themes: th.map((t) => ({
        id: t.id,
        name: t.name,
        marketId: t.marketId,
        map: fileUrl(t.mapFile),
        palette: t.palette,
      })),
      routes: rt.map((r) => ({ id: r.id, marketId: r.marketId, name: r.name, stops: r.stops.length })),
      prices: await getSetting(db, 'prices'),
      minPeople: await getSetting(db, 'min_people'),
      maxPeople: await getSetting(db, 'max_people'),
      allergens: ALLERGENS,
      diets: DIETS,
      cardEnabled: services.tranzila.isConfigured(),
    }
  })

  app.get('/api/shop/questions', async (req, reply) => {
    const q = z.object({ occasion: z.string(), form: z.enum(FORMS) }).safeParse(req.query)
    if (!q.success) return reply.code(400).send({ error: 'invalid' })
    const questions = await questionsForOccasion(db, q.data.occasion)
    return { questions: publicQuestions(questions, q.data.form) }
  })

  const orderBody = z.object({
    occasionKey: z.string().min(1),
    form: z.enum(['she', 'he', 'couple']),
    honoreeName: z.string().trim().min(1).max(40),
    themeId: z.number().int(),
    people: z.number().int(),
    allergens: z.array(z.enum(ALLERGENS)).default([]),
    diets: z.array(z.enum(DIETS)).default([]),
    answers: z.record(z.string(), z.string().max(300)).default({}),
    letterNotes: z.array(letterNote).max(10).default([]),
    answersLater: z.boolean().default(false),
    buyer: z.object({ name: z.string().trim().min(1).max(60), phone, email: z.string().email().max(120) }),
  })

  app.post(
    '/api/orders',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const parsed = orderBody.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid', issues: parsed.error.issues })
      const b = parsed.data
      const [occ] = await db.select().from(occasions).where(eq(occasions.key, b.occasionKey))
      if (!occ?.active || occ.audience !== 'private') return reply.code(400).send({ error: 'bad_occasion' })
      if (!occ.forms.includes(b.form)) return reply.code(400).send({ error: 'bad_form' })
      const [min, max] = [await getSetting(db, 'min_people'), await getSetting(db, 'max_people')]
      if (b.people < min || b.people > max) return reply.code(400).send({ error: 'bad_people' })
      const [theme] = await db
        .select()
        .from(themes)
        .where(and(eq(themes.id, b.themeId), eq(themes.active, true)))
      if (!theme) return reply.code(400).send({ error: 'bad_theme' })
      const [route] = await db
        .select()
        .from(routes)
        .where(and(eq(routes.marketId, theme.marketId), eq(routes.active, true)))
        .orderBy(asc(routes.id))
      if (!route) return reply.code(400).send({ error: 'no_route' })
      const price = await priceFor(db, b.occasionKey, b.people)
      if (!price) return reply.code(400).send({ error: 'no_price' })
      const questions = await questionsForOccasion(db, b.occasionKey)
      const answers = cleanAnswers(b.answers, questions)

      const order = await createOrder(db, {
        kind: 'private',
        status: 'pending_payment',
        occasionKey: b.occasionKey,
        form: b.form,
        honoreeName: b.honoreeName,
        themeId: theme.id,
        routeId: route.id,
        people: b.people,
        allergens: b.allergens,
        diets: b.diets,
        answers,
        letterNotes: b.letterNotes.filter((n) => n.text.trim()),
        buyerName: b.buyer.name,
        buyerPhone: b.buyer.phone,
        buyerEmail: b.buyer.email,
        priceAgorot: price,
      })
      if (!b.answersLater)
        await db.update(orders).set({ answersSubmittedAt: new Date() }).where(eq(orders.id, order.id))
      return { orderNo: order.orderNo, manageToken: order.manageToken, amountAgorot: price }
    },
  )

  app.post(
    '/api/orders/:token/pay',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
      const [order] = await db.select().from(orders).where(eq(orders.manageToken, token))
      if (!order) return reply.code(404).send({ error: 'not_found' })
      try {
        return await startPayment(db, services, base, order)
      } catch (e) {
        if (e instanceof PaymentError)
          return reply.code(e.code === 'init_failed' ? 502 : 400).send({ error: e.code })
        throw e
      }
    },
  )

  app.post('/api/payment/tranzila/notify', async (req) => {
    await handleNotify(
      db,
      services,
      ctx.sweeper ?? null,
      (req.body ?? {}) as Record<string, unknown>,
      (req.query ?? {}) as Record<string, unknown>,
    )
    return { ok: true }
  })
  // Tranzila returns the pay window by POST; bounce it to a GET of the same page.
  app.post('/pay/done', async (req, reply) => reply.redirect(req.url, 303))

  app.get('/api/manage/:token', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
    const [order] = await db.select().from(orders).where(eq(orders.manageToken, token))
    if (!order) return reply.code(404).send({ error: 'not_found' })
    const [state] = await db.select().from(gameStates).where(eq(gameStates.orderId, order.id))
    const used = await db.select().from(redemptions).where(eq(redemptions.orderId, order.id))
    const playable = ['ready', 'active', 'done'].includes(order.status)
    const needsAnswers = !order.answersSubmittedAt && order.kind === 'private'
    return {
      orderNo: order.orderNo,
      kind: order.kind,
      status: order.status,
      paid: !!order.paidAt,
      honoree: order.companyName || order.honoreeName,
      form: order.form,
      occasionKey: order.occasionKey,
      people: order.people,
      amountAgorot: order.priceAgorot,
      validUntil: order.validUntil,
      gameLink: playable ? links(base, order).gameLink : null,
      qr: playable ? `/api/qr/${order.gameToken}.png` : null,
      progress: state
        ? {
            step: state.step,
            stopIndex: state.stopIndex,
            total: order.game?.stops.length ?? 0,
            redeemed: used.length,
          }
        : null,
      needsAnswers,
      answers: needsAnswers ? order.answers : undefined,
      questions: needsAnswers
        ? publicQuestions(await questionsForOccasion(db, order.occasionKey), order.form)
        : undefined,
    }
  })

  app.put('/api/manage/:token/answers', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
    const body = z
      .object({
        answers: z.record(z.string(), z.string().max(300)),
        letterNotes: z.array(letterNote).max(10).default([]),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid' })
    const [order] = await db.select().from(orders).where(eq(orders.manageToken, token))
    if (!order) return reply.code(404).send({ error: 'not_found' })
    if (order.answersSubmittedAt || order.kind !== 'private')
      return reply.code(409).send({ error: 'already_submitted' })
    const questions = await questionsForOccasion(db, order.occasionKey)
    await db
      .update(orders)
      .set({
        answers: cleanAnswers(body.data.answers, questions),
        letterNotes: body.data.letterNotes.filter((n) => n.text.trim()),
        answersSubmittedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
    if (order.paidAt) {
      const built = await buildOrderGame(db, order.id)
      await afterBuilt(db, services, base, built)
      return { status: built.status }
    }
    return { status: order.status }
  })

  app.get('/api/qr/:file', async (req, reply) => {
    const { file } = z.object({ file: z.string().regex(/^[A-Za-z0-9_-]{10,64}\.png$/) }).parse(req.params)
    const token = file.slice(0, -4)
    const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.gameToken, token))
    if (!order) return reply.code(404).send({ error: 'not_found' })
    reply.header('content-type', 'image/png').header('cache-control', 'private, max-age=86400')
    return qrPng(`${base}/g/${token}`)
  })

  app.post(
    '/api/leads',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = z
        .object({
          companyName: z.string().trim().min(1).max(80),
          contactName: z.string().trim().min(1).max(60),
          phone: phone,
          email: z.string().email().max(120),
          occasionKey: z.string().max(40).optional(),
          people: z.number().int().min(1).max(500).optional(),
          preferredDate: z.string().max(40).default(''),
          message: z.string().max(2000).default(''),
        })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues })
      const [lead] = await db.insert(leads).values(body.data).returning({ id: leads.id })
      return { ok: true, id: lead.id }
    },
  )
}

function publicQuestions(questions: Awaited<ReturnType<typeof questionsForOccasion>>, form: Form) {
  return questions
    .filter((q) => q.slot !== 'name')
    .map((q) => ({
      slot: q.slot,
      text: q.text[form] ?? q.text.she ?? Object.values(q.text)[0] ?? q.slot,
      required: q.required,
      maxLen: q.maxLen,
    }))
}

/** Keeps only known slots, trimmed and cut to each question's max length. */
function cleanAnswers(
  answers: Record<string, string>,
  questions: Awaited<ReturnType<typeof questionsForOccasion>>,
) {
  const out: Record<string, string> = {}
  for (const q of questions) {
    const v = (answers[q.slot] ?? '').trim()
    if (v) out[q.slot] = q.maxLen > 0 ? [...v].slice(0, q.maxLen * 2).join('') : v
  }
  return out
}
