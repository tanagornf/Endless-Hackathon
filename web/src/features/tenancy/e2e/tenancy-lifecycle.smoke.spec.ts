/// <reference types="node" />
import type { APIRequestContext } from '@playwright/test';
import { SEED } from '@nless/shared/core/fixtures';
import type { InvitationRow, MyBusinessRow } from '@nless/shared/features/tenancy/types';
import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

const shop = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const businessesPath = '/api/v1/businesses';
const invitationsPath = businessesPath + '/' + shop.id + '/invitations';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(process.env.E2E_ALLOW_TENANCY_WRITES !== '1', 'Requires the allocated synthetic tenancy write slot');

async function confirmSyntheticOwner(api: APIRequestContext) {
  const response = await api.get('/api/v1/me');
  expect(response.status()).toBe(200);
  const { user, businesses } = (await response.json()).data as {
    user: { id: string };
    businesses: { business: { id: string }; role: string }[];
  };
  expect(user.id).toBe(owner.id);
  expect(businesses.some(({ business, role }) => business.id === shop.id && role === 'owner')).toBe(true);
}

async function lookup<T>(api: APIRequestContext, path: string, matches: (item: T) => boolean): Promise<T | undefined> {
  const response = await api.get(path);
  expect(response.status()).toBe(200);
  const { data } = (await response.json()) as { data: { items: T[] } };
  return data.items.find(matches);
}

test('F03 lifecycle creates, previews and revokes a synthetic invitation', async ({ ownerPage, api, browser, baseURL }) => {
  await confirmSyntheticOwner(api);
  const email = e2eMarker() + '@example.test';
  test.info().annotations.push({ type: 'synthetic invitation', description: email });
  const findInvite = () => lookup<InvitationRow>(api, invitationsPath, (item) => item.email === email);
  expect(await findInvite()).toBeUndefined();

  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/invitations');
  await expect(ownerPage.locator('header').getByRole('combobox')).toContainText(shop.name);
  try {
    await ownerPage.getByRole('button', { name: 'Invite staff' }).click();
    let dialog = ownerPage.getByRole('dialog');
    await dialog.getByLabel('Staff email').fill(email);
    await dialog.getByRole('button', { name: 'Create invitation' }).click();
    dialog = ownerPage.getByRole('dialog', { name: 'Invitation link' });
    await expect(dialog.getByText(/^(Share this link with the staff member|The email is in the sandbox mailbox)/)).toBeVisible();
    expect((await findInvite())?.status).toBe('pending');
    let link: URL;
    try {
      link = new URL(await dialog.getByRole('textbox', { name: 'Invitation link' }).inputValue());
    } catch {
      throw new Error('The invitation dialog did not provide a usable link');
    }
    expect(link.origin).toBe(new URL(baseURL!).origin);
    expect(link.pathname).toBe('/invitations/accept');
    expect(link.searchParams.has('token')).toBe(true);

    const recipient = await browser.newPage();
    try {
      await setUiLanguage(recipient, 'en');
      await recipient.goto(link.href).catch(() => { throw new Error('Could not open the synthetic invitation'); });
      await expect(recipient.getByRole('heading', { name: 'Invitation to join a business' })).toBeVisible();
      const local = email.split('@')[0]!;
      const masked = local.slice(0, 2) + '*'.repeat(local.length - 2) + '@example.test';
      await expect(recipient.getByText('You are invited to join “' + shop.name + '” as staff (' + masked + ')')).toBeVisible();
    } finally {
      await recipient.close();
    }

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const row = ownerPage.getByRole('row').filter({ hasText: email });
    await row.getByRole('button', { name: 'Cancel invitation' }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Cancel invitation' }).click();
    await expect(row.getByText('Cancelled', { exact: true })).toBeVisible();
  } finally {
    const invitation = await findInvite();
    if (invitation?.status === 'pending') {
      const cleanup = await api.post(invitationsPath + '/' + invitation.id + '/revoke');
      expect(cleanup.status()).toBe(200);
    }
    if (invitation) expect((await findInvite())?.status).toBe('revoked');
  }
});

test('F03 lifecycle creates, switches and deletes a synthetic shop', async ({ ownerPage, api }) => {
  await confirmSyntheticOwner(api);
  const name = e2eMarker();
  test.info().annotations.push({ type: 'synthetic shop', description: name });
  const findShop = () => lookup<MyBusinessRow>(api, businessesPath, (item) => item.name === name);
  expect(await findShop()).toBeUndefined();

  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/businesses');
  const selector = ownerPage.locator('header').getByRole('combobox');
  const main = ownerPage.getByRole('main');
  const seedCard = main.locator('.MuiCard-root').filter({ hasText: shop.name });
  const syntheticCard = main.locator('.MuiCard-root').filter({ hasText: name });
  await expect(selector).toContainText(shop.name);
  await expect(seedCard.getByRole('button', { name: 'Delete business' })).toBeDisabled();
  let created: MyBusinessRow | undefined;
  try {
    await main.getByRole('button', { name: 'Add a business' }).click();
    let dialog = ownerPage.getByRole('dialog');
    await dialog.getByLabel('Business name').fill(name);
    await dialog.getByRole('button', { name: 'Add a business' }).click();
    await expect(ownerPage).toHaveURL(/\/onboarding$/);
    created = await findShop();
    expect(created?.status).toBe('active');
    await expect(selector).toContainText(name);

    await ownerPage.goto('/businesses');
    await seedCard.getByRole('button', { name: 'Switch to this business' }).click();
    await expect(selector).toContainText(shop.name);
    await syntheticCard.getByRole('button', { name: 'Delete business' }).click();
    dialog = ownerPage.getByRole('dialog', { name: 'Delete business' });
    await dialog.getByLabel('Confirm business name').fill(name);
    await dialog.getByRole('button', { name: 'Delete business' }).click();
    await expect(syntheticCard).toHaveCount(0);
  } finally {
    const leftover = await findShop();
    if (leftover) {
      const target = businessesPath + '/' + leftover.businessId + '?' + new URLSearchParams({ confirmName: name });
      const cleanup = await api.delete(target);
      expect(cleanup.status()).toBe(204);
    }
    expect(await findShop()).toBeUndefined();
    const removed = created ?? leftover;
    if (removed) {
      const response = await api.get(businessesPath + '/' + removed.businessId);
      expect(response.status()).toBe(403);
      expect((await response.json()).error.code).toBe('BUSINESS_INACTIVE');
    }
  }
});
