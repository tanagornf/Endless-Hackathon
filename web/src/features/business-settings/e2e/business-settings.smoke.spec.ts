/// <reference types="node" />
import { SEED } from '@nless/shared/core/fixtures';
import type { ApiResult } from '@nless/shared/core/types';
import type { SettingsView } from '@nless/shared/features/business-settings/types';
import { expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

const demoA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const demoB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;

test('F04 owner can read the AI switch in Thai', async ({ ownerPage }) => {
  await setUiLanguage(ownerPage, 'th');
  await ownerPage.goto('/bot-settings');
  await expect(ownerPage.getByRole('heading', { name: 'ตั้งค่าบอท' })).toBeVisible();
  await expect(ownerPage.getByTestId('ai-switch')).toBeEnabled();
});

test('F04 English switch matches the saved state and hides the other tenant', async ({ ownerPage, api }) => {
  const response = await api.get('/api/v1/businesses/' + demoA.id + '/settings');
  expect(response.ok()).toBe(true);
  const { data } = (await response.json()) as ApiResult<SettingsView>;

  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/bot-settings');
  await expect(ownerPage.getByRole('heading', { name: 'Bot settings' })).toBeVisible();
  const aiSwitch = ownerPage.getByRole('switch', { name: 'Let AI answer customers' });
  await expect(aiSwitch).toBeEnabled();
  await expect(aiSwitch).toBeChecked({ checked: data.aiSwitch });

  const other = await api.get('/api/v1/businesses/' + demoB.id + '/settings');
  expect(other.status()).toBe(404);
});


test('F04 owner adds and removes a future closure through the business settings page', async ({ ownerPage, api }) => {
  const date = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const marker = 'e2e-' + Date.now();
  const path = '/api/v1/businesses/' + demoA.id + '/settings/closures';
  await setUiLanguage(ownerPage, 'th');
  await ownerPage.goto('/business');
  await expect(ownerPage.getByRole('tab', { name: 'เวลาทำการ' })).toBeVisible();
  try {
    await ownerPage.getByRole('button', { name: 'เพิ่มวันหยุด' }).click();
    const form = ownerPage.getByRole('dialog');
    await form.getByLabel('ตั้งแต่วันที่').fill(date(400));
    await form.getByLabel('ถึงวันที่').fill(date(400));
    await form.getByLabel('เหตุผล').fill(marker);
    await form.getByRole('button', { name: 'บันทึก' }).click();
    const row = ownerPage.getByRole('row').filter({ hasText: marker });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'ลบ' }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'ลบ' }).click();
    await expect(row).toBeHidden();
  } finally {
    const list = await api.get(path);
    if (list.ok()) {
      const result = await list.json() as ApiResult<{ items: { id: string; reason: string }[] }>;
      const created = result.data.items.find((item) => item.reason === marker);
      if (created) await api.delete(path + '/' + created.id);
    }
  }
});
