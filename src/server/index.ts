import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db/index.ts'
import { ensureBootstrapOwner } from './lib/auth.ts'

const config = loadConfig()
const { db } = await openDb(config.databaseUrl)
await ensureBootstrapOwner(db, config.bootstrapOwner)
const app = await buildApp({ db, config })
await app.listen({ port: config.port, host: '0.0.0.0' })
