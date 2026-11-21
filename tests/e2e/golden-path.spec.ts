import type { APIResponse, BrowserContext, Page } from '@playwright/test';
import type { OpsJobRow, OpsSummary } from '@nless/shared/core/ops';
import type { ApiResult, FeatureFlagView, Page as ApiPage } from '@nless/shared/core/types';
import type { EffectiveAnswerRules } from '@nless/shared/features/business-settings/types';
import type { ConversationDetail, DemoChatActionResult, DemoChatSendResult } from '@nless/shared/features/inbox/types';
import { e2eMarker, expect, test } from './fixtures';

const demoPath = '/demo-chat/s/demo-boardgame';
const demoApi = '/api/v1/public/demo-chat/demo-boardgame';
const shopA = 'Demo Boardgame Shop';
const shopB = 'Demo Repair Studio';
const shopBId = '00000000-0000-4000-8000-0000000b2000';
const shopBConversation = '00000000-0000-4000-8000-0000000b4001';
const privateMarker = 'TENANT_B_ONLY_OWL_482';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const price = /1,490/;
const secretLike = /OPENAI|SESSION_SECRET|sk-/;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The release runner captures Playwright JSON. Keep credentials and session cookies out of traces.
test.use({ trace: 'off', screenshot: 'off' });

async function readData<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `HTTP ${response.status()} for ${new URL(response.url()).pathname}`).toBe(true);
  const result = await response.json() as ApiResult<T>;
  return result.data;
}

function bubbles(page: Page, author: 'ai' | 'customer' | 'staff') {
  return page.locator(`[data-testid="demo-chat-message"][data-author="${author}"]`);
}

function inboxMessage(page: Page, id: string, author: 'ai' | 'customer') {
  expect(id).toMatch(uuid);
  return page.locator(`[data-testid="inbox-message"][data-message-id="${id}"][data-author="${author}"]`);
}

