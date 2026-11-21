import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
export default defineConfig({
  testDir: '.',
  testMatch: ['tests/e2e/*.spec.ts', 'web/src/features/*/e2e/*.spec.ts'],
  workers: 1, timeout: 60000, expect: { timeout: 10000 }, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { ...devices['Desktop Chrome'], baseURL: process.env.E2E_BASE_URL || 'http://localhost:' + (process.env.WEB_PORT || '5170'),
    locale: 'th-TH', timezoneId: 'Asia/Bangkok', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
