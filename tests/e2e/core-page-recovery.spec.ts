import { expect, test } from '@playwright/test';

for (const persistent of [false, true]) {
  test(persistent ? 'a persistent missing screen offers a manual retry' : 'a stale screen recovers at its destination', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nless.lang', 'en'));
    await page.goto('/login');
    test.skip(await page.locator('script[src*="/@vite/client"]').count() > 0, 'Requires the compiled application');
    let missing = true;
    let reloads = 0;
    page.on('request', request => {
      if (request.resourceType() === 'document') reloads++;
    });
    await page.route(/\/assets\/ForgotPassword-[^/]+\.js$/, async route => {
      if (!missing) return route.continue();
      missing = persistent;
      await route.fulfill({ status: 404, body: 'Missing asset' });
    });
    await page.locator('a[href="/forgot-password"]').click();
    if (persistent) {
      const retry = page.getByRole('button', { name: 'Retry' });
      await expect(retry).toBeVisible();
      expect(reloads).toBe(1);
      missing = false;
      await retry.click();
    }
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('textbox')).toBeVisible();
    expect(reloads).toBe(persistent ? 2 : 1);
  });
}
