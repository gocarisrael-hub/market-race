// npm run seed: loads the demo catalog into an empty database (never production).
import { loadConfig } from './config.ts'
import { openDb } from './db/index.ts'
import { seedDemo } from './services/seed-demo.ts'

const config = loadConfig()
if (config.env === 'production') throw new Error('refusing to seed production')
const h = await openDb(config.databaseUrl)
console.log(await seedDemo(h.db))
await h.close()
