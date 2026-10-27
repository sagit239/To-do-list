import { defineConfig, devices } from '@playwright/test';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';

// E2E runs against `vercel dev` and the Dev database only (ADR-11).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'he-IL',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vercel dev --listen 3000 --yes',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
