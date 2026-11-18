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
