// Two sites from one service: the private site (celebrating a person) and the companies site.
// A request whose Host is one of COMPANY_HOSTS gets the companies site; its `/` is the companies
// landing. The site bundle is the same; the server marks the page so the app knows which site it is.

export type Site = 'private' | 'companies'

/** Which site a request's Host header belongs to. */
export function siteForHost(host: string | undefined, companyHosts: string[]): Site {
  if (!host || companyHosts.length === 0) return 'private'
  const name = host.trim().toLowerCase().replace(/:\d+$/, '')
  return companyHosts.includes(name) ? 'companies' : 'private'
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Marks the site's index.html for the companies site: `data-site` on <html>, and `data-home`
 * (the private site's origin) for the companies site's quiet link back.
 */
export function markSite(html: string, site: Site, privateHome: string): string {
  if (site === 'private') return html
  return html.replace(/<html\b/i, `<html data-site="companies" data-home="${escapeAttr(privateHome)}"`)
}
