// External services, built from env in production and injected as fakes in tests.
import { createMailer, type Mailer, mailConfigFromEnv } from '../lib/mail.ts'
import { createWhatsApp, type WhatsApp, whatsappConfigFromEnv } from '../lib/whatsapp.ts'
import { createTranzila, type Tranzila, tranzilaConfigFromEnv } from '../payments/tranzila.ts'

export interface Services {
  mailer: Mailer
  whatsapp: WhatsApp
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
    tranzila: createTranzila(tranzilaConfigFromEnv(env)),
    ownerEmail: mail.ownerEmail,
    ownerWhatsApp: wa.ownerNumber,
  }
}
