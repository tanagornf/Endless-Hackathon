/// <reference types="node" />
import type { APIRequestContext } from '@playwright/test';
import { SEED } from '@nless/shared/core/fixtures';
import type { ApiResult } from '@nless/shared/core/types';
import type { SettingsView } from '@nless/shared/features/business-settings/types';
import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

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

async function readClosures(api: APIRequestContext, path: string) {
  const response = await api.get(path);
  expect(response.status()).toBe(200);
  const { data } = await response.json() as ApiResult<{ items: { id: string; reason: string }[] }>;
  return data.items;
}

async function readSettings(api: APIRequestContext, path: string) {
  const response = await api.get(path);
  expect(response.status()).toBe(200);
  return (await response.json() as ApiResult<SettingsView>).data.settings;
}

test.describe('F04 synthetic settings changes', () => {
  test.skip(process.env.E2E_ALLOW_BUSINESS_SETTINGS_WRITES !== '1', 'Requires the allocated synthetic business settings write slot');

  test('F04 owner adds and removes a future closure through the business settings page', async ({ ownerPage, api }) => {
    const future = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    const marker = e2eMarker();
    test.info().annotations.push({ type: 'synthetic closure', description: marker });
    const path = '/api/v1/businesses/' + demoA.id + '/settings/closures';
    const before = await readClosures(api, path);
    expect(before.some((item) => item.reason === marker)).toBe(false);

    await setUiLanguage(ownerPage, 'th');
    await ownerPage.goto('/business');
    await expect(ownerPage.locator('header').getByRole('combobox')).toContainText(demoA.name);
    await ownerPage.getByRole('tab', { name: 'เวลาทำการ' }).click();
    try {
      await ownerPage.getByRole('button', { name: 'เพิ่มวันหยุด' }).click();
      const form = ownerPage.getByRole('dialog');
      await form.getByLabel('ตั้งแต่วันที่').fill(future);
      await form.getByLabel('ถึงวันที่').fill(future);
      await form.getByLabel('เหตุผล').fill(marker);
      await form.getByRole('button', { name: 'บันทึก' }).click();
      const row = ownerPage.getByRole('row').filter({ hasText: marker });
      await expect(row).toBeVisible();
      expect((await readClosures(api, path)).some((item) => item.reason === marker)).toBe(true);
      await row.getByRole('button', { name: 'ลบ' }).click();
      await ownerPage.getByRole('dialog').getByRole('button', { name: 'ลบ' }).click();
      await expect(row).toBeHidden();
    } finally {
      const created = (await readClosures(api, path)).find((item) => item.reason === marker);
      if (created) expect((await api.delete(path + '/' + created.id)).status()).toBe(204);
      expect(await readClosures(api, path)).toEqual(before);
    }
  });

  test('F04 owner changes only the price policy, reloads, and restores the prior price rule', async ({ ownerPage, api }) => {
    const path = '/api/v1/businesses/' + demoA.id + '/settings';
    const beforePolicy = (await readSettings(api, path)).answerPolicy ?? null;
    const beforePrice = beforePolicy?.price ?? null;
    const expected = { reveal: beforePrice?.reveal === 'ask_staff' ? 'never' : 'ask_staff' } as const;
    const selection = expected.reveal === 'ask_staff' ? 'Ask staff' : 'Never reveal';

    await setUiLanguage(ownerPage, 'en');
    await ownerPage.goto('/bot-settings');
    await expect(ownerPage.locator('header').getByRole('combobox')).toContainText(demoA.name);
    const price = ownerPage.getByTestId('policy-price').getByRole('combobox');
    try {
      await price.click();
      await ownerPage.getByRole('option', { name: selection, exact: true }).click();
      await ownerPage.getByRole('button', { name: 'Save', exact: true }).first().click();
      await expect(ownerPage.getByText('Saved', { exact: true })).toBeVisible();
      await ownerPage.reload();
      await expect(price).toHaveText(selection);

      expect((await readSettings(api, path)).answerPolicy?.price).toEqual(expected);
    } finally {
      const current = await readSettings(api, path);
      if (current.answerPolicy?.price?.reveal === expected.reveal) {
        const restored = await api.patch(path + '/answer-policy', {
          data: { expectedVersion: current.version, policy: { price: beforePrice } },
        });
        expect(restored.status()).toBe(200);
      }
      expect((await readSettings(api, path)).answerPolicy ?? null).toEqual(beforePolicy);
    }
  });
});
