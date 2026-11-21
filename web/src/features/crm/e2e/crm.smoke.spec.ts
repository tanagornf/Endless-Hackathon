import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { CrmCustomerDetail } from '@nless/shared/features/crm/types';
import { SEED } from '@nless/shared/core/fixtures';
import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

async function openMobilePanel(page: Page, locale: 'th' | 'en') {
  if (await page.evaluate(() => matchMedia('(max-width:899.95px)').matches)) {
    await page.getByRole('button', { name: locale === 'th' ? 'รายละเอียดแชต' : 'Conversation details' }).click();
  }
}

async function checkContactEdits(page: Page, api: APIRequestContext, panel: Locator, customerPath: string,
  locale: 'th' | 'en', marker: string) {
  const read = async () => {
    const response = await api.get(customerPath);
    expect(response.status()).toBe(200);
    return (await response.json()).data as CrmCustomerDetail;
  };
  const before = await read();
  const original = { phone: before.contact.phone ?? '', email: before.contact.email ?? '', note: before.note ?? '' };
  const synthetic = {
    phone: original.phone === '0800000001' ? '0800000002' : '0800000001',
    email: marker + '@example.test',
    note: marker,
  };
  const touched = new Set<keyof typeof original>();
  try {
    for (const field of ['phone', 'email', 'note'] as const) {
      const input = panel.getByTestId('crm-' + field);
      await expect(input).toHaveValue(original[field]);
      await input.fill(synthetic[field]);
      const save = page.waitForResponse(response => response.request().method() === 'PATCH'
        && new URL(response.url()).pathname === customerPath + '/profile');
      touched.add(field);
      await input.blur();
      expect((await save).status()).toBe(200);
    }
    await page.reload();
    await openMobilePanel(page, locale);
    for (const field of touched) await expect(panel.getByTestId('crm-' + field)).toHaveValue(synthetic[field]);
  } finally {
    // Restore only the fields this run touched and that still contain its synthetic value.
    if (touched.size) {
      const current = await read();
      const restore: Partial<typeof original> = {};
      for (const field of touched) {
        const value = field === 'note' ? current.note : current.contact[field];
        if (value === synthetic[field]) restore[field] = original[field];
      }
      if (Object.keys(restore).length) {
        const cleanup = await api.patch(customerPath + '/profile', {
          headers: { 'X-Requested-With': 'nless' }, data: { expectedVersion: current.profileVersion, ...restore },
        });
        expect(cleanup.status()).toBe(200);
      }
    }
  }
}

for (const locale of ['th', 'en'] as const) {
  test('CRM contact fields and tag survive an Inbox reload in ' + locale, async ({ ownerPage, api }) => {
    test.setTimeout(120000);
    const marker = e2eMarker() + '-' + locale;
    const shop = SEED.businesses.find(b => b.alias === 'biz_demo_a')!;
    const conversation = SEED.conversations.find(c => c.alias === 'conv_a_ai')!;
    const root = '/api/v1/businesses/' + shop.id + '/crm';
    const tagsPath = root + '/tags';
    const customer = SEED.customers.find(c => c.alias === conversation.customerAlias && c.businessAlias === shop.alias)!;
    await setUiLanguage(ownerPage, locale);
    await ownerPage.addInitScript(id => localStorage.setItem('nless.businessId', id), shop.id);
    const tags = async () => {
      const response = await api.get(tagsPath);
      expect(response.ok()).toBe(true);
      return (await response.json()).data.items as { id: string; name: string }[];
    };
    expect((await tags()).some(tag => tag.name === marker)).toBe(false);
    try {
      await ownerPage.goto('/chat?c=' + conversation.id);
      const panel = ownerPage.getByTestId('crm-panel');
      await openMobilePanel(ownerPage, locale);
      await expect(panel).toBeVisible();
      await panel.getByTestId('crm-tag-add').fill(marker);
      await ownerPage.getByRole('option', { name: new RegExp(marker) }).click();
      await expect(panel.getByTestId('crm-tag-chip').filter({ hasText: marker })).toBeVisible();
      await ownerPage.reload();
      await openMobilePanel(ownerPage, locale);
      await expect(panel.getByTestId('crm-tag-chip').filter({ hasText: marker })).toBeVisible();
      await checkContactEdits(ownerPage, api, panel, root + '/customers/' + customer.id, locale, marker);
      const created = (await tags()).find(tag => tag.name === marker);
      expect(created).toBeDefined();
      const audience = await api.get(root + '/customers', { params: { tagId: created!.id } });
      expect(audience.ok()).toBe(true);
      expect((await audience.json()).data.items.map((row: { displayName: string }) => row.displayName)).toEqual(['A Customer One']);
      await ownerPage.goto('/customers');
      await expect(ownerPage.getByRole('heading', { name: locale === 'th' ? 'ลูกค้า' : 'Customers', exact: true })).toBeVisible();
    } finally {
      const own = (await tags()).find(tag => tag.name === marker);
      if (own) {
        const cleanup = await api.delete(tagsPath + '/' + own.id, { headers: { 'X-Requested-With': 'nless' } });
        expect(cleanup.status()).toBe(204);
      }
    }
  });
}