test.describe('F36 release golden path', () => {
  test.describe.configure({ mode: 'serial' });

  let marker: string;
  let startedAt: number;
  let lastSentAt = 0;
  let visitorContext: BrowserContext | undefined;
  let ownerContext: BrowserContext | undefined;
  let visitor: Page;
  let owner: Page;
  let businessId: string;
  let flags: FeatureFlagView[];
  let conversationId: string | undefined;
  let conversationUrl: string | undefined;
  let priceCustomerId: string;
  let priceReplyId: string;
  let takeoverRequested = false;

  function available(id: string) {
    return flags.some((flag) => flag.featureId === id && flag.visible && !flag.hidden && !flag.placeholder);
  }

  function annotateConversation() {
    const annotation = test.info().annotations.find(({ type }) => type === 'conversationUrl');
    if (annotation && conversationUrl) annotation.description = conversationUrl;
  }

  async function visitorMessage(question: string) {
    // Stay within the shared Demo Chat visitor limit and let each turn settle.
    const remaining = 12_000 - (Date.now() - lastSentAt);
    if (remaining > 0) await delay(remaining);
    const message = `${question} (${marker})`;
    await visitor.getByTestId('demo-chat-input').fill(message);
    const accepted = visitor.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === demoApi + '/messages');
    lastSentAt = Date.now();
    await visitor.getByTestId('demo-chat-send').click();
    const response = await accepted;
    expect(response.ok(), `Demo Chat message returned HTTP ${response.status()}`).toBe(true);
    const { data } = await response.json() as ApiResult<DemoChatSendResult>;
    expect(data.conversationId).toMatch(uuid);
    expect(data.message.id).toMatch(uuid);
    if (conversationId) expect(data.conversationId).toBe(conversationId);
    conversationId = data.conversationId;
    conversationUrl = new URL('/chat?c=' + conversationId, visitor.url()).href;
    annotateConversation();
    const customer = bubbles(visitor, 'customer').and(visitor.locator(`[data-message-id="${data.message.id}"]`));
    await expect(customer).toContainText(message);
    return data.message.id;
  }

  async function answer(question: string) {
    const prior = await bubbles(visitor, 'ai').count();
    const customerId = await visitorMessage(question);
    const reply = bubbles(visitor, 'ai').nth(prior);
    await expect(reply).toBeVisible({ timeout: 45_000 });
    return { customerId, reply };
  }

  async function handBack() {
    await owner.getByTestId('team-release').click();
    await expect(owner.getByTestId('team-handler-chip')).toHaveAttribute('data-handler', 'ai');
    takeoverRequested = false;
  }

  test.beforeAll(() => {
    marker = e2eMarker();
    startedAt = Date.now();
  });

  test.beforeEach(({}, info) => {
    info.annotations.push({ type: 'marker', description: marker });
    info.annotations.push({ type: 'conversationUrl', description: conversationUrl ?? demoPath });
  });

  test.afterAll(async () => {
    try {
      if (takeoverRequested && owner && await owner.getByTestId('team-release').isVisible()) await handBack();
    } finally {
      await Promise.all([visitorContext?.close(), ownerContext?.close()]);
    }
  });

  test('01 build identity and health', async ({ request }) => {
    const [health, ready, build] = await Promise.all([
      request.get('/healthz'), request.get('/readyz'), request.get('/build-info'),
    ]);
    for (const response of [health, ready, build]) {
      expect(response.status(), new URL(response.url()).pathname).toBe(200);
      expect(secretLike.test(await response.text()), 'Public metadata must not include credential strings').toBe(false);
    }
    expect(await health.json()).toMatchObject({ status: 'ok' });
    expect(await ready.json()).toMatchObject({ worker: { running: true } });
    const info = await build.json() as { sha: string; modelMode: string };
    expect(info.sha).toMatch(/^[0-9a-f]{7,40}$/i);
    expect(info.modelMode).toBe('openai');
    const expected = process.env.E2E_EXPECT_SHA;
    if (expected) expect(info.sha.startsWith(expected)).toBe(true);
    test.info().annotations.push({ type: 'buildSha', description: info.sha });
  });

  test('02 owner login and tenant scope', async ({ ownerPage, api, browser, baseURL }) => {
    await ownerPage.goto('/');
    await expect(ownerPage.getByRole('navigation')).toBeVisible();
    const me = await readData<{ businesses: { business: { id: string; name: string } }[] }>(await api.get('/api/v1/me'));
    const names = me.businesses.map(({ business }) => business.name);
    expect(names).toContain(shopA);
    expect(names).not.toContain(shopB);
    businessId = me.businesses.find(({ business }) => business.name === shopA)!.business.id;
    const featureResponse = await readData<{ items: FeatureFlagView[] }>(await api.get('/api/v1/features'));
    flags = featureResponse.items;
    expect(flags.filter((flag) => flag.visible && flag.placeholder).map((flag) => flag.featureId)).toEqual([]);
    ownerContext = await browser.newContext({ baseURL, storageState: await ownerPage.context().storageState() });
    owner = await ownerContext.newPage();
  });

  test('03 tenant isolation', async () => {
    const denied = await owner.request.get('/api/v1/businesses/' + shopBId);
    expect(denied.status()).toBe(404);
    expect(await denied.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    // Also verify the concrete inbox resource route against the seeded foreign conversation.
    const foreign = await owner.request.get('/api/v1/conversations/' + shopBConversation);
    expect(foreign.status()).toBe(404);
    expect(await foreign.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  test('04 public demo chat opens on a phone', async ({ browser, baseURL }) => {
    // This unauthenticated URL is an internal QA entry, separate from the judge's LINE OA QR.
    visitorContext = await browser.newContext({ baseURL, locale: 'th-TH', viewport: { width: 390, height: 844 } });
    visitor = await visitorContext.newPage();
    await visitor.goto(demoPath);
    await expect(visitor.getByRole('heading', { name: shopA })).toBeVisible();
    await expect(visitor.getByTestId('demo-chat-input')).toBeVisible();
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('05 ai answers a price from the catalog', async () => {
    const { customerId, reply } = await answer('A-GAME-01 ราคาเท่าไหร่');
    await expect(reply).toContainText(price);
    await expect(reply).not.toContainText(/\bfake\b|\berror\b|เกิดข้อผิดพลาด/i);
    priceCustomerId = customerId;
    priceReplyId = (await reply.getAttribute('data-message-id')) ?? '';
    expect(priceReplyId).toMatch(uuid);
  });

  test('06 sold out is stated, not invented', async () => {
    const { reply } = await answer('A-SOLD-01 ยังมีไหม');
    await expect(reply).toContainText(/หมด|sold out|out of stock/i);
    await expect(reply).not.toContainText(
      /(?:มีสินค้า|เหลือ|available|in stock)\s*[1-9]\d*\s*(?:ชิ้น|กล่อง|sets?|pieces?|units?)|[1-9]\d*\s*(?:sets?|pieces?|units?)\s*(?:available|in stock)/i,
    );
  });

  test('07 other shop data does not leak', async () => {
    const { reply } = await answer(privateMarker + ' คืออะไร');
    await expect(reply).not.toContainText(privateMarker);
    await expect(reply).not.toContainText(shopB);
  });

  test('08 staff sees the chat in inbox', async () => {
    const id = conversationId!;
    const detail = await readData<ConversationDetail>(await owner.request.get('/api/v1/conversations/' + id));
    const visitorName = detail.conversation.customer.displayName;
    expect(visitorName).toMatch(/^ผู้ทดลอง [0-9a-f]{4}$/i);
    await owner.goto('/chat');
    await owner.getByRole('textbox', { name: /ค้นหาแชต|Search conversations/ }).fill(visitorName);
    await owner.locator(`[data-conversation-id="${id}"]`).click({ timeout: 15_000 });
    await expect(owner).toHaveURL(new RegExp('[?&]c=' + id));
    await expect(inboxMessage(owner, priceCustomerId, 'customer')).toContainText(marker, { timeout: 15_000 });
    await expect(inboxMessage(owner, priceReplyId, 'ai')).toContainText(price, { timeout: 15_000 });
  });

  test('09 takeover silences the bot', async () => {
    test.skip(!available('F11'), 'F11 takeover is hidden or still a placeholder.');
    takeoverRequested = true;
    await owner.getByTestId('team-takeover').click();
    await expect(owner.getByTestId('team-handler-chip')).toHaveAttribute('data-handler', 'human');
    const prior = await bubbles(visitor, 'ai').count();
    await visitorMessage('ขอบคุณค่ะ');
    // A negative assertion alone would succeed before a delayed answer had a chance to arrive.
    await delay(15_000);
    await expect(bubbles(visitor, 'ai')).toHaveCount(prior);
    await expect(owner.getByTestId('team-release')).toBeVisible();
  });

  test('10 staff reply reaches the customer, release returns the bot', async () => {
    test.skip(!available('F11'), 'F11 takeover is hidden or still a placeholder.');
    test.setTimeout(90_000);
    const message = 'แอดมินมาแล้วค่ะ (' + marker + ')';
    await owner.getByRole('textbox', { name: /พิมพ์ข้อความถึงลูกค้า|Message the customer/ }).fill(message);
    await owner.getByRole('button', { name: /^(ส่ง|Send)$/ }).click();
    await expect(bubbles(visitor, 'staff').filter({ hasText: message })).toBeVisible({ timeout: 20_000 });
    await handBack();
    const { reply } = await answer('A-GAME-01 ราคาเท่าไหร่');
    await expect(reply).toContainText(price);
  });

  test('11 order proposal needs the customer to confirm', async () => {
    test.skip(!available('F13'), 'F13 orders is hidden or still a placeholder.');
    test.setTimeout(90_000);
    const shop = '/api/v1/businesses/' + businessId;
    const settings = await readData<{ effectiveRules: EffectiveAnswerRules }>(await owner.request.get(shop + '/settings'));
    test.skip(!settings.effectiveRules.orders, 'The demo shop has the AI order proposal capability disabled.');
    const scopedOrders = shop + '/orders/by-conversation/' + conversationId;
    const baseline = await owner.request.get(scopedOrders);
    test.skip(baseline.status() === 404, 'F13 has no live conversation-order read surface for this run.');
    expect((await readData<{ orders: unknown[] }>(baseline)).orders).toHaveLength(0);

    const { reply } = await answer('ขอซื้อ A-GAME-01 2 ชิ้น รับที่ร้าน');
    await expect(reply.getByTestId('order-review-confirm')).toBeVisible();
    const cancel = reply.getByTestId('order-review-cancel');
    await expect(cancel).toBeVisible();
    expect((await readData<{ orders: unknown[] }>(await owner.request.get(scopedOrders))).orders).toHaveLength(0);
    const decided = visitor.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === demoApi + '/actions');
    await cancel.click();
    const response = await decided;
    expect(response.ok()).toBe(true);
    const { data } = await response.json() as ApiResult<DemoChatActionResult>;
    expect(data.decision).toBe('cancel');
    expect((await readData<{ orders: unknown[] }>(await owner.request.get(scopedOrders))).orders).toHaveLength(0);
  });

  test('12 ops sees no dead jobs from this run', async ({ playwright, baseURL }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    test.skip(!email || !password, 'Dedicated Ops admin credentials were not supplied.');
    const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'X-Requested-With': 'nless' } });
    try {
      const login = await admin.post('/api/v1/auth/login', { data: { email, password } });
      expect(login.ok(), `Ops admin sign-in returned HTTP ${login.status()}`).toBe(true);
      const [summary, jobs] = await Promise.all([
        admin.get('/api/v1/ops/summary').then(readData<OpsSummary>),
        admin.get('/api/v1/ops/jobs?state=dead&limit=20').then(readData<ApiPage<OpsJobRow>>),
      ]);
      expect(summary.oldestQueuedAgeSeconds ?? 0).toBeLessThan(30);
      expect(jobs.items.every((job) => Date.parse(job.createdAt) < startedAt)).toBe(true);
    } finally {
      await admin.dispose();
    }
  });
});
