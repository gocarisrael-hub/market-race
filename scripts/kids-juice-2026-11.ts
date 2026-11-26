// One-off: kids get juice instead of beer (2026-11-26), on a database that is never seeded
// (production). Marks the kid's birthday as a kids' occasion, the beer and cider as adults-only,
// and adds "מיץ" at the stall that pours them. Nothing is deleted and owner edits are left alone.
// Run after scripts/occasions-2026-11.ts (which adds the kid's birthday).
// usage: node scripts/kids-juice-2026-11.ts            (dry run: prints what it would do)
//        node scripts/kids-juice-2026-11.ts --apply    (on Railway: railway ssh, from /app)
import { loadConfig } from '../src/server/config.ts'
import { openDb } from '../src/server/db/index.ts'
import { updateKidsTastings } from '../src/server/services/kids-update.ts'

const config = loadConfig()
const h = await openDb(config.databaseUrl)
const log = await updateKidsTastings(h.db, { apply: process.argv.includes('--apply') })
for (const line of log) console.log(line)
if (!log.length) console.log('nothing to do')
await h.close()
