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
  palettes,
  redemptions,
  routes,
  stalls,
  tastings,
  themes,
} from '../db/schema.ts'
import { previewRoute } from '../domain/builder.ts'
import { israelDate } from '../domain/dates.ts'
import { isIsraeliPhone } from '../domain/phone.ts'
import {
  occasionRecipients,
  orderRecipient,
  recipientForForm,
  resolveRecipient,
} from '../domain/recipient.ts'
import { exampleFor, questionTextFor } from '../domain/template.ts'
import { offeredFor, themesFor } from '../domain/themes.ts'
import {
  ALLERGENS,
  DIETS,
  FORMS,
  type Form,
  type OrderStatus,
  RECIPIENT_FORM,
  RECIPIENTS,
} from '../domain/types.ts'
import { iconUrl } from '../lib/icons.ts'
import { captainToken } from '../lib/tokens.ts'
import { cardEnabled } from '../services/context.ts'
import { interpolate, links, qrPng, sendManageLinks, sendToBuyer } from '../services/delivery.ts'
import {
  BuildError,
  buildOrderGame,
  createOrder,
  questionsForOccasion,
  questionsForOrder,
} from '../services/orders.ts'
import { afterBuilt, handleNotify, PaymentError, priceFor, startPayment } from '../services/payments.ts'
import { completeMockPayment, mockPaymentInfo } from '../services/payments-mock.ts'
import { checkPelecardReturn, handlePelecardCallback } from '../services/payments-pelecard.ts'
import { fileUrl, isPaused, resumeBlock, resumeGame, startBlock, startGame } from '../services/play.ts'
import { getSetting, messageTemplate } from '../services/settings.ts'
import { PHOTOS_EDITABLE } from './public-photos.ts'

const phone = z.string().regex(/^[0-9+\-\s]{9,16}$/)
const letterNote = z.object({ text: z.string().max(600), signature: z.string().max(60) })
// Personal questions that unlock hints in the game. Optional; a pair needs both sides.
export const MAX_HINT_QUESTIONS = 10
const hintQuestion = z.object({ question: z.string().trim().max(140), answer: z.string().trim().max(60) })
const hintQuestionList = z.array(hintQuestion).max(MAX_HINT_QUESTIONS)
const cleanHintQuestions = (list: z.infer<typeof hintQuestionList>) =>
  list.filter((q) => q.question && q.answer)

/** One lost-link email per address per this long (lifted in the test env, as the rate limits are). */
export const LOST_LINK_INTERVAL_MS = 10 * 60 * 1000

