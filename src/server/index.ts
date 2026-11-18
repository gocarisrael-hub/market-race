import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db/index.ts'
import { ensureBootstrapOwner } from './lib/auth.ts'
import { servicesFromEnv } from './services/context.ts'
import { createPaymentSweeper } from './services/payments.ts'
import { seedDemo } from './services/seed-demo.ts'

const config = loadConfig()
const { db } = await openDb(config.databaseUrl)
await ensureBootstrapOwner(db, config.bootstrapOwner)
// Demo catalog for empty non-production databases only.
if ((process.env.SEED_DEMO === '1' || process.env.E2E_SEED === '1') && config.env !== 'production') {
  await seedDemo(db)
}
const services = servicesFromEnv()
// Payments settle only from the terminal's own rows: sweep at boot (reads back a deploy gap),
// then on a cadence, and whenever a notify asks.
const sweeper = services.tranzila.isConfigured()
  ? await createPaymentSweeper(db, services, config.publicBaseUrl)
  : null
const app = await buildApp({ db, config, services, sweeper })
await app.listen({ port: config.port, host: '0.0.0.0' })
if (sweeper) {
  const logSweep = (e: unknown) => console.error(`[tranzila] sweep failed: ${(e as Error)?.message ?? e}`)
  sweeper.sweep().catch(logSweep)
  setInterval(() => sweeper.tick().catch(logSweep), 15_000).unref()
}
