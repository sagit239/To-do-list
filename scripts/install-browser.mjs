// Installs Playwright's Chromium inside node_modules (PLAYWRIGHT_BROWSERS_PATH=0), per ADR-11.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.CI_SKIP_BROWSER_INSTALL || !existsSync('node_modules/@playwright/test')) {
  process.exit(0);
}

const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
});
process.exit(result.status ?? 0);
