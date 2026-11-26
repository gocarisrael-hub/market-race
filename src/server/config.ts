// Runtime configuration. Secrets come from Railway variables only.
export interface Config {
  env: 'development' | 'test' | 'staging' | 'production'
  port: number
  databaseUrl: string
  uploadDir: string
  publicBaseUrl: string
  /** Hosts (lower case, no port) that are the companies site: `/` there is the companies landing. */
  companyHosts: string[]
  bootstrapOwner: { email: string; password: string } | null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appEnv = (env.APP_ENV ??
    (env.NODE_ENV === 'production' ? 'production' : 'development')) as Config['env']
  const port = Number(env.PORT ?? 3000)
  return {
    env: appEnv,
    port,
    databaseUrl: env.DATABASE_URL ?? 'pglite:.data/db',
    uploadDir: env.UPLOAD_DIR ?? '.data/uploads',
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    companyHosts: parseHosts(env.COMPANY_HOSTS),
    bootstrapOwner:
      env.ADMIN_BOOTSTRAP_EMAIL && env.ADMIN_BOOTSTRAP_PASSWORD
        ? { email: env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase(), password: env.ADMIN_BOOTSTRAP_PASSWORD }
        : null,
  }
}

/** "a.example, B.example:443" → ["a.example", "b.example"]. */
export function parseHosts(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/:\d+$/, ''))
    .filter(Boolean)
}
