// Tranzila card payment (hosted iframe, DirectNG). Ported from the Dugri codebase
// (server/tranzila.js); see docs/PAYMENT.md. The card is typed on Tranzila's page, never ours.
//
// Notify POSTs are unsigned, so they decide nothing: they only ask for a sweep
// (payments/sweep.ts), which reads the terminal's own rows from the Reports API and
// settles a row only when it verifies (verifyTransaction).
import { createHmac, randomBytes } from 'node:crypto'

export interface TranzilaConfig {
  terminal: string
  appKey: string
  secret: string
  tokenField: string
  handshake: boolean
  applePay: boolean
  googlePay: boolean
  iframeBase: string
  apiBase: string
  reportBase: string
  timeoutMs: number
  // Which environment minted a token: production 'p', staging 's', anything else 'l'.
  env: string
}

const trimBase = (v: string | undefined, d: string) => (v || d).replace(/\/+$/, '')
const positive = (v: string | undefined, d: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : d
}

export function tranzilaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TranzilaConfig {
  return {
    terminal: env.TRANZILA_TERMINAL ?? '',
    appKey: env.TRANZILA_APP_KEY ?? '',
    secret: env.TRANZILA_SECRET ?? '',
    tokenField: env.TRANZILA_TOKEN_FIELD || 'mr_token',
    handshake: env.TRANZILA_HANDSHAKE === '1',
    applePay: env.TRANZILA_APPLE_PAY === '1',
    googlePay: env.TRANZILA_GOOGLE_PAY === '1',
    iframeBase: trimBase(env.TRANZILA_IFRAME_BASE, 'https://directng.tranzila.com'),
    apiBase: trimBase(env.TRANZILA_API_BASE, 'https://api.tranzila.com'),
    reportBase: trimBase(env.TRANZILA_REPORT_BASE, 'https://report.tranzila.com'),
    timeoutMs: positive(env.TRANZILA_HTTP_TIMEOUT_MS, 10_000),
    env: String(env.PAYMENT_ENV || env.APP_ENV || env.RAILWAY_ENVIRONMENT_NAME || '')
      .trim()
      .toLowerCase(),
  }
}

export const SUCCESS_CODE = '000'
const CURRENCY_ILS = '1'
// WHAT COUNTS AS MONEY TAKEN: an allowlist. The buyer can edit the iframe URL, so an
// authorization hold (tranmode V), a card check (N) or installments must never count.
const CHARGE_TXN_TYPES = new Set(['DEBIT'])
const CHARGE_TRANMODES = new Set(['A'])
const CHARGE_PAYMENT_PLANS = new Set([1, 3])

export interface TxRow {
  index: string
  amountAgorot: number | null
  currency: string | null
  responseCode: string | null
  txnType: string | null
  tranmode: string | null
  paymentPlan: number | null
  approvalNo: string | null
  raw: Record<string, unknown>
}

export type FetchLike = typeof fetch

