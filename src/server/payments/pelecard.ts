// PeleCard Iframe (V2) card payment. Ported from the Dugri codebase (server/pelecard.js),
// implemented there against PeleCard's Iframe/Redirect (11/2024) and Services ReST API (01/2025)
// manuals. See docs/PAYMENT.md.
//
//   1. init() POSTs to /PaymentGW/init and gets a payment URL with a TransactionId in it.
//   2. The buyer pays inside PeleCard's page in an iframe; card data never touches us.
//   3. PeleCard POSTs the result to our callback. That body is UNTRUSTED: we take only the
//      TransactionId and re-fetch the transaction with our secret terminal credentials
//      (getTransaction). A forged callback cannot survive that check.
// ParamX carries our per-payment token (<= 19 chars, [0-9a-z]); PeleCard echoes it back as
// AdditionalDetailsParamX, which locates the pay session.

export interface PelecardConfig {
  terminal: string
  user: string
  password: string
  baseUrl: string
  timeoutMs: number
}

export function pelecardConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PelecardConfig {
  const n = Number(env.PELECARD_HTTP_TIMEOUT_MS)
  return {
    terminal: env.PELECARD_TERMINAL ?? '',
    user: env.PELECARD_USER ?? '',
    password: env.PELECARD_PASSWORD ?? '',
    // gateway21 is the production gateway per both manuals.
    baseUrl: (env.PELECARD_BASE_URL || 'https://gateway21.pelecard.biz').replace(/\/+$/, ''),
    timeoutMs: Number.isFinite(n) && n > 0 ? n : 10_000,
  }
}

export const SUCCESS_STATUS = '000'
const CURRENCY_ILS = 1
const ACTION_DEBIT = 'J4'
const PARAM_MAX = 19

export interface PelecardTx {
  statusCode: string | null // did the retrieval succeed
  shvaResult: string | null // did SHVA approve the charge
  paramX: string | null
  debitTotalAgorot: number | null
  approvalNo: string | null
  voucherNo: string | null
  transactionId: string
  raw: unknown
}

export function transactionIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/[?&]transactionId=([^&]+)/i)
  return m ? decodeURIComponent(m[1]) : null
}

export function createPelecard(cfg: PelecardConfig, fetchImpl: typeof fetch = fetch) {
  const isConfigured = () => Boolean(cfg.terminal && cfg.user && cfg.password)

  async function postJson(path: string, payload: unknown): Promise<Record<string, unknown>> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs)
    try {
      const res = await fetchImpl(cfg.baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`pelecard http ${res.status}`)
      return ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
    } finally {
      clearTimeout(timer)
    }
  }

  async function init(opts: {
    amountAgorot: number
    paramToken: string
    urls: { goodUrl: string; errorUrl: string; serverGoodUrl: string; serverErrorUrl: string }
    language?: string
  }): Promise<{ url: string; transactionId: string | null }> {
    if (!isConfigured()) throw new Error('pelecard not configured')
    if (!Number.isInteger(opts.amountAgorot) || opts.amountAgorot <= 0) throw new Error('bad amount')
    const data = await postJson('/PaymentGW/init', {
      terminal: cfg.terminal,
      user: cfg.user,
      password: cfg.password,
      ActionType: ACTION_DEBIT,
      Currency: CURRENCY_ILS,
      Total: opts.amountAgorot,
      FreeTotal: false,
      Language: opts.language ?? 'HE',
      ParamX: String(opts.paramToken).slice(0, PARAM_MAX),
      GoodURL: opts.urls.goodUrl,
      ErrorURL: opts.urls.errorUrl,
      ServerSideGoodFeedbackURL: opts.urls.serverGoodUrl,
      ServerSideErrorFeedbackURL: opts.urls.serverErrorUrl,
      ServerSideFeedbackContentType: 'application/json',
    })
    const err = data.Error as { ErrCode?: unknown; ErrMsg?: unknown } | undefined
    if (err?.ErrCode && String(err.ErrCode) !== '0') {
      throw new Error(`pelecard init error ${err.ErrCode}: ${err.ErrMsg ?? 'unknown error'}`)
    }
    if (!data.URL) throw new Error('pelecard init returned no URL')
    const url = String(data.URL)
    return { url, transactionId: transactionIdFromUrl(url) }
  }

  /** Authoritative lookup with our secret credentials. Throws on a transport error. */
  async function getTransaction(transactionId: string): Promise<PelecardTx> {
    if (!isConfigured()) throw new Error('pelecard not configured')
    if (!transactionId) throw new Error('no transactionId')
    const data = await postJson('/PaymentGW/GetTransaction', {
      terminal: cfg.terminal,
      user: cfg.user,
      password: cfg.password,
      TransactionId: transactionId,
    })
    const rd = (data.ResultData ?? {}) as Record<string, unknown>
    const debit = rd.DebitTotal != null && rd.DebitTotal !== '' ? Number(rd.DebitTotal) : null
    const echoed = rd.AdditionalDetailsParamX ?? rd.ParamX
    return {
      statusCode: data.StatusCode != null ? String(data.StatusCode) : null,
      shvaResult: rd.ShvaResult != null ? String(rd.ShvaResult) : null,
      paramX: echoed != null ? String(echoed) : null,
      debitTotalAgorot: debit != null && Number.isFinite(debit) ? debit : null,
      // Two different identifiers, kept apart: card companies' cancellation letters cite the voucher.
      approvalNo: rd.DebitApproveNumber ? String(rd.DebitApproveNumber) : null,
      voucherNo: rd.VoucherId ? String(rd.VoucherId) : null,
      transactionId: rd.TransactionId ? String(rd.TransactionId) : transactionId,
      raw: data,
    }
  }

  return { isConfigured, init, getTransaction }
}

export type Pelecard = ReturnType<typeof createPelecard>

/** The only things we take from the untrusted callback. Lenient about its shape. */
export function parseCallback(body: Record<string, unknown> = {}) {
  const rd = (body.ResultData ?? body.resultData ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (body[k] != null) return String(body[k])
      if (rd[k] != null) return String(rd[k])
    }
    return null
  }
  return {
    statusCode: pick('StatusCode', 'PelecardStatusCode', 'statusCode'),
    transactionId: pick('TransactionId', 'PelecardTransactionId', 'transactionId'),
    paramX: pick('AdditionalDetailsParamX', 'ParamX', 'paramX'),
  }
}

/** Why a transaction did not verify, or null when it did. FAIL-CLOSED. */
export function verifyFailure(tx: PelecardTx | null, expected: { amountAgorot: number }) {
  if (!tx || tx.statusCode !== SUCCESS_STATUS) return 'lookup_status' as const
  if (tx.shvaResult !== SUCCESS_STATUS) return 'declined' as const
  if (expected.amountAgorot == null || tx.debitTotalAgorot == null) return 'no_amount' as const
  if (tx.debitTotalAgorot !== expected.amountAgorot) return 'amount_mismatch' as const
  return null
}
