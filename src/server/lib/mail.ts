// Email over the Resend HTTPS API (Railway blocks outbound SMTP). Dormant until configured:
// with no RESEND_API_KEY every send returns false and is logged as skipped.
export interface MailConfig {
  apiKey: string
  from: string
  replyTo: string
  ownerEmail: string
}

export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig {
  return {
    apiKey: env.RESEND_API_KEY ?? '',
    from: env.MAIL_FROM ?? '',
    replyTo: env.REPLY_TO ?? env.OWNER_EMAIL ?? '',
    ownerEmail: env.OWNER_EMAIL ?? '',
  }
}

export interface Mailer {
  isConfigured(): boolean
  send(msg: { to: string; subject: string; html: string; text: string }): Promise<boolean>
}

export function createMailer(cfg: MailConfig, fetchImpl: typeof fetch = fetch): Mailer {
  const isConfigured = () => Boolean(cfg.apiKey && cfg.from)
  return {
    isConfigured,
    async send(msg) {
      if (!isConfigured() || !msg.to) return false
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10_000)
      try {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: cfg.from,
            to: [msg.to],
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
          }),
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
