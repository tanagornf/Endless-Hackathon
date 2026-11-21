import type { MerchantReport } from '@nless/shared/features/insights/merchant';
import { expect, test } from '../../../../../tests/e2e/fixtures';

for (const locale of ['th', 'en'] as const) {
  test('merchant verifies scoped figures and switches periods in ' + locale, async ({ ownerPage }) => {
    await ownerPage.addInitScript(lang => localStorage.setItem('nless.lang', lang), locale);
    const responseFor = (days: number) => ownerPage.waitForResponse(response =>
      response.url().includes('/insights/merchant?days=' + days) && response.request().method() === 'GET');
    const initial = responseFor(7);
    await ownerPage.goto('/insights');
    expect((await initial).status()).toBe(200);
    await expect(ownerPage.getByRole('heading', { name: locale === 'th' ? 'อินไซต์' : 'Insights', exact: true })).toBeVisible();
    await ownerPage.getByRole('combobox', { name: locale === 'th' ? 'ช่วงเวลา' : 'Reporting period' }).click();
    const month = responseFor(30);
    await ownerPage.getByRole('option', { name: /30/ }).click();
    const result = await month;
    expect(result.status()).toBe(200);
    const { data }: { data: MerchantReport } = await result.json();
    expect(Date.parse(data.since)).toBeLessThan(Date.parse(data.until));
    await expect(ownerPage.getByTestId('merchant-period')).toContainText(locale === 'th' ? 'ช่วงข้อมูล' : 'Source period');
    if (data.conversations === 0) {
      await expect(ownerPage.getByText(locale === 'th' ? 'ยังไม่มีแชตจากลูกค้าจริงในช่วงนี้' : 'No live customer chats in this period.')).toBeVisible();
    } else {
      for (const key of ['customers', 'conversations', 'orders', 'handoffs', 'pendingSupport'] as const) {
        await expect(ownerPage.getByTestId('merchant-metric-' + key)).toHaveText(
          data[key] === null ? locale === 'th' ? 'ไม่ทราบ' : 'Unavailable' : String(data[key]),
        );
      }
      const first = data.products?.[0];
      if (first) {
        const row = ownerPage.getByRole('row').filter({ hasText: first.sku });
        await expect(row.getByRole('cell')).toHaveText([first.name + ' · ' + first.sku, String(first.conversations), String(first.withoutOrder)]);
      }
    }
  });
}
