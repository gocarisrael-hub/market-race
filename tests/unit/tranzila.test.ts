import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  carriesToken,
  createTranzila,
  normalizeRow,
  tranzilaConfigFromEnv,
  verifyTransaction,
} from '../../src/server/payments/tranzila.ts'

const env = { TRANZILA_TERMINAL: 'term', TRANZILA_APP_KEY: 'app', TRANZILA_SECRET: 'sec', APP_ENV: 'staging' }

function jsonFetch(replies: unknown[]) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> })
    const r = replies.shift()
    if (r instanceof Response) return r
    return new Response(JSON.stringify(r), { status: 200 })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('tranzila client', () => {
  it('is dormant until terminal, key and secret are set', () => {
    expect(createTranzila(tranzilaConfigFromEnv({})).isConfigured()).toBe(false)
    expect(createTranzila(tranzilaConfigFromEnv(env)).isConfigured()).toBe(true)
  })

  it('signs calls: HMAC-SHA256(app key, secret + time + nonce)', () => {
    const tz = createTranzila(tranzilaConfigFromEnv(env))
    const h = tz.authHeaders({ now: 1_700_000_000_000, nonce: 'n' })
    const expected = createHmac('sha256', 'sec1700000000n').update('app').digest('hex')
    expect(h).toEqual({
      'X-tranzila-api-app-key': 'app',
      'X-tranzila-api-request-time': '1700000000',
      'X-tranzila-api-nonce': 'n',
      'X-tranzila-api-access-token': expected,
    })
  })

  it('builds the iframe URL with sum, standard charge mode, our token and notify URL', async () => {
    const tz = createTranzila(tranzilaConfigFromEnv(env))
    const { url } = await tz.init({
      amountAgorot: 39600,
      paramToken: 'ms0123456789abcdef',
      urls: {
        goodUrl: 'https://x/ok',
        errorUrl: 'https://x/err',
        notifyUrl: 'https://x/n?t=ms0123456789abcdef',
      },
      buyer: { email: 'a@b.co', phone: '0501234567' },
      description: '[שם המותג] MR-1',
    })
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://directng.tranzila.com/term/iframenew.php')
    const p = u.searchParams
    expect(p.get('sum')).toBe('396.00')
    expect(p.get('currency')).toBe('1')
    expect(p.get('tranmode')).toBe('A')
    expect(p.get('cred_type')).toBe('1')
    expect(p.get('mr_token')).toBe('ms0123456789abcdef')
    expect(p.get('notify_url_address')).toBe('https://x/n?t=ms0123456789abcdef')
    expect(p.get('email')).toBe('a@b.co')
    expect(p.get('pdesc')).toBe('[שם המותג] MR-1')
    expect(p.has('apple_pay')).toBe(false)
  })

  it('refuses bad amounts and adds the handshake when on', async () => {
    const tz = createTranzila(tranzilaConfigFromEnv(env))
    const urls = { goodUrl: 'a', errorUrl: 'b', notifyUrl: 'c' }
    await expect(tz.init({ amountAgorot: 0, paramToken: 't', urls, description: '' })).rejects.toThrow(
      'bad amount',
    )
    await expect(tz.init({ amountAgorot: 1.5, paramToken: 't', urls, description: '' })).rejects.toThrow(
      'bad amount',
    )
    const { f, calls } = jsonFetch([{ error_code: 0, thtk: 'HS' }])
    const hs = createTranzila(tranzilaConfigFromEnv({ ...env, TRANZILA_HANDSHAKE: '1' }), f)
    const { url } = await hs.init({ amountAgorot: 100, paramToken: 't', urls, description: '' })
    expect(new URL(url).searchParams.get('thtk')).toBe('HS')
    expect(calls[0].body).toMatchObject({ terminal_name: 'term', sum: 1, request_params: { mr_token: 't' } })
  })

  it('reads the notify token from the query first', () => {
    const tz = createTranzila(tranzilaConfigFromEnv(env))
    expect(tz.parseNotify({ index: '5', Response: '000', mr_token: 'b' }, { t: 'a' })).toEqual({
      token: 'a',
      index: '5',
      response: '000',
    })
    expect(tz.parseNotify({ mr_token: 'b' }, {}).token).toBe('b')
  })

  it('lists every page and fails on error codes, non-lists and non-JSON; a quiet day is empty', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ index: i }))
    let { f, calls } = jsonFetch([{ transactions: page }, { transactions: [{ index: 'last' }] }])
    let tz = createTranzila(tranzilaConfigFromEnv(env), f)
    const rows = await tz.listTransactions({ startDate: '2026-11-01', endDate: '2026-11-18' })
    expect(rows).toHaveLength(1001)
    expect(calls.map((c) => c.body.page)).toEqual([1, 2])
    ;({ f } = jsonFetch([{}]))
    tz = createTranzila(tranzilaConfigFromEnv(env), f)
    expect(await tz.listTransactions({ startDate: 'a', endDate: 'b' })).toEqual([])
    for (const bad of [
      { error_code: 401, message: 'no' },
      { transactions: 'x' },
      new Response('<html>', { status: 200 }),
      new Response('', { status: 500 }),
    ]) {
      ;({ f } = jsonFetch([bad]))
      tz = createTranzila(tranzilaConfigFromEnv(env), f)
      await expect(tz.listTransactions({ startDate: 'a', endDate: 'b' })).rejects.toThrow()
    }
  })

  it('tags session tokens with the environment', () => {
    const staging = createTranzila(tranzilaConfigFromEnv(env))
    const prod = createTranzila(tranzilaConfigFromEnv({ ...env, APP_ENV: 'production' }))
    const t = staging.newSessionToken()
    expect(t).toMatch(/^ms[0-9a-f]{16}$/)
    expect(prod.newSessionToken()).toMatch(/^mp/)
    expect(staging.tokenEnv(t)).toBe('s')
    expect(staging.sessionTokenValues({ a: t, b: 'nope', c: 5 })).toEqual([t])
  })
})

describe('verifyTransaction (fail closed)', () => {
  const token = 'ms0123456789abcdef'
  const row = (over: Record<string, unknown> = {}) =>
    normalizeRow({
      index: 7,
      amount: 39600,
      currency: 1,
      processor_response_code: '000',
      txn_type: 'debit',
      tranmode: 'A',
      payment_plan: 1,
      mr_token: token,
      ...over,
    })
  const ok = { amountAgorot: 39600, token }
  it('accepts exactly the charge we asked for', () => {
    expect(verifyTransaction(row(), ok)).toBe(true)
    expect(verifyTransaction(row({ payment_plan: 3 }), ok)).toBe(true)
    expect(verifyTransaction(row({ tranmode: '', payment_plan: '' }), ok)).toBe(true)
  })
  it.each([
    ['declined', { processor_response_code: '033' }],
    ['a hold', { tranmode: 'V' }],
    ['a card check', { tranmode: 'N' }],
    ['installments', { payment_plan: 8 }],
    ['no type', { txn_type: '' }],
    ['a refund', { txn_type: 'CREDIT' }],
    ['another currency', { currency: 2 }],
    ['a different amount', { amount: 39599 }],
    ['no amount', { amount: '' }],
    ['another token', { mr_token: 'ms000000000000000f' }],
  ])('refuses %s', (_, over) => {
    expect(verifyTransaction(row(over), ok)).toBe(false)
  })
  it('finds the token in any field', () => {
    expect(carriesToken({ x: 'a', y: token }, token)).toBe(true)
    expect(carriesToken({}, token)).toBe(false)
  })
})
