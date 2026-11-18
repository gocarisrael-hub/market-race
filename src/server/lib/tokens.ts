import { createHash, randomBytes } from 'node:crypto'

/** URL-safe random token. 18 bytes = 24 chars, ~144 bits. */
export function randomToken(bytes = 18): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
