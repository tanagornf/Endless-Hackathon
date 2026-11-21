import type { ApiResult } from '@nless/shared/core/types';
import { SEED } from '@nless/shared/core/fixtures';
import type { ImportView } from '@nless/shared/features/knowledge-import/types';
import type { APIRequestContext, Page, TestInfo } from '@playwright/test';
import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

const shop = SEED.businesses.find(item => item.alias === 'biz_demo_a')!;
const businessPath = '/api/v1/businesses/' + shop.id;
const imports = businessPath + '/imports';
const sku = 'A-CARD-01';
const normalPrice = 9_900;
const temporaryPrice = 10_900;
const csrf = { 'X-Requested-With': 'nless' };
const mapping = { target: 'catalog', mapping: { catalog: { sku: 0, name: 1, price: 2 } }, options: { catalogMode: 'update_existing' } };
const csvCell = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const productRow = (productSku: string, name: string, priceMinor: number) => [productSku, csvCell(name), String(priceMinor / 100)].join(',');

interface CatalogRow { id: string; sku: string; name: string; priceMinor: number; active: boolean }
interface Timing { parseMs: number; commitMs: number; answerMs: number; totalMs: number }

async function products(api: APIRequestContext, query: string): Promise<CatalogRow[]> {
  const response = await api.get(businessPath + '/catalog/items', { params: { q: query, status: 'all', limit: '100' } });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  return data.items;
}

async function originalItem(api: APIRequestContext): Promise<CatalogRow> {
  const match = (await products(api, sku)).find(item => item.sku === sku);
  expect(match).toMatchObject({ sku, active: true });
  return match!;
}

async function getImport(api: APIRequestContext, path: string): Promise<ImportView> {
  const response = await api.get(path);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as ApiResult<ImportView>).data;
}

async function waitForImport(api: APIRequestContext, path: string, states: ImportView['state'][]): Promise<ImportView> {
  let current: ImportView | undefined;
  await expect.poll(async () => {
    current = await getImport(api, path);
    return states.includes(current.state) || current.state === 'failed' || current.state === 'cancelled';
  }, { timeout: 55_000 }).toBe(true);
  return current!;
}

async function restorePrice(api: APIRequestContext, label: string, original: CatalogRow): Promise<void> {
  const staged = await api.post(imports + '/file', {
    headers: csrf, multipart: {
      file: { name: label + '-restore.csv', mimeType: 'text/csv',
        buffer: Buffer.from('SKU,Name,Price\n' + productRow(sku, original.name, normalPrice)) },
    },
  });
  expect(staged.status()).toBe(202);
  const { data } = await staged.json();
  const path = imports + '/' + data.id;
  expect((await waitForImport(api, path, ['awaiting_mapping'])).state).toBe('awaiting_mapping');
  const mapped = await api.post(path + '/mapping', { headers: csrf, data: mapping });
  expect(mapped.status()).toBe(202);
  expect((await waitForImport(api, path, ['review'])).state).toBe('review');
  const committed = await api.post(path + '/commit', { headers: csrf, data: {} });
  expect(committed.status()).toBe(202);
  expect((await waitForImport(api, path, ['done'])).state).toBe('done');
  expect(await originalItem(api)).toMatchObject({ id: original.id, name: original.name, active: true, priceMinor: normalPrice });
}

async function cleanupDrafts(api: APIRequestContext, syntheticPrefix: string, createdSkus: Set<string>): Promise<void> {
  const matching = (await products(api, syntheticPrefix)).filter(item => createdSkus.has(item.sku));
  for (const item of matching) {
    expect(item.active).toBe(false);
    const response = await api.delete(businessPath + '/catalog/items/' + item.id, { headers: csrf });
    expect(response.ok()).toBe(true);
  }
  expect((await products(api, syntheticPrefix)).filter(item => createdSkus.has(item.sku))).toEqual([]);
}

