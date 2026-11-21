import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setUiLanguage } from './fixtures';

test.use({ channel: process.env.E2E_OPS_BROWSER_CHANNEL, serviceWorkers: 'block' });

const host = 'http://ops.test';
const dist = resolve(process.env.E2E_OPS_DIST || 'web/dist');
const index = resolve(dist, 'index.html');
const now = '2026-11-21T05:00:00Z';
const job = {
  id: 'fixture-job', type: 'test.sleep', state: 'dead', businessId: null, attempts: 3, maxAttempts: 3,
  runAt: now, createdAt: now, lastError: 'Fixture timeout',
};
const summary = {
  now, counts: { queued: 0, running: 0, succeeded: 0, failed: 0, dead: 1, cancelled: 0 },
  oldestQueuedAgeSeconds: null, dead24h: 1, byType24h: [{ type: job.type, succeeded: 0, dead: 1, avgMs: null }],
  worker: { enabled: true, running: true, inFlight: 0, concurrency: 4 },
  scheduler: { enabled: true, holdsLock: true }, deliveriesNeedingAttention: 0, demoResetting: false,
};

async function fixture(page: Page, admin: boolean) {
  const writes: { path: string; method: string; body: string | null; requestedWith?: string }[] = [];
  const opsReads: string[] = [];
  let queued = false;
  let release!: () => void;
  const firstJobs = new Promise<void>((done) => { release = done; });

  // Both app assets and API responses come from local fixtures. Requests never reach a live server.
  await page.context().route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== host) return route.abort();
    const path = url.pathname;
    if (path === '/ops') return route.fulfill({ path: index, contentType: 'text/html' });
    if (!path.startsWith('/api/')) {
      const file = resolve(dist, '.' + path);
      return file.startsWith(dist + sep) && existsSync(file) && !path.endsWith('/')
        ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
    }
    const method = request.method();
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (method !== 'GET') {
      writes.push({ path, method, body: request.postData(), requestedWith: request.headers()['x-requested-with'] });
      if (admin && path === '/api/v1/ops/jobs/fixture-job/retry' && method === 'POST') {
        queued = true;
        return data({ ...job, state: 'queued' });
      }
      return route.fulfill({ status: 405 });
    }
    if (path === '/api/v1/me') return data({
      user: { id: 'fixture-user', displayName: 'Fixture user', email: 'fixture@example.test', isPlatformAdmin: admin },
      businesses: [],
    });
    if (path === '/api/v1/features') return data({ production: true, items: [] });
    if (path === '/api/v1/features/visible') return data({ visibleFeatureIds: [] });
    if (path.startsWith('/api/v1/ops/')) {
      opsReads.push(path);
      if (!admin) return route.fulfill({ status: 403, json: { error: { code: 'PERMISSION_DENIED' } } });
      if (path === '/api/v1/ops/summary') return data(summary);
      if (path === '/api/v1/ops/jobs') {
        await firstJobs;
        const rows = queued && url.searchParams.get('state') === 'dead' ? [] : [{ ...job, state: queued ? 'queued' : 'dead' }];
        return data({ items: rows, nextCursor: null });
      }
    }
    return route.fulfill({ status: 404 });
  });
  return { writes, opsReads, release };
}

test.describe('F35 operations browser smoke against synthetic fixtures', () => {
  test.skip(!existsSync(index), 'Build the frontend with npm run build or set E2E_OPS_DIST to a built frontend.');

  test('administrator uses keyboard, confirms retry, and switches to Thai', async ({ page }) => {
    const data = await fixture(page, true);
    await setUiLanguage(page, 'en');
    await page.goto(host + '/ops');
    await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Jobs' })).toBeVisible();
    const table = page.getByRole('table');
    await expect(table).toHaveAttribute('aria-busy', 'true');
    data.release();
    const retry = page.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeVisible();
    await retry.focus();
    await page.keyboard.press('Enter');
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(retry).toBeFocused();
    expect(data.writes).toEqual([]);
    await page.keyboard.press('Enter');
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog).toBeHidden();
    expect(data.writes).toEqual([{ path: '/api/v1/ops/jobs/fixture-job/retry', method: 'POST', body: null, requestedWith: 'nless' }]);

    await page.getByRole('tab', { name: 'Jobs', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Dead letters' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/tab=dead/);
    await expect(page.getByRole('tabpanel', { name: 'Dead letters' })).toBeVisible();
    await page.getByTestId('lang-switch').getByRole('button', { name: 'TH' }).click();
    await expect(page.getByRole('heading', { name: 'เครื่องมือผู้ดูแลระบบ' })).toBeVisible();
    await expect(page.getByText('ไม่มีงานตามตัวกรอง')).toBeVisible();
  });

  test('signed-in non-admin sees Not Found and no ops navigation', async ({ page }) => {
    const data = await fixture(page, false);
    data.release();
    await setUiLanguage(page, 'en');
    await page.goto(host + '/ops');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Jobs' })).toHaveCount(0);
    expect(data.opsReads).toEqual([]);
    expect(data.writes).toEqual([]);
  });
});

const readOnly = process.env.E2E_OPS_READ_ONLY === '1' && Boolean(process.env.E2E_BASE_URL);
const adminState = process.env.E2E_OPS_ADMIN_STATE;
const ownerState = process.env.E2E_OPS_OWNER_STATE;

test.describe('F35 read-only live operations smoke', () => {
  test.skip(!readOnly, 'Set E2E_OPS_READ_ONLY=1 and E2E_BASE_URL for live checks.');

  test('reports healthy, ready and an identified public build', async ({ request }) => {
    const [health, ready, build] = await Promise.all([
      request.get('/healthz'), request.get('/readyz'), request.get('/build-info'),
    ]);
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toMatchObject({ worker: { running: true } });
    expect(build.status()).toBe(200);
    const info = await build.json();
    expect(info.sha).toMatch(/^[0-9a-f]{7,40}$/i);
    expect(JSON.stringify(info)).not.toMatch(/secret/i);
  });

  test('denies a signed-in shop owner at the operations API', async ({ playwright, baseURL }) => {
    test.skip(!ownerState, 'E2E_OPS_OWNER_STATE must point to an existing authenticated owner storage state.');
    const api = await playwright.request.newContext({ baseURL, storageState: ownerState });
    try {
      expect((await api.get('/api/v1/ops/summary')).status()).toBe(403);
    } finally {
      await api.dispose();
    }
  });

  test('admin sees jobs, schedule status, and the deployed build SHA', async ({ browser, baseURL }) => {
    test.skip(!adminState, 'E2E_OPS_ADMIN_STATE must point to an existing authenticated admin storage state.');
    const context = await browser.newContext({ baseURL, storageState: adminState, serviceWorkers: 'block' });
    try {
      await context.route('**/*', (route) => route.request().method() === 'GET' ? route.continue() : route.abort());
      const page = await context.newPage();
      await setUiLanguage(page, 'en');
      await page.goto('/ops');
      await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
      await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false');
      await page.getByRole('tab', { name: 'Schedules' }).click();
      await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false');
      await expect(page.getByText('Declared in the spec but not registered')).toHaveCount(0);
      const { sha } = await (await context.request.get('/build-info')).json();
      await page.getByRole('tab', { name: 'System' }).click();
      await expect(page.getByText(sha, { exact: false })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
