// Database connection. Postgres (DATABASE_URL) in staging/production; embedded PGlite for local dev and tests.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema.ts'

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url))

export interface DbHandle {
  db: DB
  close: () => Promise<void>
}

/**
 * url: a postgres:// URL, "pglite:<dir>" for an on-disk PGlite, or "pglite:memory".
 */
export async function openDb(url: string): Promise<DbHandle> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle } = await import('drizzle-orm/pglite')
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    const where = url.slice('pglite:'.length)
    if (where !== 'memory') mkdirSync(where, { recursive: true })
    const client = where === 'memory' ? new PGlite() : new PGlite(where)
    const db = drizzle(client, { schema, casing: 'snake_case' })
    await migrate(db, { migrationsFolder })
    return { db: db as unknown as DB, close: () => client.close() }
  }
  const pg = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  const pool = new pg.default.Pool({ connectionString: url, max: 10 })
  const db = drizzle(pool, { schema, casing: 'snake_case' })
  await migrate(db, { migrationsFolder })
  return { db: db as unknown as DB, close: () => pool.end() }
}

export { schema }
