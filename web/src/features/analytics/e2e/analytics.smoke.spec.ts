import type { DashboardData } from '@nless/shared/features/analytics/types';
import { expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

for (const language of ['th', 'en'] as const) {
  test('shop overview reads scoped figures in ' + language, async ({ ownerPage }) => {
    await setUiLanguage(ownerPage, language);
    const response = ownerPage.waitForResponse(result =>
      result.request().method() === 'GET' && new URL(result.url()).pathname.endsWith('/analytics/dashboard'));
    await ownerPage.goto('/dashboard');
    const overview = await response;
    expect(overview.status()).toBe(200);
    const { data }: { data: DashboardData } = await overview.json();
    await expect(ownerPage.getByRole('heading', { name: language === 'en' ? 'Shop overview' : 'ภาพรวมร้าน' })).toBeVisible();
    await expect(ownerPage.getByTestId('overview-period')).toContainText(data.range.timezone);
    await expect(ownerPage.getByTestId('overview-active')).toHaveText(String(data.conversations.active));
    await expect(ownerPage.getByTestId('overview-customersActive')).toHaveText(String(data.conversations.customersActive));
    await expect(ownerPage.getByTestId('overview-customerMessages')).toHaveText(String(data.messages.customer));
    await expect(ownerPage.getByTestId('overview-orders')).toHaveText(language === 'en' ? 'Unavailable' : 'ยังไม่มีข้อมูล');
    expect(data.channels.every(channel => channel.channel === 'line')).toBe(true);
  });
}
