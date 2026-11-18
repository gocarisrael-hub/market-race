// Fake external services for tests: record what was sent, never touch the network.

import { createTranzila, type TxRow, tranzilaConfigFromEnv } from '../../src/server/payments/tranzila.ts'
import type { Services } from '../../src/server/services/context.ts'

export interface Sent {
  to: string
  subject?: string
  text: string
}

export interface FakePelecard {
  // Transactions PeleCard would return from GetTransaction, by id.
  txs: Map<string, Record<string, unknown>>
  inits: Record<string, unknown>[]
  failLookups: boolean
}

export function fakeServices(
  opts: {
    tranzila?: boolean
    rows?: () => TxRow[]
    provider?: 'pelecard' | 'tranzila'
    pelecard?: boolean
  } = {},
) {
  const pc: FakePelecard = { txs: new Map(), inits: [], failLookups: false }
  const pelecardOn = opts.pelecard !== false
  let nextTx = 1000
  const emails: Sent[] = []
  const whatsapps: Sent[] = []
  const tz = createTranzila(
    tranzilaConfigFromEnv(
      opts.tranzila === false
        ? {}
        : { TRANZILA_TERMINAL: 'testterm', TRANZILA_APP_KEY: 'k', TRANZILA_SECRET: 's', APP_ENV: 'test' },
    ),
  )
  const svc: Services & { emails: Sent[]; whatsapps: Sent[]; pc: FakePelecard } = {
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
    paymentProvider: opts.provider ?? 'tranzila',
    pelecard: {
      isConfigured: () => pelecardOn,
      init: async (o) => {
        const id = `tx${nextTx++}`
        pc.inits.push({ ...o, id })
        return { url: `https://gateway21.pelecard.biz/PaymentGW?transactionId=${id}`, transactionId: id }
      },
      getTransaction: async (id) => {
        if (pc.failLookups) throw new Error('pelecard http 503')
        const rd = pc.txs.get(id)
        return {
          statusCode: rd ? '000' : '404',
          shvaResult: rd?.ShvaResult != null ? String(rd.ShvaResult) : null,
          paramX: rd?.AdditionalDetailsParamX != null ? String(rd.AdditionalDetailsParamX) : null,
          debitTotalAgorot: rd?.DebitTotal != null ? Number(rd.DebitTotal) : null,
          approvalNo: rd?.DebitApproveNumber ? String(rd.DebitApproveNumber) : null,
          voucherNo: rd?.VoucherId ? String(rd.VoucherId) : null,
          transactionId: id,
          raw: rd ?? {},
        }
      },
    },
    tranzila: { ...tz, listTransactions: async () => opts.rows?.() ?? [] },
    ownerEmail: 'owner@example.com',
    ownerWhatsApp: '',
    emails,
    whatsapps,
    pc,
  }
  return svc
}