export async function publicOrderRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config, services } = ctx
  const base = config.publicBaseUrl

  app.get('/api/shop', async () => {
    const [occ, th, rt, mk, pal] = await Promise.all([
      db.select().from(occasions).where(eq(occasions.active, true)).orderBy(asc(occasions.sort)),
      db.select().from(themes).where(eq(themes.active, true)).orderBy(asc(themes.sort)),
      db.select().from(routes).where(eq(routes.active, true)),
      db
        .select({ id: markets.id, name: markets.name, hours: markets.hours })
        .from(markets)
        .where(eq(markets.active, true)),
      db
        .select()
        .from(palettes)
        .where(eq(palettes.active, true))
        .orderBy(asc(palettes.sort), asc(palettes.id)),
    ])
    return {
      brand: await getSetting(db, 'brand_name'),
      occasions: occ.map((o) => ({
        key: o.key,
        label: o.label,
        audience: o.audience,
        forms: o.forms,
        // Who the game can be for, one person first. Never the question set ids.
        recipients: occasionRecipients(o).map((c) => c.recipient),
        // The occasion's own names for them (e.g. "לילדה"), where it has one.
        recipientLabels: o.recipientLabels ?? {},
        decor: o.decor,
      })),
      markets: mk,
      themes: th.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        marketId: t.marketId,
        map: fileUrl(t.mapFile),
        palette: t.palette,
        // Fonts, treatment and illustrations; the occasions (and recipients) it is offered for.
        style: t.style,
        occasionKeys: t.occasionKeys,
        recipients: t.recipients,
        // The colors this map can be played in; the first one is the default.
        palettes: pal
          .filter((p) => p.themeIds.includes(t.id))
          .map((p) => ({ id: p.id, name: p.name, palette: p.palette })),
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
      // The companies site's group size range.
      companyPeople: {
        min: await getSetting(db, 'company_min_people'),
        max: await getSetting(db, 'company_max_people'),
      },
      // For the landing page's FAQ.
      validYears: await getSetting(db, 'valid_years'),
      gameDuration: await getSetting(db, 'game_duration'),
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
    // By recipient; `form` alone is what older pages sent (mapped the same way old orders are).
    const q = z
      .object({
        occasion: z.string(),
        recipient: z.enum(RECIPIENTS).optional(),
        form: z.enum(FORMS).optional(),
      })
      .safeParse(req.query)
    if (!q.success || (!q.data.recipient && !q.data.form)) return reply.code(400).send({ error: 'invalid' })
    const [occ] = await db.select().from(occasions).where(eq(occasions.key, q.data.occasion))
    const recipient = q.data.recipient ?? recipientForForm(q.data.form as Form, occ?.decor)
    const form = recipient ? RECIPIENT_FORM[recipient] : (q.data.form as Form)
    const questions = await questionsForOccasion(db, q.data.occasion, recipient)
    return { questions: publicQuestions(questions, form) }
  })

  const buyerBody = z.object({
    name: z.string().trim().min(1).max(60),
    phone,
    email: z.string().email().max(120),
  })
  const orderBody = z.object({
    occasionKey: z.string().min(1),
    // Who the game is for. Pages from before recipients existed send only the form.
    recipient: z.enum(RECIPIENTS).optional(),
    form: z.enum(['she', 'he', 'couple', 'group']).optional(),
    honoreeName: z.string().trim().min(1).max(40),
    themeId: z.number().int(),
    paletteId: z.number().int().nullable().default(null),
    people: z.number().int().min(1),
    allergens: z.array(z.enum(ALLERGENS)).default([]),
    diets: z.array(z.enum(DIETS)).default([]),
    answers: z.record(z.string(), z.string().max(300)).default({}),
    letterNotes: z.array(letterNote).max(10).default([]),
    hintQuestions: hintQuestionList.default([]),
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
    const recipient = b.recipient ?? (b.form ? recipientForForm(b.form, occ.decor) : null)
    const choice = resolveRecipient(occ, recipient)
    if (!choice) return { error: 'bad_form' } as const
    const [min, max] = [await getSetting(db, 'min_people'), await getSetting(db, 'max_people')]
    // Never below one participant, whatever the saved setting says.
    if (b.people < Math.max(1, min) || b.people > max) return { error: 'bad_people' } as const
    const { theme, route } = await routeForTheme(b.themeId)
    if (!theme || !offeredFor(theme, b.occasionKey)) return { error: 'bad_theme' } as const
    if (!route) return { error: 'no_route' } as const
    if (b.paletteId != null) {
      const [pal] = await db.select().from(palettes).where(eq(palettes.id, b.paletteId))
      if (!pal?.active || !pal.themeIds.includes(theme.id)) return { error: 'bad_palette' } as const
    }
    const price = await priceFor(db, b.occasionKey, b.people)
    if (!price) return { error: 'no_price' } as const
    const questions = await questionsForOccasion(db, b.occasionKey, choice.recipient)
    return {
      answersLater: b.answersLater,
      buyer: b.buyer,
      values: {
        occasionKey: b.occasionKey,
        form: choice.form,
        recipient: choice.recipient,
        honoreeName: b.honoreeName,
        themeId: theme.id,
        paletteId: b.paletteId,
        routeId: route.id,
        people: b.people,
        allergens: b.allergens,
        diets: b.diets,
        answers: cleanAnswers(b.answers, questions),
        letterNotes: b.letterNotes.filter((n) => n.text.trim()),
        hintQuestions: b.answersLater ? [] : cleanHintQuestions(b.hintQuestions),
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

  /**
   * The style and palettes an order can be played in (the default first), and its choice. The
   * styles are the ones offered for the occasion on the same market (the route stays).
   */
  async function lookFor(order: typeof orders.$inferSelect, recipient: string | null) {
    if (!order.themeId) return null
    const [theme] = await db.select().from(themes).where(eq(themes.id, order.themeId))
    if (!theme) return null
    const sameMarket = await db
      .select()
      .from(themes)
      .where(and(eq(themes.marketId, theme.marketId), eq(themes.active, true)))
      .orderBy(asc(themes.sort), asc(themes.id))
    const styles = themesFor(sameMarket, order.occasionKey, recipient)
    if (!styles.some((t) => t.id === theme.id)) styles.unshift(theme)
    const pal = await db
      .select()
      .from(palettes)
      .where(eq(palettes.active, true))
      .orderBy(asc(palettes.sort), asc(palettes.id))
    const list = pal
      .filter((p) => p.themeIds.includes(theme.id))
      .map((p) => ({ id: p.id, name: p.name, palette: p.palette }))
    return {
      themeId: theme.id,
      map: fileUrl(theme.mapFile),
      themePalette: theme.palette,
      paletteId: order.paletteId,
      palettes: list,
      themes: styles.map((t) => ({
        id: t.id,
        name: t.name,
        map: fileUrl(t.mapFile),
        palette: t.palette,
        style: t.style,
        palettes: pal
          .filter((p) => p.themeIds.includes(t.id))
          .map((p) => ({ id: p.id, name: p.name, palette: p.palette })),
      })),
    }
  }

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
    // The buyer can change everything personal until the game starts (see isEditable).
    const editable = isEditable(order, state)
    const [occ] = await db
      .select({ decor: occasions.decor })
      .from(occasions)
      .where(eq(occasions.key, order.occasionKey))
    const recipient = orderRecipient(order, occ)
    const block = startBlock(order, state, israelDate())
    const started = !!state && state.step !== 'opening'
    const gameLink = links(base, order).gameLink
    const paused = !!state && isPaused(state) && order.status === 'active'
    const resumeWhy = resumeBlock(order, state, israelDate())
    // After the start: the captain shares the players' link (the owner's text) and joins the game.
    let invite: { text: string } | null = null
    if (started && order.status === 'active') {
      const tpl = await messageTemplate(db, 'players_invite')
      invite = {
        text: interpolate(tpl.text, {
          name: order.buyerName,
          honoree: order.companyName || order.honoreeName,
          gameLink,
          brand: await getSetting(db, 'brand_name'),
        }),
      }
    }
    return {
      orderNo: order.orderNo,
      kind: order.kind,
      status: order.status,
      paid: !!order.paidAt,
      honoree: order.companyName || order.honoreeName,
      form: order.form,
      recipient,
      occasionKey: order.occasionKey,
      // The occasion's doodle set, for the page's decorations.
      decor: occ?.decor ?? 'generic',
      people: order.people,
      amountAgorot: order.priceAgorot,
      validUntil: order.validUntil,
      gameLink: playable ? gameLink : null,
      // The captain's start: whether it can start now (or why not), and up to how many players.
      start: {
        can: block === null,
        reason: block,
        maxPlayers: order.game?.people ?? order.people,
      },
      started,
      players: state?.players ?? (started ? (order.game?.people ?? order.people) : null),
      invite,
      // Paused by the captain: where they stopped, and whether it can resume now (or why not).
      paused: paused ? { stop: state.stopIndex + 1, total: order.game?.stops.length ?? 0 } : null,
      resume: { can: paused && resumeWhy === null, reason: paused ? resumeWhy : 'not_paused' },
      // The captain's own way into the game: the game link plus the captain token in the hash
      // (never sent to the server in the URL), which lets that phone pause the game.
      captainLink:
        started && order.status === 'active' ? `${gameLink}#c=${captainToken(order.manageToken)}` : null,
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
      editable,
      // What the edit form needs. The manage token is the buyer's own link.
      honoreeName: editable ? order.honoreeName : undefined,
      answers: needsAnswers || editable ? order.answers : undefined,
      letterNotes: editable ? order.letterNotes : undefined,
      // The buyer's own questions and answers, on the buyer's own link only (never in the game).
      hintQuestions: editable ? order.hintQuestions : undefined,
      // The color: the palettes this order's map can be played in, and the chosen one.
      look: editable ? await lookFor(order, recipient) : undefined,
      questions:
        needsAnswers || editable
          ? publicQuestions(await questionsForOccasion(db, order.occasionKey, recipient), order.form)
          : undefined,
    }
  })

  // The buyer's edit: name, answers and letter notes, any number of times until the game starts.
  // A paid order is (re)built right away, so a built game that has not started shows the edit;
  // odd answers send it to the owner's review as on the first build.
  app.put(
    '/api/manage/:token/answers',
    { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
      const body = z
        .object({
          honoreeName: z.string().trim().min(1).max(40).optional(),
          themeId: z.number().int().optional(),
          paletteId: z.number().int().nullable().optional(),
          answers: z.record(z.string(), z.string().max(300)),
          letterNotes: z.array(letterNote).max(10).default([]),
          hintQuestions: hintQuestionList.optional(),
        })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid' })
      const [order] = await db.select().from(orders).where(eq(orders.manageToken, token))
      if (!order) return reply.code(404).send({ error: 'not_found' })
      if (order.kind !== 'private') return reply.code(409).send({ error: 'not_editable' })
      const [state] = await db.select().from(gameStates).where(eq(gameStates.orderId, order.id))
      if (!isEditable(order, state)) return reply.code(409).send({ error: 'locked' })
      const { paletteId } = body.data
      // Another style: active, offered for the occasion, on the same market (the route stays).
      let themeId = order.themeId
      if (body.data.themeId !== undefined && body.data.themeId !== order.themeId) {
        const [cur] = order.themeId ? await db.select().from(themes).where(eq(themes.id, order.themeId)) : []
        const [next] = await db.select().from(themes).where(eq(themes.id, body.data.themeId))
        if (!next?.active || !cur || next.marketId !== cur.marketId || !offeredFor(next, order.occasionKey))
          return reply.code(400).send({ error: 'bad_theme' })
        themeId = next.id
      }
      if (paletteId != null) {
        const [pal] = await db.select().from(palettes).where(eq(palettes.id, paletteId))
        if (!pal?.active || !themeId || !pal.themeIds.includes(themeId))
          return reply.code(400).send({ error: 'bad_palette' })
      }
      const questions = await questionsForOrder(db, order)
      await db
        .update(orders)
        .set({
          ...(themeId !== order.themeId ? { themeId, paletteId: paletteId ?? null } : {}),
          ...(paletteId !== undefined ? { paletteId } : {}),
          honoreeName: body.data.honoreeName ?? order.honoreeName,
          answers: cleanAnswers(body.data.answers, questions),
          letterNotes: body.data.letterNotes.filter((n) => n.text.trim()),
          ...(body.data.hintQuestions ? { hintQuestions: cleanHintQuestions(body.data.hintQuestions) } : {}),
          answersSubmittedAt: order.answersSubmittedAt ?? new Date(),
        })
        // Re-checked in the write: the game may have started since it was read.
        .where(and(eq(orders.id, order.id), inArray(orders.status, PHOTOS_EDITABLE)))
      if (order.paidAt) {
        try {
          const built = await buildOrderGame(db, order.id)
          await afterBuilt(db, services, base, built)
          return { status: built.status }
        } catch (e) {
          if (e instanceof BuildError) return reply.code(409).send({ error: 'locked' })
          throw e
        }
      }
      return { status: order.status }
    },
  )

  // The captain starts the game at the market, with the number of players who arrived. Only here:
  // the game link cannot start it. From now on the order is locked.
  app.post(
    '/api/manage/:token/start',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
      const body = z.object({ players: z.number().int() }).safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid' })
      const [order] = await db.select().from(orders).where(eq(orders.manageToken, token))
      if (!order) return reply.code(404).send({ error: 'not_found' })
      const res = await startGame(db, order.gameToken, {
        players: body.data.players,
        pollSeconds: await getSetting(db, 'poll_seconds'),
      })
      if (!res.ok) {
        if (res.error === 'not_found') return reply.code(404).send({ error: res.error })
        return reply.code(res.error === 'bad_players' ? 400 : 409).send({ error: res.error })
      }
      // Once per start (a second start is refused above; resuming sends nothing): the game link
      // and QR by email, and the manage link to continue from if they stop.
      try {
        await sendToBuyer(db, services, base, order, 'game_started')
      } catch (e) {
        console.error('[start] email failed', e)
      }
      return { ok: true, gameLink: links(base, order).gameLink, players: res.view.players }
    },
  )

  // The captain resumes a paused game: any day it is valid, any number of times, at the same stop,
  // with the same game link and the players fixed at the start.
  app.post(
    '/api/manage/:token/resume',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.params)
      const [order] = await db.select().from(orders).where(eq(orders.manageToken, token))
      if (!order) return reply.code(404).send({ error: 'not_found' })
      const res = await resumeGame(db, order.gameToken, { pollSeconds: await getSetting(db, 'poll_seconds') })
      if (!res.ok) return reply.code(res.error === 'not_found' ? 404 : 409).send({ error: res.error })
      return {
        ok: true,
        stop: res.view.stopIndex + 1,
        captainLink: `${links(base, order).gameLink}#c=${captainToken(order.manageToken)}`,
      }
    },
  )

  // "איבדתי את הקישור": the same answer whether or not the address has orders, and the email goes
  // out after the response, so neither the answer nor its timing tells. Limited per address too.
  app.post(
    '/api/lost-link',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = z.object({ email: z.string().trim().email().max(120) }).safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid' })
      const minIntervalMs = config.env === 'test' ? 0 : LOST_LINK_INTERVAL_MS
      void sendManageLinks(db, services, base, body.data.email, { minIntervalMs }).catch((e) =>
        console.error('[lost-link] failed', e),
      )
      return { ok: true }
    },
  )

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
          // Only the phone is required. Old clients may still send occasion, people and date.
          phone: z.string().trim().max(30).refine(isIsraeliPhone),
          companyName: z.string().trim().max(80).default(''),
          contactName: z.string().trim().max(60).default(''),
          email: z
            .string()
            .trim()
            .max(120)
            .refine((v) => !v || z.email().safeParse(v).success)
            .default(''),
          occasionKey: z.string().max(40).optional(),
          people: z.number().int().min(1).max(500).optional(),
          preferredDate: z.string().max(40).default(''),
          message: z.string().trim().max(2000).default(''),
        })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues })
      const [lead] = await db.insert(leads).values(body.data).returning({ id: leads.id })
      return { ok: true, id: lead.id }
    },
  )
}

// The questions the buyer sees. "name" is the name field. A group's group_name is also asked as
// the name field; it stays in the list so the site can label that field with its text.
function publicQuestions(questions: Awaited<ReturnType<typeof questionsForOccasion>>, form: Form) {
  return questions
    .filter((q) => q.slot !== 'name' && !q.hidden)
    .map((q) => ({
      slot: q.slot,
      text: questionTextFor(q, form),
      example: exampleFor(q, form),
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
    if (q.hidden) continue
    const v = (answers[q.slot] ?? '').trim()
    if (v) out[q.slot] = q.maxLen > 0 ? [...v].slice(0, q.maxLen * 2).join('') : v
  }
  return out
}

/**
 * Whether the buyer can still change the order: before the game starts (status before `active`
 * and the shared game still on its opening screen).
 */
export function isEditable(
  order: { status: OrderStatus; kind: string },
  state: { step: string } | undefined,
): boolean {
  return (
    order.kind === 'private' && PHOTOS_EDITABLE.includes(order.status) && (!state || state.step === 'opening')
  )
}
