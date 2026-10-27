import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// Integration tests run only against the Dev project, via DATABASE_URL from .env (ADR-7).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules/**'],
    env: loadEnv('', process.cwd(), ''),
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
