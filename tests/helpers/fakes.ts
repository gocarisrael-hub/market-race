// Fake external services for tests: record what was sent, never touch the network.

import { createTranzila, type TxRow, tranzilaConfigFromEnv } from '../../src/server/payments/tranzila.ts'
import type { Services } from '../../src/server/services/context.ts'

export interface Sent {
  to: string
  subject?: string
  text: string
}

export function fakeServices(opts: { tranzila?: boolean; rows?: () => TxRow[] } = {}) {
  const emails: Sent[] = []
  const whatsapps: Sent[] = []
  const tz = createTranzila(
    tranzilaConfigFromEnv(
      opts.tranzila === false
        ? {}
        : { TRANZILA_TERMINAL: 'testterm', TRANZILA_APP_KEY: 'k', TRANZILA_SECRET: 's', APP_ENV: 'test' },
    ),
  )
  const svc: Services & { emails: Sent[]; whatsapps: Sent[] } = {
    mailer: {
      isConfigured: () => true,
      send: async (m) => {
        emails.push({ to: m.to, subject: m.subject, text: m.text })
        return true
      },
    },
    whatsapp: {
      isConfigured: () => true,
      sendText: async (to, text) => {
        whatsapps.push({ to, text })
        return true
      },
    },
    tranzila: { ...tz, listTransactions: async () => opts.rows?.() ?? [] },
    ownerEmail: 'owner@example.com',
    ownerWhatsApp: '',
    emails,
    whatsapps,
  }
  return svc
}
