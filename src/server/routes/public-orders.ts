// Site API: catalog for the order flow, creating and paying orders, the manage link, leads.
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppContext } from '../app.ts'
import {
  gameStates,
  leads,
  markets,
  occasions,
  orders,
  redemptions,
  routes,
  stalls,
  tastings,
  themes,
} from '../db/schema.ts'
import { previewRoute } from '../domain/builder.ts'
import { ALLERGENS, DIETS, FORMS, type Form } from '../domain/types.ts'
import { iconUrl } from '../lib/icons.ts'
import { cardEnabled } from '../services/context.ts'
import { links, qrPng } from '../services/delivery.ts'
import { buildOrderGame, createOrder, questionsForOccasion } from '../services/orders.ts'
import { afterBuilt, handleNotify, PaymentError, priceFor, startPayment } from '../services/payments.ts'
import { completeMockPayment, mockPaymentInfo } from '../services/payments-mock.ts'
import { checkPelecardReturn, handlePelecardCallback } from '../services/payments-pelecard.ts'
import { fileUrl } from '../services/play.ts'
import { getSetting } from '../services/settings.ts'
import { PHOTOS_EDITABLE } from './public-photos.ts'

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
      // What buyers taste on each route, in route order. Never stall or tasting names, riddles or
      // catalog ids: the stalls are the riddles' answers.
      routes: await Promise.all(
        rt.map(async (r) => {
          const byId = new Map((await routeTastings(r.marketId)).map((t) => [t.id, t]))
          return {
            id: r.id,
            marketId: r.marketId,
            name: r.name,
            stops: r.stops.length,
            tastings: r.stops.map((stop, i) => {
              const t = byId.get(stop.tastingId)
              return {
                teaser: t?.teaser ?? '',
                icon: iconUrl(t?.teaserIcon),
                allergens: t?.allergens ?? [],
                diets: t?.diets ?? [],
                finale: i === r.stops.length - 1,
              }
            }),
          }
        }),
      ),
      prices: await getSetting(db, 'prices'),
      minPeople: await getSetting(db, 'min_people'),
      maxPeople: await getSetting(db, 'max_people'),
      allergens: ALLERGENS,
      diets: DIETS,
      cardEnabled: cardEnabled(services),
      cardProvider: services.paymentProvider,
    }
  })

  async function routeTastings(marketId: number) {
    const ids = (await db.select({ id: stalls.id }).from(stalls).where(eq(stalls.marketId, marketId))).map(
      (s) => s.id,
    )
    return ids.length ? db.select().from(tastings).where(inArray(tastings.stallId, ids)) : []
  }

  /** The route an order for this theme gets (same choice as draftValues). */
  async function routeForTheme(themeId: number) {
    const [theme] = await db
      .select()
      .from(themes)
      .where(and(eq(themes.id, themeId), eq(themes.active, true)))
    if (!theme) return { theme: undefined, route: undefined }
    const [route] = await db
      .select()
      .from(routes)
      .where(and(eq(routes.marketId, theme.marketId), eq(routes.active, true)))
      .orderBy(asc(routes.id))
    return { theme, route }
  }

  // Per stop, what the buyer's group will taste given their allergens and diets. Same safety logic
  // as building the game. No names or ids; a blocked stop goes to the owner's review after payment.
  const list = <T extends readonly [string, ...string[]]>(values: T) =>
    z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(values)))
  const previewQuery = z.object({
    themeId: z.coerce.number().int().positive(),
    allergens: list(ALLERGENS),
    diets: list(DIETS),
  })
  app.get(
    '/api/shop/route-preview',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const q = previewQuery.safeParse(req.query)
      if (!q.success) return reply.code(400).send({ error: 'invalid' })
      const { route } = await routeForTheme(q.data.themeId)
      if (!route) return reply.code(404).send({ error: 'no_route' })
      const [marketStalls, marketTastings] = await Promise.all([
        db.select().from(stalls).where(eq(stalls.marketId, route.marketId)),
        routeTastings(route.marketId),
      ])
      const preview = previewRoute({
        stops: route.stops,
        stalls: marketStalls,
        tastings: marketTastings,
        allergens: q.data.allergens,
        diets: q.data.diets,
      })
      return {
        stops: preview.map((p) => ({
          teaser: p.tasting?.teaser ?? '',
          icon: iconUrl(p.tasting?.teaserIcon),
          finale: p.finale,
          status: p.status,
        })),
      }
    },
  )

  app.get('/api/shop/questions', async (req, reply) => {
    const q = z.object({ occasion: z.string(), form: z.enum(FORMS) }).safeParse(req.query)
    if (!q.success) return reply.code(400).send({ error: 'invalid' })
    const questions = await questionsForOccasion(db, q.data.occasion)
    return { questions: publicQuestions(questions, q.data.form) }
  })

  const buyerBody = z.object({
    name: z.string().trim().min(1).max(60),
    phone,
    email: z.string().email().max(120),
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
    // Optional when the order is created: the site creates it before the last step (photos need
    // the manage token) and adds the buyer with PUT /api/orders/:token. Pay requires it.
    buyer: buyerBody.optional(),
  })

  /** Validates an order body against the catalog. Returns the row values or an error code. */
  async function draftValues(body: unknown) {
    const parsed = orderBody.safeParse(body)
    if (!parsed.success) return { error: 'invalid', issues: parsed.error.issues } as const
    const b = parsed.data
    const [occ] = await db.select().from(occasions).where(eq(occasions.key, b.occasionKey))
    if (!occ?.active || occ.audience !== 'private') return { error: 'bad_occasion' } as const
    if (!occ.forms.includes(b.form)) return { error: 'bad_form' } as const
    const [min, max] = [await getSetting(db, 'min_people'), await getSetting(db, 'max_people')]
    if (b.people < min || b.people > max) return { error: 'bad_people' } as const
    const { theme, route } = await routeForTheme(b.themeId)
    if (!theme) return { error: 'bad_theme' } as const
    if (!route) return { error: 'no_route' } as const
    const price = await priceFor(db, b.occasionKey, b.people)
    if (!price) return { error: 'no_price' } as const
    const questions = await questionsForOccasion(db, b.occasionKey)
    return {
      answersLater: b.answersLater,
      buyer: b.buyer,
      values: {
        occasionKey: b.occasionKey,
        form: b.form,
        honoreeName: b.honoreeName,
        themeId: theme.id,
        routeId: route.id,
        people: b.people,
        allergens: b.allergens,
        diets: b.diets,
        answers: cleanAnswers(b.answers, questions),
        letterNotes: b.letterNotes.filter((n) => n.text.trim()),
        priceAgorot: price,
      },
    } as const
  }

  app.post(
    '/api/orders',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const d = await draftValues(req.body)
      if ('error' in d) return reply.code(400).send(d)
      const order = await createOrder(db, {
        kind: 'private',
        status: 'pending_payment',
        ...d.values,
        buyerName: d.buyer?.name ?? '',
        buyerPhone: d.buyer?.phone ?? '',
        buyerEmail: d.buyer?.email ?? '',
      })
      if (!d.answersLater)
        await db.update(orders).set({ answersSubmittedAt: new Date() }).where(eq(orders.id, order.id))
      return { orderNo: order.orderNo, manageToken: order.manageToken, amountAgorot: order.priceAgorot }
    },
  )

  // The site edits an unpaid private order while the buyer goes back and forth between steps.
  // Safe after a pay window opened: a charge only settles when the order is still the same purchase.
  app.put(
    '/api/orders/:token',
    { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
      const [order] = await db.select().from(orders).where(eq(orders.manageToken, token))
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (order.kind !== 'private' || order.paidAt || order.status !== 'pending_payment')
        return reply.code(409).send({ error: 'not_editable' })
      const raw = (req.body ?? {}) as Record<string, unknown>
      if (!('occasionKey' in raw)) {
        // Buyer details only (the last step of the site).
        const b = z.object({ buyer: buyerBody }).safeParse(raw)
        if (!b.success) return reply.code(400).send({ error: 'invalid', issues: b.error.issues })
        const { name, phone: buyerPhone, email } = b.data.buyer
        await db
          .update(orders)
          .set({ buyerName: name, buyerPhone, buyerEmail: email })
          .where(eq(orders.id, order.id))
        return { orderNo: order.orderNo, manageToken: order.manageToken, amountAgorot: order.priceAgorot }
      }
      const d = await draftValues(raw)
      if ('error' in d) return reply.code(400).send(d)
      await db
        .update(orders)
        .set({
          ...d.values,
          ...(d.buyer
            ? { buyerName: d.buyer.name, buyerPhone: d.buyer.phone, buyerEmail: d.buyer.email }
            : {}),
          answersSubmittedAt: d.answersLater ? null : (order.answersSubmittedAt ?? new Date()),
        })
        .where(eq(orders.id, order.id))
      return { orderNo: order.orderNo, manageToken: order.manageToken, amountAgorot: d.values.priceAgorot }
    },
  )

  app.post(
    '/api/orders/:token/pay',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
      const [order] = await db.select().from(orders).where(eq(orders.manageToken, token))
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (order.kind === 'private' && !(order.buyerEmail && order.buyerPhone && order.buyerName))
        return reply.code(400).send({ error: 'no_buyer' })
      try {
        return await startPayment(db, services, base, order)
      } catch (e) {
        if (e instanceof PaymentError)
          return reply.code(e.code === 'init_failed' ? 502 : 400).send({ error: e.code })
        throw e
      }
    },
  )

  // PeleCard server-side feedback. Untrusted body; settles only after re-fetching the transaction.
  app.post('/api/payment/pelecard/callback', async (req, reply) => {
    const outcome = await handlePelecardCallback(
      db,
      services,
      base,
      (req.body ?? {}) as Record<string, unknown>,
    )
    if (outcome === 'retry') return reply.code(502).send({ error: 'verification failed' })
    return { ok: true }
  })

  // Mock payment (staging only): the page reads the window, then completes it.
  app.get('/api/payment/mock/:token', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
    const info = await mockPaymentInfo(db, services, token)
    if (!info) return reply.code(404).send({ error: 'not_found' })
    return info
  })
  app.post('/api/payment/mock/complete', async (req, reply) => {
    const body = z.object({ token: z.string().min(10).max(64) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid' })
    const done = await completeMockPayment(db, services, base, body.data.token)
    if (!done) return reply.code(404).send({ error: 'not_found' })
    return { ok: true, redirect: `/pay/done?o=${encodeURIComponent(done.manageToken)}` }
  })

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
    // Back from a PeleCard window and still unpaid: ask PeleCard directly in case the callback was lost.
    if (!order.paidAt && services.paymentProvider === 'pelecard') {
      await checkPelecardReturn(db, services, base, order)
      const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id))
      if (fresh) Object.assign(order, fresh)
    }
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
      // Photos can be added or changed until the game starts (see public-photos.ts).
      photos: { count: order.photos.length, editable: PHOTOS_EDITABLE.includes(order.status) },
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
