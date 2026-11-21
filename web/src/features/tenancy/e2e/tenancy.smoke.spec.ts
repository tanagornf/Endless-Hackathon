/// <reference types="node" />
import { SEED } from '@nless/shared/core/fixtures';
import { expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

const shopB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const staffA = SEED.users.find(({ alias }) => alias === 'staff_a')!;

test('F03 shows Thai members and denies the other shop', async ({ ownerPage, api }) => {
  await setUiLanguage(ownerPage, 'th');
  await ownerPage.goto('/members');
  await expect(ownerPage.getByRole('heading', { name: 'สมาชิกและสิทธิ์' })).toBeVisible();
  await expect(ownerPage.getByText(staffA.email)).toBeVisible();
  expect((await api.get('/api/v1/businesses/' + shopB.id + '/members')).status()).toBe(404);
  expect((await api.get('/api/v1/businesses/' + shopB.id)).status()).toBe(404);
});

test('F03 English permissions dialog locks both owner-only grants', async ({ ownerPage }) => {
  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/members');
  await expect(ownerPage.getByRole('heading', { name: 'Members and permissions' })).toBeVisible();
  const staff = ownerPage.getByRole('row').filter({ hasText: staffA.email });
  await staff.getByRole('button', { name: 'Edit permissions' }).click();
  const dialog = ownerPage.getByRole('dialog');
  const locked = dialog.getByTestId('locked-permission').getByRole('checkbox');
  await expect(locked).toHaveCount(2);
  await expect(locked.nth(0)).toBeDisabled();
  await expect(locked.nth(1)).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
