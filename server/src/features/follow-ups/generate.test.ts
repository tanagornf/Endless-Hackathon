import { beforeEach, expect, it, vi } from 'vitest';
import { generateNudge } from './generate';

const mocks = vi.hoisted(() => ({ chat: vi.fn(), language: vi.fn() }));
vi.mock('../../core', () => ({ model: { chat: mocks.chat } }));
vi.mock('../inbox/service', () => ({ getCustomerLanguage: mocks.language }));

const input = {
  businessId: 'shop-a', conversationId: 'chat-a', shopName: 'Demo Shop',
  product: { name: 'การ์ดตัวอย่าง 2', nameEn: 'Demo Cards 2', sku: 'A-CARD-02' },
};
const fake = (text: string, finishReason = 'stop') => mocks.chat.mockResolvedValue({ json: { text }, finishReason });

beforeEach(() => {
  mocks.chat.mockReset();
  mocks.language.mockReset().mockResolvedValue('en');
});

it('uses F09 language and only sends product, shop and locale to the scoped model call', async () => {
  const localized = 'We can help if you have questions about Demo Cards 2.';
  fake(localized);
  expect(await generateNudge(input)).toEqual({ text: localized, textSource: 'model' });
  expect(mocks.language).toHaveBeenCalledWith('chat-a', { businessId: 'shop-a' });
  expect(mocks.chat).toHaveBeenCalledOnce();
  const [request] = mocks.chat.mock.calls[0]!;
  expect(request.usage).toEqual({ featureId: 'F38', purpose: 'nudge', businessId: 'shop-a', conversationId: 'chat-a' });
  expect(JSON.parse(request.messages[1].content)).toEqual({
    shop_name: input.shopName, language: 'en', product_name: input.product.nameEn, product_sku: input.product.sku, in_stock: true,
  });
});

it.each([
  'We can help with Demo Cards 2 for only 90 baht.',
  'Ask us about our discount on Demo Cards 2.',
  'Ask us about Demo Cards 2 😊.',
  'Ask us about Demo Cards 2 at example.com.',
  'Ask us about Demo Cards 2 ครับ.',
  'We can help with Demo Cards 2. '.repeat(9),
])('replaces invalid model copy %# with the bilingual template input', async (invalid) => {
  fake(invalid);
  const result = await generateNudge(input);
  expect(result.textSource).toBe('template');
  expect(result.text).toContain('Demo Cards 2');
  expect(result.text).not.toBe(invalid);
});

it('uses Thai form and falls back for the wrong politeness or a truncated answer', async () => {
  mocks.language.mockResolvedValue('th');
  fake('หากสนใจการ์ดตัวอย่าง 2 ทางร้านยินดีช่วยนะคะ');
  expect((await generateNudge(input)).textSource).toBe('model');
  fake('หากสนใจการ์ดตัวอย่าง 2 ทางร้านยินดีช่วยครับ');
  const fallback = await generateNudge(input);
  expect(fallback).toEqual({ text: expect.stringContaining('การ์ดตัวอย่าง 2'), textSource: 'template' });
  expect(fallback.text).toMatch(/นะคะ$/);
  fake('หากสนใจการ์ดตัวอย่าง 2 ทางร้านยินดีช่วยนะคะ', 'length');
  expect((await generateNudge(input)).textSource).toBe('template');
});

it('uses neutral safe copy after a provider failure when a catalog name contains a deal claim', async () => {
  mocks.chat.mockRejectedValue(Object.assign(new Error('budget'), { code: 'PROVIDER_BUDGET_EXHAUSTED' }));
  expect(await generateNudge({ ...input, product: { name: 'Sale free today' } })).toEqual({
    text: expect.stringContaining('the product you asked about'), textSource: 'template',
  });
});
