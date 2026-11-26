// One-off: the occasion changes of 2026-11-26 on a database that is never seeded (production).
// Renames "אהבה וזוגיות" and "משפחתי" (only if still named so), deactivates "יום הולדת להורה", adds
// "יום הולדת לילד" and "יום נישואים" with their question sets (inactive until they have a price), and
// offers them on the matching styles. Nothing is deleted and owner edits are left alone.
// usage: node scripts/occasions-2026-11.ts            (dry run: prints what it would do)
//        node scripts/occasions-2026-11.ts --apply    (on Railway: railway ssh, from /app)
import { loadConfig } from '../src/server/config.ts'
import { openDb } from '../src/server/db/index.ts'
import { updateOccasions } from '../src/server/services/occasions-update.ts'

const config = loadConfig()
const h = await openDb(config.databaseUrl)
const log = await updateOccasions(h.db, { apply: process.argv.includes('--apply') })
for (const line of log) console.log(line)
if (!log.length) console.log('nothing to do')
await h.close()
