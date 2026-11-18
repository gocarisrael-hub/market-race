import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestApp, OWNER, ownerCookie } from '../helpers/app.ts'

describe('admin auth', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  beforeAll(async () => {
    t = await makeTestApp()
  })
  afterAll(() => t.close())

  it('rejects /me without a session', async () => {
    const res = await t.app.inject({ url: '/admin/api/me' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a wrong password', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/admin/api/login',
      payload: { email: OWNER.email, password: 'nope' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('logs in, reads /me, logs out', async () => {
    const cookie = await ownerCookie(t.app)
    const me = await t.app.inject({ url: '/admin/api/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)
    expect(me.json().owner.email).toBe(OWNER.email)

    await t.app.inject({ method: 'POST', url: '/admin/api/logout', headers: { cookie } })
    const after = await t.app.inject({ url: '/admin/api/me', headers: { cookie } })
    expect(after.statusCode).toBe(401)
  })

  it('serves a health check', async () => {
    const res = await t.app.inject({ url: '/healthz' })
    expect(res.json()).toEqual({ ok: true, env: 'test' })
  })
})
