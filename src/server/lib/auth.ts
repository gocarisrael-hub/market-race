// Owner accounts and cookie sessions for the admin.
import bcrypt from 'bcryptjs'
import { and, eq, gt } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { DB } from '../db/index.ts'
import { owners, sessions } from '../db/schema.ts'
import { randomToken, sha256 } from './tokens.ts'

export const SESSION_COOKIE = 'mr_admin'
const SESSION_DAYS = 30
let dummyHash: string | undefined

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 11)
}

export async function createOwner(db: DB, email: string, password: string, name = '') {
  const [row] = await db
    .insert(owners)
    .values({ email: email.toLowerCase(), name, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning()
  return row ?? null
}

/** Creates the bootstrap owner only when there are no owners yet. */
export async function ensureBootstrapOwner(db: DB, boot: { email: string; password: string } | null) {
  if (!boot) return
  const existing = await db.select({ id: owners.id }).from(owners).limit(1)
  if (existing.length === 0) await createOwner(db, boot.email, boot.password)
}

export async function login(db: DB, email: string, password: string): Promise<string | null> {
  const [owner] = await db.select().from(owners).where(eq(owners.email, email.toLowerCase()))
  // Compare against a dummy hash when the owner does not exist, to keep timing flat.
  dummyHash ??= bcrypt.hashSync('not-a-password', 11)
  const hash = owner?.passwordHash ?? dummyHash
  const ok = await bcrypt.compare(password, hash)
  if (!owner || !ok) return null
  const token = randomToken(32)
  await db.insert(sessions).values({
    id: sha256(token),
    ownerId: owner.id,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
  })
  return token
}

export async function logout(db: DB, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)))
}

export async function ownerForToken(db: DB, token: string | undefined) {
  if (!token) return null
  const [row] = await db
    .select({ id: owners.id, email: owners.email, name: owners.name })
    .from(sessions)
    .innerJoin(owners, eq(owners.id, sessions.ownerId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
  return row ?? null
}

export type Owner = NonNullable<Awaited<ReturnType<typeof ownerForToken>>>

declare module 'fastify' {
  interface FastifyRequest {
    owner?: Owner
  }
}

export function requireOwner(db: DB) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const owner = await ownerForToken(db, req.cookies[SESSION_COOKIE])
    if (!owner) return reply.code(401).send({ error: 'unauthorized' })
    req.owner = owner
  }
}