async function measureRound(page: Page, api: APIRequestContext, testInfo: TestInfo, round: number): Promise<Timing> {
  const label = e2eMarker() + '-metric-' + round;
  const prefix = label.toUpperCase();
  const skus = Array.from({ length: 19 }, (_, index) => prefix + '-' + (index + 1));
  const original = await originalItem(api);
  expect(original.priceMinor, 'the demo SKU must be at 99 baht before a round').toBe(normalPrice);

  await page.goto('/imports');
  await page.getByRole('button', { name: 'New import', exact: true }).click();
  await page.getByTestId('import-file').setInputFiles({
    name: label + '.csv', mimeType: 'text/csv', buffer: Buffer.from([
      'SKU,Name,Price', productRow(sku, original.name, temporaryPrice),
      ...skus.map((draftSku, index) => productRow(draftSku, 'Timing draft ' + (index + 1), 9900)),
    ].join('\n')),
  });
  const upload = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(imports + '/file'));
  await page.getByRole('dialog').getByRole('button', { name: 'Upload', exact: true }).click();
  const staged = await upload;
  expect(staged.status()).toBe(202);
  const { data } = await staged.json();
  const path = imports + '/' + data.id;

  let requestedCommit = false;
  try {
    await page.getByRole('checkbox', { name: 'Update existing products with matching codes' }).check();
    await page.getByRole('button', { name: 'Check rows', exact: true }).click();
    await expect(page.getByText('Review rows', { exact: true })).toBeVisible();
    expect((await getImport(api, path)).counts).toMatchObject({ total: 20, ready: 20 });
    const start = performance.now();
    await page.getByTestId('import-commit').click();
    const submission = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(path + '/commit'));
    requestedCommit = true;
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm import', exact: true }).click();
    const accepted = await submission;
    if (accepted.status() >= 400 && accepted.status() < 500) requestedCommit = false;
    expect(accepted.status()).toBe(202);
    await expect(page.getByText('Import finished', { exact: true })).toBeVisible();
    const { timings, counts } = await getImport(api, path);
    expect(counts).toMatchObject({ written: 19, updated: 1, error: 0 });

    await page.goto('/demo-chat/s/demo-boardgame');
    await expect(page.getByTestId('demo-chat-input')).toBeEnabled();
    const replies = page.locator('[data-testid="demo-chat-message"][data-author="ai"]');
    const existing = await replies.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-message-id')));
    await page.getByTestId('demo-chat-input').fill('How much is A-CARD-01?');
    await page.getByTestId('demo-chat-send').click();
    await expect.poll(() => replies.evaluateAll((nodes, listed) => nodes.some(node =>
      !listed.includes(node.getAttribute('data-message-id')) && /\b109\s*baht\b|฿\s*109\b|109\s*บาท/i.test(node.textContent ?? ''),
    ), existing), { timeout: 35_000 }).toBe(true);

    const parseMs = Date.parse(timings.readyAt!) - Date.parse(timings.uploadedAt);
    const commitMs = Date.parse(timings.committedAt!) - Date.parse(timings.commitStartedAt!);
    const answerMs = Math.round(performance.now() - start);
    expect(parseMs).toBeGreaterThanOrEqual(0);
    expect(commitMs).toBeGreaterThanOrEqual(0);
    const timing: Timing = { parseMs, commitMs, answerMs, totalMs: parseMs + commitMs + answerMs };
    await testInfo.attach('f06-metric-round-' + round, { body: JSON.stringify(timing), contentType: 'application/json' });
    return timing;
  } finally {
    if (requestedCommit) {
      try {
        await waitForImport(api, path, ['done']);
      } finally {
        try { await restorePrice(api, label, original); }
        finally { await cleanupDrafts(api, prefix, new Set(skus)); }
      }
    }
  }
}

test.describe('knowledge-import coordinated demo price measurement', () => {
  test.skip(process.env.F06_METRIC !== '1', 'Opt in to the coordinated demo price measurement');

  test('metric: upload to price answer', async ({ ownerPage, api }, testInfo) => {
    test.setTimeout(240_000);
    await setUiLanguage(ownerPage, 'en');
    await ownerPage.addInitScript(businessId => localStorage.setItem('nless.businessId', businessId), shop.id);
    const timings: Timing[] = [];
    for (let round = 1; round <= 3; round++) timings.push(await measureRound(ownerPage, api, testInfo, round));
    const median = timings.map(entry => entry.totalMs).sort((a, b) => a - b)[1];
    await testInfo.attach('f06-metric-summary', {
      contentType: 'application/json', body: JSON.stringify({ sampleSize: timings.length, rowsPerSheet: 20, medianMs: median, timings }),
    });
    console.log('F06_METRIC upload_to_answer_ms=' + median + ' n=3');
  });
});
