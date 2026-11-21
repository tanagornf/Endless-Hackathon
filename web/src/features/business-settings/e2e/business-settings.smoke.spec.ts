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
