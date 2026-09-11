import { defineConfig, devices } from '@playwright/test'

/**
 * E2E configuration. Boots the API server (in-memory store) and the Vite dev
 * server, then runs the specs against http://localhost:3000.
 */
// Override when :4000 is busy on your machine, e.g. `E2E_API_PORT=4100 pnpm test:e2e`.
const API_PORT = process.env.E2E_API_PORT ?? '4000'
const API_URL = `http://localhost:${API_PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'uk-UA',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /.*\.mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @kontext/server dev',
      url: `${API_URL}/healthz`,
      env: {
        STORE: 'memory',
        PORT: API_PORT,
        API_ORIGIN: API_URL,
        WEB_ORIGIN: 'http://localhost:3000',
        JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-jwt-secret-e2e-jwt-secret-e2e-jwt-secret',
        COOKIE_SECRET: process.env.COOKIE_SECRET ?? 'e2e-cookie-secret-e2e-cookie-secret-e2e',
      },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @kontext/web dev',
      url: 'http://localhost:3000',
      env: { VITE_DEV_PROXY_TARGET: API_URL, VITE_API_URL: '' },
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
