import { expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

test('Thai workbench shows the active source and excludes the other shop', async ({ ownerPage }) => {
  await setUiLanguage(ownerPage, 'th');
  await ownerPage.goto('/knowledge-search');
  await expect(ownerPage.getByRole('heading', { name: 'ค้นหาความรู้' })).toBeVisible();
  const ready = ownerPage.getByText(/^พร้อม \d+$/);
  await expect(ready).toBeVisible();
  await expect.poll(async () => Number((await ready.textContent())?.match(/\d+$/)?.[0])).toBeGreaterThanOrEqual(3);
  const question = ownerPage.getByRole('textbox', { name: 'คำถาม' });
  const search = ownerPage.getByRole('button', { name: 'ค้นหา', exact: true });
  await question.fill('ร้านเปิดกี่โมง');
  await search.click();
  await ownerPage.getByRole('button', { name: 'เวลาเปิดร้านและบริการ' }).click();
  await expect(ownerPage.getByRole('heading', { name: 'แหล่งข้อมูล' })).toBeVisible();
  await expect(ownerPage.getByText('ฉบับที่ 1 · ฉบับปัจจุบัน', { exact: true })).toBeVisible();
  await ownerPage.getByRole('button', { name: 'ปิด', exact: true }).click();
  await question.fill('TENANT_B_ONLY_OWL_482');
  await search.click();
  await expect(ownerPage.getByText('ไม่พบความรู้ที่เกี่ยวข้อง', { exact: true })).toBeVisible();
});

test('English workbench finds the bilingual return policy', async ({ ownerPage }) => {
  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/knowledge-search');
  await expect(ownerPage.getByRole('heading', { name: 'Knowledge search' })).toBeVisible();
  await ownerPage.getByRole('textbox', { name: 'Question' }).fill('What is your return policy?');
  await ownerPage.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(ownerPage.getByRole('columnheader', { name: 'Matching passage' })).toBeVisible();
  await expect(ownerPage.getByRole('button', { name: 'นโยบายรับคืนสินค้า' }).first()).toBeVisible();
});
