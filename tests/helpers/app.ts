import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildApp } from '../../src/server/app.ts'
import type { Config } from '../../src/server/config.ts'
import { openDb } from '../../src/server/db/index.ts'
import { createOwner } from '../../src/server/lib/auth.ts'

export const OWNER = { email: 'owner@example.com', password: 'correct horse battery' }

export async function makeTestApp(overrides: Partial<Config> = {}) {
  const handle = await openDb('pglite:memory')
  const config: Config = {
    env: 'test',
    port: 0,
    databaseUrl: 'pglite:memory',
    uploadDir: mkdtempSync(path.join(tmpdir(), 'mr-uploads-')),
    publicBaseUrl: 'http://localhost',
    bootstrapOwner: null,
    ...overrides,
  }
  const app = await buildApp({ db: handle.db, config })
  await createOwner(handle.db, OWNER.email, OWNER.password)
  const close = async () => {
    await app.close()
    await handle.close()
  }
  return { app, db: handle.db, config, close }
}

/** Logs in as the test owner and returns the cookie header to send. */
export async function ownerCookie(app: Awaited<ReturnType<typeof makeTestApp>>['app']) {
  const res = await app.inject({ method: 'POST', url: '/admin/api/login', payload: OWNER })
  const c = res.cookies.find((x) => x.name === 'mr_admin')
  if (!c) throw new Error(`login failed: ${res.statusCode} ${res.body}`)
  return `mr_admin=${c.value}`
}
