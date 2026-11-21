import type { Page } from '@playwright/test';
import type { SourceView, WorkbenchSearchResult } from '@nless/shared/features/knowledge-search/types';
import { expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

async function runSearch(page: Page, questionLabel: string, buttonLabel: string, query: string) {
  await page.getByRole('textbox', { name: questionLabel }).fill(query);
  const reply = page.waitForResponse((response) => response.request().method() === 'POST' &&
    new URL(response.url()).pathname.endsWith('/knowledge-search/search'));
  await page.getByRole('button', { name: buttonLabel, exact: true }).click();
  const response = await reply;
  expect(response.ok()).toBe(true);
  return (await response.json()).data as WorkbenchSearchResult;
}

test('Thai workbench shows the active source and excludes the other shop', async ({ ownerPage }) => {
  await setUiLanguage(ownerPage, 'th');
  await ownerPage.goto('/knowledge-search');
  await expect(ownerPage.getByRole('heading', { name: 'ค้นหาความรู้' })).toBeVisible();
  const ready = ownerPage.getByText(/^พร้อม \d+$/);
  await expect(ready).toBeVisible();
  await expect.poll(async () => Number((await ready.textContent())?.match(/\d+$/)?.[0])).toBeGreaterThanOrEqual(3);
  const ranked = await runSearch(ownerPage, 'คำถาม', 'ค้นหา', 'ร้านเปิดกี่โมง');
  const hit = ranked.hits[0];
  expect(hit?.title).toMatch(/เวลา|ทำการ|เปิด|hours/i);
  expect(hit.score).toBeGreaterThan(0);
  const reply = ownerPage.waitForResponse((response) => response.request().method() === 'GET' &&
    new URL(response.url()).pathname.endsWith('/knowledge-search/sources/' + hit.knowledgeItemId + '/' + hit.revision));
  await ownerPage.getByRole('button', { name: hit.title, exact: true }).first().click();
  const response = await reply;
  expect(response.ok()).toBe(true);
  const source = (await response.json()).data as SourceView;
  expect(source).toMatchObject({ knowledgeItemId: hit.knowledgeItemId, revision: hit.revision, status: 'active' });
  await expect(ownerPage.getByRole('heading', { name: 'แหล่งข้อมูล' })).toBeVisible();
  await expect(ownerPage.getByText('ฉบับที่ ' + source.revision + ' · ' +
    (source.isCurrent ? 'ฉบับปัจจุบัน' : 'ฉบับก่อนหน้า'), { exact: true })).toBeVisible();
  await ownerPage.getByRole('button', { name: 'ปิด', exact: true }).click();
  const other = await runSearch(ownerPage, 'คำถาม', 'ค้นหา', 'TENANT_B_ONLY_OWL_482');
  expect(other.hits).toEqual([]);
  await expect(ownerPage.getByText('ไม่พบความรู้ที่เกี่ยวข้อง', { exact: true })).toBeVisible();
});

test('English workbench finds the bilingual return policy', async ({ ownerPage }) => {
  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/knowledge-search');
  await expect(ownerPage.getByRole('heading', { name: 'Knowledge search' })).toBeVisible();
  const ranked = await runSearch(ownerPage, 'Question', 'Search', 'What is your return policy?');
  await expect(ownerPage.getByRole('columnheader', { name: 'Matching passage' })).toBeVisible();
  expect(ranked.hits[0]?.title).toMatch(/return|refund|damage|คืน|เสียหาย|ชำรุด/i);
  await expect(ownerPage.getByRole('button', { name: ranked.hits[0].title, exact: true }).first()).toBeVisible();
});
