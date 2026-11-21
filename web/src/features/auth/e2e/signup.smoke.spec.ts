import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off' });

test('signup has Thai and English labels and requires a stored link for invited staff', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nless.lang', 'th'));
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'สมัครใช้งาน' })).toBeVisible();
  await expect(page.getByLabel('ชื่อร้าน')).toBeVisible();
  await page.getByTestId('lang-switch').getByRole('button', { name: 'EN' }).click();
  await expect(page.getByLabel('Business name')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();

  await page.goto('/signup?invite=1');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: /สมัครและเริ่มใช้งาน|Sign up and start/ })).toHaveCount(0);

  await page.evaluate(() => sessionStorage.setItem('nless.invite', 'x'.repeat(43)));
  await page.reload();
  await expect(page.getByLabel(/อีเมล|Email/i)).toBeVisible();
  await expect(page.getByLabel(/ชื่อร้าน|Business name/i)).toHaveCount(0);
});

test('verification removes the token from the browser URL and explains an invalid link', async ({ page }) => {
  const documentResponse = await page.goto('/verify-email?token=' + randomBytes(32).toString('base64url'));
  expect(await documentResponse?.headerValue('referrer-policy')).toBe('no-referrer');
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole('alert')).toContainText(/ลิงก์นี้ใช้ไม่ได้|This link cannot be used/);
});

test('a new owner can sign up and enter the app', async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_SIGNUP !== '1', 'E2E_ALLOW_SIGNUP enables creation of a synthetic account');
  const id = randomUUID();
  await page.goto('/signup');
  await page.getByTestId('lang-switch').getByRole('button', { name: 'EN' }).click();
  await page.getByLabel('Your name').fill('E2E Auth Owner');
  await page.getByLabel('Business name').fill('E2E ' + id);
  await page.getByLabel('Email', { exact: true }).fill('e2e-' + id + '@example.test');
  await page.getByLabel(/Password/).fill(randomBytes(18).toString('base64url'));
  await page.getByRole('button', { name: 'Sign up and start' }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
  const result = await page.request.get('/api/v1/auth/status');
  expect(result.status()).toBe(200);
  expect((await result.json()).data.emailVerified).toBe(false);
});
