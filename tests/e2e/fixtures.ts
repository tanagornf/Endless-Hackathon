import { expect, test as base } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

export { expect };
export const e2eMarker = () => 'e2e-' + Date.now();
export const test = base.extend<{ ownerPage: Page; api: APIRequestContext }>({
  ownerPage: async ({ page }, use) => {
    const email = process.env.E2E_EMAIL || 'owner.a@example.test';
    await page.context().setExtraHTTPHeaders({ 'X-Requested-With': 'nless' });
    const response = await page.request.post('/api/dev/login', {
      data: { email }, headers: { 'X-Requested-With': 'nless', 'X-Dev-Login-Token': process.env.E2E_DEV_LOGIN_TOKEN || '' },
    });
    if (response.status() === 404 && process.env.E2E_PASSWORD) {
      await page.goto('/login');
      await page.getByLabel(/อีเมล|email/i).fill(email);
      await page.getByLabel(/รหัสผ่าน|password/i).fill(process.env.E2E_PASSWORD);
      await page.getByRole('button', { name: /เข้าสู่ระบบ|sign in/i }).click();
      await expect(page.getByRole('navigation')).toBeVisible();
    } else if (!response.ok()) {
      throw Error('Smoke sign-in failed (HTTP ' + response.status() + '). Check dev login access or E2E_PASSWORD.');
    }
    await use(page);
  },
  api: async ({ ownerPage }, use) => { await use(ownerPage.request); },
});
export async function setUiLanguage(page: Page, language: 'th' | 'en') {
  await page.addInitScript((value) => { localStorage.setItem('nless.lang', value); }, language);
}
export async function expectPageInEnglish(page: Page, path: string, titleEn: string) {
  await setUiLanguage(page, 'en');
  await page.goto(path);
  await expect(page.getByRole('heading', { name: titleEn })).toBeVisible();
  const untranslated = await page.locator('main').evaluate((main) => {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const errors = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest('[data-user-content]') && /^[\p{Script=Thai}\s]{4,}$/u.test(node.textContent?.trim() ?? '')) errors.push(node.textContent);
    }
    return errors;
  });
  expect(untranslated).toEqual([]);
  await page.evaluate(() => localStorage.setItem('nless.lang', 'th'));
}
