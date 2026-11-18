// External services, built from env in production and injected as fakes in tests.
import { createMailer, type Mailer, mailConfigFromEnv } from '../lib/mail.ts'
import { createWhatsApp, type WhatsApp, whatsappConfigFromEnv } from '../lib/whatsapp.ts'
import { createPelecard, type Pelecard, pelecardConfigFromEnv } from '../payments/pelecard.ts'
import { createTranzila, type Tranzila, tranzilaConfigFromEnv } from '../payments/tranzila.ts'

export type PaymentProvider = 'pelecard' | 'tranzila'

export interface Services {
  mailer: Mailer
  whatsapp: WhatsApp
  // Which provider opens new payments. PeleCard by default; Tranzila is kept for later.
  paymentProvider: PaymentProvider
  pelecard: Pelecard
  tranzila: Tranzila
  ownerEmail: string
  ownerWhatsApp: string
}

export function servicesFromEnv(env: NodeJS.ProcessEnv = process.env): Services {
  const mail = mailConfigFromEnv(env)
  const wa = whatsappConfigFromEnv(env)
  return {
    mailer: createMailer(mail),
    whatsapp: createWhatsApp(wa),
    paymentProvider: env.PAYMENT_PROVIDER === 'tranzila' ? 'tranzila' : 'pelecard',
    pelecard: createPelecard(pelecardConfigFromEnv(env)),
    tranzila: createTranzila(tranzilaConfigFromEnv(env)),
    ownerEmail: mail.ownerEmail,
    ownerWhatsApp: wa.ownerNumber,
  }
}

/** Card payment is on only when the chosen provider is fully configured. It never falls back. */
export function cardEnabled(svc: Services): boolean {
  return svc.paymentProvider === 'pelecard' ? svc.pelecard.isConfigured() : svc.tranzila.isConfigured()
}
