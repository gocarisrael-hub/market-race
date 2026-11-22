// One-off: redraws every order photo in the live game-photo look (src/server/photos/rerender.ts).
// usage: node scripts/rerender-photos.ts [--dry]     (on staging: railway ssh, from /app)
import { loadConfig } from '../src/server/config.ts'
import { openDb } from '../src/server/db/index.ts'
import { rerenderPhotos } from '../src/server/photos/rerender.ts'

const config = loadConfig()
if (config.env === 'production' && !process.argv.includes('--production'))
  throw new Error('production photos are the owner’s call: pass --production to redraw them')
const h = await openDb(config.databaseUrl)
const result = await rerenderPhotos(h.db, config.uploadDir, {
  dry: process.argv.includes('--dry'),
  log: (l) => console.log(l),
})
console.log(`redrawn ${result.done}, failed ${result.failed}`)
await h.close()
