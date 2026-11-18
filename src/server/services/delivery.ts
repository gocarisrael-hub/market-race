// Customer and owner messages. Every send is logged in `messages`.
import QRCode from 'qrcode'
import type { DB } from '../db/index.ts'
import { messages } from '../db/schema.ts'
import type { Services } from './context.ts'
import type { Order } from './orders.ts'
import { getSetting, type MessageKey } from './settings.ts'

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
  const templates = await getSetting(db, 'message_templates')
  const tpl = templates[key]
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
  const qr = key === 'game_ready' ? await QRCode.toDataURL(l.gameLink, { width: 400, margin: 2 }) : undefined

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
