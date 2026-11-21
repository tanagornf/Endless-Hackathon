import type { Page } from '@playwright/test';
import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

const csrf = { 'X-Requested-With': 'nless' };

async function start(page: Page, language: 'en' | 'th') {
  await setUiLanguage(page, language);
  await page.goto('/imports');
  await expect(page.getByRole('heading', { name: language === 'en' ? 'Import data' : 'นำเข้าข้อมูล' })).toBeVisible();
  await page.getByRole('button', { name: language === 'en' ? 'New import' : 'นำเข้าใหม่', exact: true }).click();
  return page.getByRole('dialog');
}

async function commit(page: Page, language: 'en' | 'th') {
  const request = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/commit'));
  await page.getByTestId('import-commit').click();
  await page.getByRole('dialog').getByRole('button', { name: language === 'en' ? 'Confirm import' : 'ยืนยันการนำเข้า', exact: true }).click();
  const response = await request;
  expect(response.status()).toBe(202);
  await expect(page.getByText(language === 'en' ? 'Import finished' : 'นำเข้าเสร็จแล้ว', { exact: true })).toBeVisible();
  return response.url().slice(0, -'/commit'.length);
}

test('knowledge-import pastes English text and saves a knowledge draft', async ({ ownerPage, api }) => {
  const marker = e2eMarker();
  const dialog = await start(ownerPage, 'en');
  await dialog.getByRole('tab', { name: 'Paste text' }).click();
  await dialog.getByRole('textbox', { name: 'Text label' }).fill(marker);
  await dialog.getByRole('textbox', { name: 'Text to import' }).fill('# ' + marker + '\nThis test store opens every day from 10:00 to 20:00.');
  await dialog.getByRole('combobox', { name: 'How to read the text' }).click();
  await ownerPage.getByRole('option', { name: 'Keep as articles' }).click();
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(ownerPage.getByText('Review rows', { exact: true })).toBeVisible();
  const url = await commit(ownerPage, 'en');
  const response = await api.get(url + '/rows');
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const row = data.items.find((item: { status: string }) => item.status === 'written');
  expect(row?.createdRef).toBeTruthy();
  const knowledge = url.split('/imports/')[0] + '/knowledge/items/' + row.createdRef;
  try {
    const item = await api.get(knowledge);
    expect(item.ok()).toBe(true);
    expect((await item.json()).data).toMatchObject({ title: marker, status: 'draft' });
  } finally {
    const removed = await api.delete(knowledge, { headers: csrf });
    expect(removed.ok()).toBe(true);
  }
});

test('knowledge-import previews a Thai CSV and keeps new products inactive', async ({ ownerPage, api }) => {
  const marker = e2eMarker();
  const sku = marker.toUpperCase();
  const dialog = await start(ownerPage, 'th');
  await dialog.getByTestId('import-file').setInputFiles({
    name: marker + '.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('รหัสสินค้า,ชื่อสินค้า,ราคา\n' + sku + ',สินค้าทดสอบ,90\n' + sku + '-B,รายการผิดพลาด,abc'),
  });
  await dialog.getByRole('button', { name: 'อัปโหลด', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'ตรวจสอบ', exact: true }).click();
  await expect(ownerPage.getByText('ราคาไม่ถูกต้อง', { exact: false })).toBeVisible();
  await expect(ownerPage.getByRole('link', { name: 'ดาวน์โหลดแถวที่ผิด (CSV)' })).toBeVisible();
  const url = await commit(ownerPage, 'th');
  const response = await api.get(url + '/rows');
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const row = data.items.find((item: { status: string }) => item.status === 'written');
  expect(row?.createdRef).toBeTruthy();
  const catalog = url.split('/imports/')[0] + '/catalog/items/' + row.createdRef;
  try {
    const item = await api.get(catalog);
    expect(item.ok()).toBe(true);
    expect((await item.json()).data).toMatchObject({ sku, active: false, priceMinor: 9000 });
  } finally {
    const removed = await api.delete(catalog, { headers: csrf });
    expect(removed.ok()).toBe(true);
  }
});
