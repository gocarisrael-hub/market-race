import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db/index.ts'
import { ensureBootstrapOwner } from './lib/auth.ts'
import { seedDemo } from './services/seed-demo.ts'

const config = loadConfig()
const { db } = await openDb(config.databaseUrl)
await ensureBootstrapOwner(db, config.bootstrapOwner)
// Demo catalog for empty non-production databases only.
if ((process.env.SEED_DEMO === '1' || process.env.E2E_SEED === '1') && config.env !== 'production') {
  await seedDemo(db)
}
const app = await buildApp({ db, config })
await app.listen({ port: config.port, host: '0.0.0.0' })