export function createTranzila(cfg: TranzilaConfig, fetchImpl: FetchLike = fetch) {
  const isConfigured = () => Boolean(cfg.terminal && cfg.appKey && cfg.secret)

  // access token = HMAC-SHA256(message: app key, key: secret + time + nonce), hex.
  function authHeaders({ now = Date.now(), nonce = randomBytes(40).toString('hex') } = {}) {
    const time = String(Math.floor(now / 1000))
    const token = createHmac('sha256', cfg.secret + time + nonce)
      .update(cfg.appKey)
      .digest('hex')
    return {
      'X-tranzila-api-app-key': cfg.appKey,
      'X-tranzila-api-request-time': time,
      'X-tranzila-api-nonce': nonce,
      'X-tranzila-api-access-token': token,
    }
  }

  async function postJson(url: string, payload: unknown): Promise<Record<string, unknown>> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs)
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`tranzila http ${res.status}`)
      // A 200 that is not JSON (maintenance page, proxy error) is a failure, never "no rows".
      try {
        return (await res.json()) as Record<string, unknown>
      } catch {
        throw new Error('tranzila reply is not json')
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Builds the iframe URL for one payment. `paramToken` goes into the notify URL and the token field. */
  async function init(opts: {
    amountAgorot: number
    paramToken: string
    urls: { goodUrl: string; errorUrl: string; notifyUrl: string }
    buyer?: { email?: string; phone?: string }
    description: string
  }): Promise<{ url: string }> {
    if (!isConfigured()) throw new Error('tranzila not configured')
    const { amountAgorot: agorot, paramToken } = opts
    if (!Number.isInteger(agorot) || agorot <= 0) throw new Error('bad amount')
    if (!paramToken) throw new Error('no payment token')
    const sum = (agorot / 100).toFixed(2)
    const params = new URLSearchParams({
      sum,
      currency: CURRENCY_ILS,
      cred_type: '1',
      tranmode: 'A',
      lang: 'il',
      nologo: '1',
      trButtonColor: '000000',
      pdesc: opts.description,
      success_url_address: opts.urls.goodUrl,
      fail_url_address: opts.urls.errorUrl,
      notify_url_address: opts.urls.notifyUrl,
    })
    params.set(cfg.tokenField, paramToken)
    if (opts.buyer?.email) params.set('email', opts.buyer.email)
    if (opts.buyer?.phone) params.set('phone', opts.buyer.phone)
    if (cfg.applePay) params.set('apple_pay', '1')
    if (cfg.googlePay) params.set('google_pay', '1')
    if (cfg.handshake) {
      const data = await postJson(`${cfg.apiBase}/v2/handshake/create`, {
        terminal_name: cfg.terminal,
        sum: Number(sum),
        request_params: { [cfg.tokenField]: paramToken },
      })
      if (!data || Number(data.error_code) !== 0 || !data.thtk) {
        throw new Error(`tranzila handshake error ${data?.error_code}`)
      }
      params.set('thtk', String(data.thtk))
    }
    return { url: `${cfg.iframeBase}/${encodeURIComponent(cfg.terminal)}/iframenew.php?${params}` }
  }

  /** What we take from the untrusted notify: our token and Tranzila's result code. Decides nothing. */
  function parseNotify(body: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
    const pick = (v: unknown) => (v == null || v === '' ? null : String(v))
    return {
      token: pick(query.t) ?? pick(body[cfg.tokenField]),
      index: pick(body.index),
      response: pick(body.Response),
    }
  }

  const PAGE_RESULTS = 1000
  const MAX_PAGES = 200
  /** The terminal's rows between two Israel dates, every page. Throws rather than return part of it. */
  async function listTransactions({ startDate, endDate }: { startDate: string; endDate: string }) {
    if (!isConfigured()) throw new Error('tranzila not configured')
    const out: TxRow[] = []
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) throw new Error(`tranzila report has more than ${MAX_PAGES * PAGE_RESULTS} rows`)
      const data = await postJson(`${cfg.reportBase}/v1/transaction`, {
        terminal_name: cfg.terminal,
        transaction_start_date: startDate,
        transaction_end_date: endDate,
        page,
        page_results: PAGE_RESULTS,
        order_direction: 'desc',
      })
      const errorCode = data?.error_code
      if (!data || typeof data !== 'object' || (errorCode != null && Number(errorCode) !== 0)) {
        throw new Error(
          `tranzila report error ${errorCode ?? 'unreadable reply'}${data?.message ? `: ${String(data.message).slice(0, 120)}` : ''}`,
        )
      }
      // A quiet day is not an error: no error code and no transactions = empty report.
      if (data.transactions == null) break
      if (!Array.isArray(data.transactions))
        throw new Error('tranzila report error: transactions is not a list')
      const list = data.transactions as Record<string, unknown>[]
      for (const t of list) if (t && t.index != null) out.push(normalizeRow(t))
      if (list.length < PAGE_RESULTS) break
    }
    return out
  }

  const SESSION_TOKEN = /^m([a-z])[0-9a-f]{16}$/
  function envTag(): string {
    if (cfg.env === 'production') return 'p'
    if (cfg.env === 'staging') return 's'
    return 'l'
  }
  /** "m" + environment letter + 16 hex characters. */
  function newSessionToken() {
    return `m${envTag()}${randomBytes(8).toString('hex')}`
  }
  function sessionTokenValues(raw: Record<string, unknown> | null | undefined): string[] {
    if (!raw) return []
    return Object.values(raw).filter((v): v is string => typeof v === 'string' && SESSION_TOKEN.test(v))
  }
  function tokenEnv(token: string | null | undefined) {
    const m = SESSION_TOKEN.exec(String(token ?? ''))
    return m ? m[1] : null
  }

  return {
    config: cfg,
    isConfigured,
    authHeaders,
    init,
    parseNotify,
    listTransactions,
    envTag,
    newSessionToken,
    sessionTokenValues,
    tokenEnv,
  }
}

export type Tranzila = ReturnType<typeof createTranzila>

export function normalizeRow(rd: Record<string, unknown>): TxRow {
  const s = (v: unknown) => (v != null && v !== '' ? String(v) : null)
  return {
    index: String(rd.index),
    amountAgorot: rd.amount != null && rd.amount !== '' ? Number(rd.amount) : null,
    currency: rd.currency != null ? String(rd.currency) : null,
    responseCode: rd.processor_response_code != null ? String(rd.processor_response_code) : null,
    txnType: s(rd.txn_type)?.toUpperCase() ?? null,
    tranmode: s(rd.tranmode)?.toUpperCase() ?? null,
    paymentPlan: rd.payment_plan != null && rd.payment_plan !== '' ? Number(rd.payment_plan) : null,
    approvalNo: s(rd.authorization_number),
    raw: rd,
  }
}

/** The token can only be on the row because we sent it with this payment. */
export function carriesToken(raw: Record<string, unknown> | null | undefined, token: string) {
  if (!raw || !token) return false
  return Object.values(raw).some((v) => v != null && String(v) === token)
}

/** FAIL-CLOSED: approved, the kind of charge we asked for, shekels, exact amount, our token. */
export function verifyTransaction(tx: TxRow | null, expected: { amountAgorot: number; token: string }) {
  if (!tx || tx.responseCode !== SUCCESS_CODE) return false
  if (!tx.txnType || !CHARGE_TXN_TYPES.has(tx.txnType)) return false
  if (tx.tranmode != null && !CHARGE_TRANMODES.has(tx.tranmode)) return false
  if (tx.paymentPlan != null && !CHARGE_PAYMENT_PLANS.has(tx.paymentPlan)) return false
  if (tx.currency !== CURRENCY_ILS) return false
  if (expected.amountAgorot == null || tx.amountAgorot == null) return false
  if (tx.amountAgorot !== expected.amountAgorot) return false
  return carriesToken(tx.raw, expected.token)
}
