import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEED } from '@nless/shared/core/fixtures';

test.use({ trace: 'off', screenshot: 'off' });
const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const business = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const email = process.env.E2E_EMAIL || owner.email;

async function enterCredentials(page: Page, password: string) {
  await expect(page.getByTestId('login-email')).toBeVisible();
  await expect(page.getByTestId('login-password')).toBeVisible();
  try {
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
  } catch {
    throw new Error('The sign-in form would not accept credentials');
  }
  await page.getByTestId('login-submit').click();
}

async function useEnglish(page: Page) {
  await page.getByTestId('lang-switch').getByRole('button', { name: 'EN' }).click();
}

test('redirects a signed-out visitor to an accessible Thai and English login form', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nless.lang', 'th'));
  await page.goto('/members');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByLabel(/อีเมล/i)).toHaveAttribute('data-testid', 'login-email');
  await expect(page.getByLabel(/รหัสผ่าน/i)).toHaveAttribute('data-testid', 'login-password');
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toHaveAttribute('data-testid', 'login-submit');

  await useEnglish(page);
  await expect(page.getByLabel(/email/i)).toHaveAttribute('data-testid', 'login-email');
  await expect(page.getByLabel(/password/i)).toHaveAttribute('data-testid', 'login-password');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveAttribute('data-testid', 'login-submit');
});

test('signs in with a password and invalidates the cookie through the account menu', async ({ page, playwright, baseURL }) => {
  const password = process.env.E2E_PASSWORD;
  test.skip(!password, 'E2E_PASSWORD is required for the seeded owner sign-in');
  await page.goto('/login');
  await useEnglish(page);
  await enterCredentials(page, password!);
  await expect(page.getByRole('navigation')).toBeVisible();

  const me = await page.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  const { data } = await me.json();
  expect(data.user.sessionKind).toBe('password');
  expect(data.businesses.map(({ business: row }: { business: { id: string } }) => row.id)).toEqual([business.id]);

  const cookie = (await page.context().cookies()).find(({ name }) => name === 'nless_session');
  if (!cookie) throw new Error('Sign-in did not set the session cookie');
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  const oldSession = await playwright.request.newContext({ baseURL, storageState: { cookies: [cookie], origins: [] } });
  try {
    expect((await oldSession.get('/api/v1/me')).status()).toBe(401);
  } finally {
    await oldSession.dispose();
  }
});

test('shows a generic inline error for an incorrect password', async ({ page }) => {
  await page.goto('/login');
  await useEnglish(page);
  await enterCredentials(page, randomBytes(18).toString('base64url'));
  const alert = page.getByTestId('login-error');
  await expect(alert).toHaveAttribute('role', 'alert');
  await expect(alert).toHaveText('Wrong email or password');
});
