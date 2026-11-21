import { SEED } from '@nless/shared/core/fixtures';
import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

for (const locale of ['th', 'en'] as const) {
  test('CRM customer tag survives an Inbox reload in ' + locale, async ({ ownerPage, api }) => {
    const marker = e2eMarker() + '-' + locale;
    const shop = SEED.businesses.find(b => b.alias === 'biz_demo_a')!;
    const conversation = SEED.conversations.find(c => c.alias === 'conv_a_ai')!;
    const root = '/api/v1/businesses/' + shop.id + '/crm';
    const tagsPath = root + '/tags';
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
      if (await ownerPage.evaluate(() => matchMedia('(max-width:899.95px)').matches)) {
        await ownerPage.getByRole('button', { name: locale === 'th' ? 'รายละเอียดแชต' : 'Conversation details' }).click();
      }
      await expect(panel).toBeVisible();
      await panel.getByTestId('crm-tag-add').fill(marker);
      await ownerPage.getByRole('option', { name: new RegExp(marker) }).click();
      await expect(panel.getByTestId('crm-tag-chip').filter({ hasText: marker })).toBeVisible();
      await ownerPage.reload();
      if (await ownerPage.evaluate(() => matchMedia('(max-width:899.95px)').matches)) {
        await ownerPage.getByRole('button', { name: locale === 'th' ? 'รายละเอียดแชต' : 'Conversation details' }).click();
      }
      await expect(panel.getByTestId('crm-tag-chip').filter({ hasText: marker })).toBeVisible();
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
