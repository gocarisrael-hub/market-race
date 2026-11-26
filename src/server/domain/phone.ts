// Phone numbers, pure (shared by the server and the player bundle).

/** Israeli mobile "050-1234567" → "972501234567". Returns null for anything else. */
export function toWaId(phone: string): string | null {
  const d = phone.replace(/\D/g, '')
  if (/^05\d{8}$/.test(d)) return `972${d.slice(1)}`
  if (/^9725\d{8}$/.test(d)) return d
  return null
}

/** A click-to-chat link ("https://wa.me/972501234567?text=..."), or null for a number that isn't one. */
export function waLink(phone: string, text = ''): string | null {
  const id = toWaId(phone)
  if (!id) return null
  return text ? `https://wa.me/${id}?text=${encodeURIComponent(text)}` : `https://wa.me/${id}`
}

/**
 * Forgiving Israeli phone check: spaces, dashes, dots, brackets and a +972 / 972 / 00972 prefix are
 * fine. Accepts mobiles and 07x numbers (10 digits with the 0) and landlines (9 digits with the 0).
 */
export function isIsraeliPhone(phone: string): boolean {
  let d = phone.trim()
  if (!/^[0-9+\-\s().]+$/.test(d)) return false
  d = d.replace(/\D/g, '')
  if (d.startsWith('00972')) d = d.slice(5)
  else if (d.startsWith('972')) d = d.slice(3)
  if (!d.startsWith('0')) d = `0${d}`
  return /^0(?:[23489]\d{7}|[57]\d{8})$/.test(d)
}
