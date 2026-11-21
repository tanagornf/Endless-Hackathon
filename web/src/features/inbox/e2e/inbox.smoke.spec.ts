import type { Page } from '@playwright/test';
import type { ApiResult } from '@nless/shared/core/types';
import type { ConversationDetail, DemoChatSendResult } from '@nless/shared/features/inbox/types';
import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

test.use({ trace: 'off', screenshot: 'off' });

const demoPath = '/demo-chat/s/demo-boardgame';
const phone = { width: 390, height: 844 };
const bubbles = (page: Page, author: 'customer' | 'ai') =>
  page.locator('[data-testid="demo-chat-message"][data-author="' + author + '"]');

test('public demo chat on a phone survives reload and reaches the correct staff inbox row', async ({ browser, baseURL, ownerPage }) => {
  test.setTimeout(95_000);
  const visitor = await browser.newContext({ baseURL, viewport: phone, locale: 'th-TH' });
  try {
    const page = await visitor.newPage();
    await page.goto(demoPath);
    await expect(page.getByRole('heading', { name: 'Demo Boardgame Shop' })).toBeVisible();
    const input = page.getByTestId('demo-chat-input');
    await expect(input).toHaveAttribute('placeholder', 'พิมพ์ข้อความ…');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const text = 'A-GAME-01 ราคาเท่าไหร่ครับ ' + e2eMarker();
    await input.fill(text);
    const sent = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/public/demo-chat/demo-boardgame/messages');
    await page.getByTestId('demo-chat-send').click();
    await expect(bubbles(page, 'customer').filter({ hasText: text })).toBeVisible();
    const response = await sent;
    expect(response.ok()).toBe(true);
    const { data } = await response.json() as ApiResult<DemoChatSendResult>;
    expect(data.conversationId).toMatch(/^[a-f0-9-]{36}$/i);
    await expect(page.getByText('กำลังพิมพ์…', { exact: true })).toBeVisible();
    await expect(bubbles(page, 'ai').filter({ hasText: /1,490/ })).toBeVisible({ timeout: 40_000 });
    await page.reload();
    await expect(bubbles(page, 'customer').filter({ hasText: text })).toHaveCount(1);
    await expect(bubbles(page, 'ai').filter({ hasText: /1,490/ })).toBeVisible();

    const detail = await ownerPage.request.get('/api/v1/conversations/' + data.conversationId);
    expect(detail.ok()).toBe(true);
    const thread = await detail.json() as ApiResult<ConversationDetail>;
    const visitorName = thread.data.conversation.customer.displayName;
    expect(visitorName).toBeTruthy();
    await ownerPage.goto('/chat');
    const filtered = ownerPage.waitForResponse((reply) => {
      const url = new URL(reply.url());
      return url.pathname.endsWith('/conversations') && url.searchParams.get('search') === visitorName;
    });
    await ownerPage.getByRole('textbox', { name: /ค้นหาแชต|Search conversations/ }).fill(visitorName);
    expect((await filtered).ok()).toBe(true);
    const row = ownerPage.locator('[data-conversation-id="' + data.conversationId + '"]');
    await expect(row).toBeVisible();
    await row.click();
    await expect(ownerPage).toHaveURL(new RegExp('[?&]c=' + data.conversationId));
    await ownerPage.reload();
    await expect(ownerPage.getByTestId('inbox-message').filter({ hasText: text })).toHaveCount(1);
    await expect(ownerPage.locator('[data-testid="inbox-message"][data-author="ai"]').filter({ hasText: /1,490/ })).toBeVisible();
  } finally {
    await visitor.close();
  }
});

test.describe('English mobile visitor', () => {
  test.use({ viewport: phone, locale: 'en-US' });

  test('public demo chat works in English and retains the language change', async ({ page }) => {
    await page.goto(demoPath);
    const input = page.getByTestId('demo-chat-input');
    await expect(input).toHaveAttribute('placeholder', 'Type a message…');
    await expect(page.getByRole('log')).toContainText(/welcome/i);
    const question = 'How much is A-GAME-01?';
    await page.getByRole('button', { name: question, exact: true }).click();
    await expect(bubbles(page, 'ai').filter({ hasText: /1,490\s*(?:baht|THB)/i })).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('demo-chat-lang').click();
    await expect(input).toHaveAttribute('placeholder', 'พิมพ์ข้อความ…');
    await page.reload();
    await expect(input).toHaveAttribute('placeholder', 'พิมพ์ข้อความ…');
    await expect(bubbles(page, 'customer').filter({ hasText: question })).toHaveCount(1);
  });

  test('public chat blocks an oversized message before submission', async ({ page }) => {
    await page.goto(demoPath);
    await page.getByTestId('demo-chat-input').fill('a'.repeat(501));
    await page.getByTestId('demo-chat-send').click();
    await expect(page.getByText('Your message is longer than 500 characters.')).toBeVisible();
    await expect(bubbles(page, 'customer')).toHaveCount(0);
  });
});

test('Shop A cannot read the seeded Shop B conversation', async ({ api }) => {
  const response = await api.get('/api/v1/conversations/00000000-0000-4000-8000-0000000b4001');
  expect(response.status()).toBe(404);
});

test('the owner can read the internal demo link and usage', async ({ ownerPage }) => {
  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/demo-chat');
  await expect(ownerPage.getByRole('link', { name: /demo-chat\/s\/demo-boardgame/ })).toBeVisible();
  await expect(ownerPage.getByText(/Used [\d,]+ of [\d,]+ messages today/)).toBeVisible();
});
