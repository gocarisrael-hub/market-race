// Customer and owner messages. Every send is logged in `messages`.
import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm'
import QRCode from 'qrcode'
import type { DB } from '../db/index.ts'
import { messages, orders } from '../db/schema.ts'
import { israelDate } from '../domain/dates.ts'
import type { Services } from './context.ts'
import type { Order } from './orders.ts'
import { getSetting, type MessageKey, messageTemplate } from './settings.ts'

export function interpolate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function toHtml(text: string, qrDataUrl?: string) {
  const linked = esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>')
  const qr = qrDataUrl ? `<p><img src="${qrDataUrl}" alt="QR" width="200" height="200"></p>` : ''
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6">${linked}${qr}</div>`
}

export function links(base: string, o: Pick<Order, 'gameToken' | 'manageToken'>) {
  return {
    gameLink: `${base}/g/${o.gameToken}`,
    manageLink: `${base}/m/${o.manageToken}`,
    answersLink: `${base}/m/${o.manageToken}#answers`,
    payLink: `${base}/pay/${o.manageToken}`,
  }
}

export async function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { width: 600, margin: 2, errorCorrectionLevel: 'M' })
}

async function log(db: DB, row: typeof messages.$inferInsert) {
  await db.insert(messages).values(row)
}

/** Sends one templated message to the buyer by email, and by WhatsApp when allowed. */
export async function sendToBuyer(
  db: DB,
  svc: Services,
  base: string,
  order: Order,
  key: MessageKey,
  extra: Record<string, string> = {},
) {
  const tpl = await messageTemplate(db, key)
  if (!tpl) return
  const brand = await getSetting(db, 'brand_name')
  const l = links(base, order)
  const vars = {
    name: order.buyerName,
    honoree: order.companyName || order.honoreeName,
    orderNo: order.orderNo,
    validUntil: order.validUntil ?? '',
    amount: (order.priceAgorot / 100).toFixed(2),
    brand,
    ...l,
    ...extra,
  }
  const subject = interpolate(tpl.subject, vars)
  const text = interpolate(tpl.text, vars)
  const qr =
    key === 'game_ready' || key === 'game_started'
      ? await QRCode.toDataURL(l.gameLink, { width: 400, margin: 2 })
      : undefined

  if (order.buyerEmail) {
    const ok = svc.mailer.isConfigured()
      ? await svc.mailer.send({ to: order.buyerEmail, subject, text, html: toHtml(text, qr) })
      : false
    await log(db, {
      orderId: order.id,
      channel: 'email',
      to: order.buyerEmail,
      template: key,
      status: svc.mailer.isConfigured() ? (ok ? 'sent' : 'failed') : 'skipped',
    })
  }
  if (order.buyerPhone) {
    const allowed = (await getSetting(db, 'whatsapp_to_customers')) && svc.whatsapp.isConfigured()
    const ok = allowed ? await svc.whatsapp.sendText(order.buyerPhone, text) : false
    await log(db, {
      orderId: order.id,
      channel: 'whatsapp',
      to: order.buyerPhone,
      template: key,
      status: allowed ? (ok ? 'sent' : 'failed') : 'skipped',
    })
  }
}

/** Owner alert: email, WhatsApp as fallback, the log when nothing is configured. Returns delivered. */
export async function alertOwner(svc: Services, subject: string, lines: string[]): Promise<boolean> {
  const text = lines.join('\n')
  if (svc.ownerEmail && svc.mailer.isConfigured()) {
    if (await svc.mailer.send({ to: svc.ownerEmail, subject, text, html: toHtml(text) })) return true
  }
  if (svc.ownerWhatsApp && svc.whatsapp.isConfigured()) {
    if (await svc.whatsapp.sendText(svc.ownerWhatsApp, `${subject}\n${text}`)) return true
  }
  if (!svc.mailer.isConfigured() && !svc.whatsapp.isConfigured()) {
    console.error(`[alert] OWNER ALERT, no channel configured: ${subject} | ${lines.join(' | ')}`)
    return true
  }
  return false
}

/** Orders whose manage link a lost-link request sends: paid, not cancelled, still valid. */
const REMINDABLE = ['awaiting_answers', 'review', 'ready', 'active', 'done']

/**
 * "איבדתי את הקישור": emails the address its orders' manage links, in one message. Nothing is
 * sent when the address has no paid, valid orders, or when it was sent one within
 * `minIntervalMs` (so the form cannot flood an inbox). Returns how many links were sent; the
 * caller never tells the visitor, so the page does not reveal whether an address has orders.
 */
export async function sendManageLinks(
  db: DB,
  svc: Services,
  base: string,
  email: string,
  opts: { now?: Date; minIntervalMs?: number } = {},
): Promise<number> {
  const now = opts.now ?? new Date()
  const address = email.trim().toLowerCase()
  if (!address) return 0
  const today = israelDate(now)
  const found = (
    await db
      .select()
      .from(orders)
      .where(and(sql`lower(${orders.buyerEmail}) = ${address}`, isNotNull(orders.paidAt)))
      .orderBy(desc(orders.createdAt))
  ).filter((o) => REMINDABLE.includes(o.status) && (o.validUntil == null || o.validUntil >= today))
  if (!found.length) return 0
  if (opts.minIntervalMs) {
    const since = new Date(now.getTime() - opts.minIntervalMs)
    const [recent] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.template, 'links_reminder'),
          sql`lower(${messages.to}) = ${address}`,
          gt(messages.createdAt, since),
        ),
      )
      .limit(1)
    if (recent) return 0
  }
  const tpl = await messageTemplate(db, 'links_reminder')
  const vars = {
    name: found[0].buyerName,
    brand: await getSetting(db, 'brand_name'),
    links: found
      .map(
        (o) =>
          `המירוץ של ${o.companyName || o.honoreeName} (הזמנה ${o.orderNo}):\n${links(base, o).manageLink}`,
      )
      .join('\n\n'),
  }
  const subject = interpolate(tpl.subject, vars)
  const text = interpolate(tpl.text, vars)
  const to = found[0].buyerEmail
  const ok = svc.mailer.isConfigured()
    ? await svc.mailer.send({ to, subject, text, html: toHtml(text) })
    : false
  const status = svc.mailer.isConfigured() ? (ok ? 'sent' : 'failed') : 'skipped'
  for (const o of found)
    await log(db, { orderId: o.id, channel: 'email', to, template: 'links_reminder', status, createdAt: now })
  return found.length
}
