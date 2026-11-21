import { expect, test } from './fixtures';

test('owner sees navigation and the two core APIs', async ({ ownerPage, api }) => {
  await ownerPage.goto('/');
  await expect(ownerPage.getByRole('navigation')).toBeVisible();
  const flags = await api.get('/api/v1/features');
  expect(flags.status()).toBe(200);
  expect((await flags.json()).data.items).toHaveLength(29);
  const me = await api.get('/api/v1/me');
  expect((await me.json()).data.businesses[0].business.name).toBe('Demo Boardgame Shop');
});

test('language switch persists English across reload', async ({ ownerPage }) => {
  await ownerPage.goto('/');
  const switcher = ownerPage.getByTestId('lang-switch');
  await switcher.getByRole('button', { name: 'EN' }).click();
  await expect(ownerPage.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await ownerPage.reload();
  await expect(switcher.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  await switcher.getByRole('button', { name: 'TH' }).click();
  await expect(ownerPage.getByRole('navigation', { name: 'เมนูหลัก' })).toBeVisible();
});
