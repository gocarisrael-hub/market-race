// WhatsApp over Whapi Cloud. Dormant until WHATSAPP_ENABLED=1 and WHAPI_TOKEN are set.
// Messaging new numbers can get a WhatsApp number banned (seen on Dugri), so messages to
// customers are additionally gated by the `whatsapp_to_customers` setting (off by default).
import { toWaId } from '../domain/phone.ts'

export { toWaId }

export interface WhatsAppConfig {
  enabled: boolean
  token: string
  baseUrl: string
  ownerNumber: string
}

export function whatsappConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  return {
    enabled: env.WHATSAPP_ENABLED === '1',
    token: env.WHAPI_TOKEN ?? '',
    baseUrl: (env.WHAPI_BASE_URL ?? 'https://gate.whapi.cloud').replace(/\/+$/, ''),
    ownerNumber: env.OWNER_WHATSAPP ?? '',
  }
}

export interface WhatsApp {
  isConfigured(): boolean
  sendText(to: string, body: string): Promise<boolean>
}

export function createWhatsApp(cfg: WhatsAppConfig, fetchImpl: typeof fetch = fetch): WhatsApp {
  const isConfigured = () => cfg.enabled && Boolean(cfg.token)
  return {
    isConfigured,
    async sendText(to, body) {
      const id = toWaId(to)
      if (!isConfigured() || !id) return false
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10_000)
      try {
        const res = await fetchImpl(`${cfg.baseUrl}/messages/text`, {
          method: 'POST',
          headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ to: id, body }),
          signal: ctrl.signal,
        })
        return res.ok
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
