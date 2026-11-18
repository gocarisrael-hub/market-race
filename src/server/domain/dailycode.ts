// The day's redemption code, per market. Vendors read it from the printed rules / admin each morning.
import { createHmac } from 'node:crypto'

export function dailyCode(secret: string, date: string, digits = 4): string {
  const h = createHmac('sha256', secret).update(`daily:${date}`).digest()
  const n = h.readUInt32BE(0) % 10 ** digits
  return String(n).padStart(digits, '0')
}
