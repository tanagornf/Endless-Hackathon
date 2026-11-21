import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off' });

test('password recovery describes sandbox delivery and gives a generic response', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('lang-switch').getByRole('button', { name: 'EN' }).click();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByTestId('forgot-sandbox')).toContainText('Email is in test mode');
  await page.getByLabel('Email', { exact: true }).fill('e2e-' + randomUUID() + '@example.test');
  await page.getByRole('button', { name: 'Request a reset link' }).click();
  await expect(page.getByTestId('forgot-done')).toContainText('If this email has an account');
});

test('reset protects the first document and removes the token from the address bar', async ({ page }) => {
  const token = randomBytes(32).toString('base64url');
  const documentResponse = await page.goto('/reset-password?token=' + token);
  expect(await documentResponse?.headerValue('referrer-policy')).toBe('no-referrer');
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByTestId('lang-switch').getByRole('button', { name: 'EN' }).click();
  const candidate = randomBytes(18).toString('base64url');
  await page.getByLabel('New password', { exact: true }).fill(candidate);
  await page.getByLabel('Confirm new password', { exact: true }).fill(candidate);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByTestId('reset-error')).toContainText('Link not found');
});
