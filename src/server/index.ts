import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db/index.ts'
import { ensureBootstrapOwner } from './lib/auth.ts'
import { servicesFromEnv } from './services/context.ts'
import { createErrorAlerter, expireOrders } from './services/jobs.ts'
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
if (services.paymentProvider === 'mock' && !services.mockAllowed) {
  console.error('[payment] PAYMENT_PROVIDER=mock is refused in production: card payment is OFF')
}
// Payments settle only from the terminal's own rows: sweep at boot (reads back a deploy gap),
// then on a cadence, and whenever a notify asks.
const sweeper =
  services.paymentProvider === 'tranzila' && services.tranzila.isConfigured()
    ? await createPaymentSweeper(db, services, config.publicBaseUrl)
    : null
const reportError = createErrorAlerter(services)
const app = await buildApp({ db, config, services, sweeper, reportError })
await app.listen({ port: config.port, host: '0.0.0.0' })
if (sweeper) {
  const logSweep = (e: unknown) => console.error(`[tranzila] sweep failed: ${(e as Error)?.message ?? e}`)
  sweeper.sweep().catch(logSweep)
  setInterval(() => sweeper.tick().catch(logSweep), 15_000).unref()
}

// Hourly housekeeping.
const housekeeping = () =>
  expireOrders(db).catch((e) => console.error(`[jobs] expire failed: ${(e as Error)?.message ?? e}`))
housekeeping()
setInterval(housekeeping, 60 * 60_000).unref()
