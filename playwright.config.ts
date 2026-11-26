import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets two checkouts run the suite side by side.
const PORT = Number(process.env.E2E_PORT ?? 3999)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, locale: 'he-IL', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'rm -rf .data/e2e && node src/server/index.ts',
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      APP_ENV: 'test',
      DATABASE_URL: 'pglite:.data/e2e/db',
      UPLOAD_DIR: '.data/e2e/uploads',
      PUBLIC_BASE_URL: `http://localhost:${PORT}`,
      ADMIN_BOOTSTRAP_EMAIL: 'owner@example.com',
      ADMIN_BOOTSTRAP_PASSWORD: 'e2e-password',
      E2E_SEED: '1',
      PAYMENT_PROVIDER: 'mock',
      // The companies site's domain: Chromium resolves *.localhost to this machine.
      COMPANY_HOSTS: 'companies.localhost',
    },
  },
})
