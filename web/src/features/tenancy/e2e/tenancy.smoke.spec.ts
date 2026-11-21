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


test('F03 invitation initial document suppresses referrers and scrubs the token in the browser', async ({ page, request }) => {
  const before = await request.get('/build-info');
  expect(before.ok()).toBe(true);
  const { sha } = await before.json();

  const syntheticInvalidToken = 'x'.repeat(43);
  const path = '/invitations/accept?token=' + syntheticInvalidToken;
  const initial = await request.get(path, { maxRedirects: 0 });
  expect(initial.status()).toBe(200);
  expect(initial.headers()['content-type']).toMatch(/^text\/html/);
  expect(initial.headers()['referrer-policy']).toBe('no-referrer');

  await setUiLanguage(page, 'th');
  await page.goto(path);
  await expect(page).toHaveURL((url) => url.pathname === '/invitations/accept' && !url.searchParams.has('token'));
  await expect(page.getByText('ไม่พบคำเชิญนี้', { exact: true })).toBeVisible();

  const after = await request.get('/build-info');
  expect(after.ok()).toBe(true);
  expect((await after.json()).sha).toBe(sha);
});
