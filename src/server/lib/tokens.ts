import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** URL-safe random token. 18 bytes = 24 chars, ~144 bits. */
export function randomToken(bytes = 18): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * The captain's capability in the game: derived from the manage token, so only someone who holds
 * the manage link can have it, and it does not reveal the manage token itself. The manage page
 * hands it to the captain's phone; the bare game link never carries it.
 */
export function captainToken(manageToken: string): string {
  return createHash('sha256').update(`captain:${manageToken}`).digest('base64url').slice(0, 32)
}

/** Constant-time check of a captain token against the order's manage token. */
export function isCaptainToken(manageToken: string, candidate: string | null | undefined): boolean {
  if (!candidate) return false
  const want = Buffer.from(captainToken(manageToken))
  const got = Buffer.from(candidate)
  return want.length === got.length && timingSafeEqual(want, got)
}
