import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItem, CatalogItemDetail } from '@nless/shared/features/catalog/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import type { BusinessSettings } from '@nless/shared/features/business-settings/types';
import type { ReplyContext } from './context';

const mocks = vi.hoisted(() => ({
  buildContext: vi.fn(), chat: vi.fn(), searchWeb: vi.fn(), product: vi.fn(), details: vi.fn(),
  findDraft: vi.fn(), saveDraft: vi.fn(), knowledgeItem: vi.fn(), knowledge: vi.fn(),
}));
vi.mock('../../core', () => ({
  AppError: class AppError extends Error { constructor(public code: string) { super(code); } },
  config: { MODEL_TIMEOUT_MS: 20000 },
  model: { chat: mocks.chat, searchWeb: mocks.searchWeb },
}));
vi.mock('../catalog/service', () => ({ getProduct: mocks.product, getCatalogItemDetails: mocks.details }));
vi.mock('../knowledge/service', () => ({
  createWebKnowledgeDraft: mocks.saveDraft, findWebKnowledgeDraft: mocks.findDraft, getKnowledgeItem: mocks.knowledgeItem,
}));
vi.mock('../knowledge-search/service', () => ({ searchKnowledge: mocks.knowledge }));
vi.mock('./repo', () => ({
  priorSavedReply: vi.fn().mockResolvedValue(null),
  customerInboundsHeldByStaff: vi.fn().mockResolvedValue(new Set()),
}));
vi.mock('./context', async (original) => ({
  ...await original<typeof import('./context')>(),
  buildReplyContext: mocks.buildContext,
}));

import { AppError } from '../../core';
import { fallbacks } from './fallbacks';
import { generateDraft } from './generation';
import { productFactQuestion, replyWithProductFact } from './product-facts';

const businessId = '11111111-1111-4111-8111-111111111111';
const product: CatalogItem = {
  id: '22222222-2222-4222-8222-222222222222', businessId,
  sku: 'PHONE-DEMO-01', name: 'โทรศัพท์ตัวอย่าง', nameEn: 'iPhone 15', kind: 'product',
  active: true, priceMinor: 499000, stock: 9, currency: 'THB', shippable: true, durationMinutes: null, version: 3,
  variants: [{ id: 'red', name: 'Red', sku: 'PHONE-RED-02', priceMinor: null, stock: 5 }],
};
const details: CatalogItemDetail = {
  ...product, description: null, category: null, unit: 'piece', images: [],
  variants: product.variants.map((variant) => ({ ...variant, effectivePriceMinor: product.priceMinor, effectiveStock: variant.stock })),
};
const provenance = { url: 'https://support.apple.com/123', title: 'Device specifications' };

function context(text: string, language: ReplyContext['language'] = 'en'): ReplyContext {
  return {
    language, unanswered: [text], rules: {
      generalKnowledge: true, price: 'always', stock: 'always', contact: 'never',
      booking: false, orders: false, handoff: true,
    },
    knowledge: [], prices: [], totals: [], tools: [], messages: [], contact: '', cardMasked: false, shopOpen: true,
    catalogRequest: { text, skus: [], previousSkus: [], linkedSameProduct: false },
  };
}

function resolve(ctx: ReplyContext) {
  const question = productFactQuestion(ctx.unanswered);
  if (!question) throw new Error('Expected a product fact question');
  return replyWithProductFact({
    question, context: ctx, usage: { featureId: 'F10', purpose: 'test', businessId },
    signal: new AbortController().signal, deadline: performance.now() + 20_000, noteUsage: vi.fn(), suggestDraft: true,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.product.mockResolvedValue(product);
  mocks.details.mockResolvedValue([details]);
  mocks.findDraft.mockResolvedValue(null);
  mocks.knowledge.mockResolvedValue({ hits: [] });
  mocks.searchWeb.mockResolvedValue({ answer: 'iPhone 15 supports Qi2 wireless charging.', citations: [provenance] });
  mocks.chat.mockResolvedValue({ json: { answer: null, evidenceIds: [] }, finishReason: 'stop' });
});

describe('product facts in a real turn', () => {
  it('routes polite Thai and English questions and leaves commerce and extra messages to the regular turn', () => {
    expect(productFactQuestion(['มาตรฐาน Qi2 คืออะไรครับ'])).toEqual({ subject: 'Qi2', topic: 'standard definition', standard: true });
    expect(productFactQuestion(['รุ่น iPhone 15 รองรับ Qi2 ไหมคะ'])).toMatchObject({ subject: 'iPhone 15', topic: 'compatibility with Qi2' });
    expect(productFactQuestion(['Could you please tell me if iPhone 15 supports Qi2?'])).toMatchObject({
      subject: 'iPhone 15', topic: 'compatibility with Qi2',
    });
    for (const text of ['What are the specs and price of PHONE-DEMO-01?', 'Does iPhone 15 support Qi2 and how much is it?',
      'iPhone 15 มีของไหมคะ', 'How much does PHONE-DEMO-01 cost?', 'What is Qi2? user@example.com']) {
      expect(productFactQuestion([text])).toBeNull();
    }
    expect(productFactQuestion(['What is Qi2?', 'Also send it to my email'])).toBeNull();
  });

  it('uses catalog description when it answers and never sends the shop description to web search', async () => {
    const id = 'catalog:' + product.id + ':v3';
    mocks.details.mockResolvedValue([{ ...details, description: 'Supports Qi2 wireless charging.' }]);
    mocks.chat.mockResolvedValue({ json: { answer: 'It supports Qi2 wireless charging.', evidenceIds: [id] }, finishReason: 'stop' });
    const reply = await resolve(context('Does PHONE-DEMO-01 support Qi2?'));
    expect(reply.parts).toEqual([{ type: 'text', text: 'It supports Qi2 wireless charging.' }]);
    expect(reply.evidenceIds).toEqual([id]);
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it('uses relevant approved shop knowledge before web', async () => {
    const hit = { knowledgeItemId: 'approved', revision: 2, title: 'Phone FAQ', snippet: 'The iPhone 15 supports Qi2.', score: 1 };
    mocks.knowledge.mockResolvedValue({ hits: [hit] });
    mocks.chat.mockResolvedValue({
      json: { answer: hit.snippet, evidenceIds: ['knowledge:approved:r2'] }, finishReason: 'stop',
    });
    const reply = await resolve(context('Does iPhone 15 support Qi2?'));
    expect(reply.evidenceIds).toEqual(['knowledge:approved:r2']);
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it('uses a bounded canonical query, only structured source links and a draft for a known parent with variants', async () => {
    const ctx = context('Does PHONE-DEMO-01 support Qi2?');
    mocks.searchWeb.mockResolvedValue({
      answer: 'iPhone 15 supports Qi2 wireless charging. [1]',
      citations: [provenance, { url: 'javascript:alert(1)', title: 'unsafe' }, { url: 'https://127.0.0.1/page', title: 'private' }],
    });
    const reply = await resolve(ctx);
    expect(mocks.searchWeb).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      query: 'iPhone 15 compatibility with Qi2 official specifications', language: 'en',
    }));
    expect(reply.evidenceIds).toEqual(['web:' + provenance.url]);
    expect(reply.parts).toEqual([
      { type: 'text', text: 'Information from public sources\niPhone 15 supports Qi2 wireless charging.' },
      { type: 'text', text: 'Source 1 · ' + provenance.title + '\n' + provenance.url },
    ]);
    expect(mocks.saveDraft).toHaveBeenCalledExactlyOnceWith({
      businessId, question: 'iPhone 15 · compatibility with Qi2 (en)',
      answer: 'iPhone 15 supports Qi2 wireless charging.', citations: [provenance],
    });
    expect(ctx.tools.find(({ name }) => name === 'web_search')?.ok).toBe(true);
  });

  it('handles a Thai standard and a recognizable public model absent from the shop', async () => {
    mocks.product.mockResolvedValue(null);
    mocks.searchWeb.mockResolvedValueOnce({ answer: 'Qi2 เป็นมาตรฐานการชาร์จไร้สายค่ะ', citations: [provenance] });
    const thai = await resolve(context('มาตรฐาน Qi2 คืออะไรครับ', 'th'));
    expect(thai.parts[0]).toEqual({ type: 'text', text: 'ข้อมูลจากแหล่งสาธารณะ\nQi2 เป็นมาตรฐานการชาร์จไร้สายค่ะ' });
    expect(thai.parts[1]).toMatchObject({ text: expect.stringContaining('แหล่งอ้างอิง 1') });
    const english = await resolve(context('Does iPhone 15 support Qi2?'));
    expect(english.productRefs).toEqual([]);
    expect(english.evidenceIds).toEqual(['web:' + provenance.url]);
    expect(mocks.searchWeb.mock.calls.map(([input]) => input.query)).toEqual([
      'Qi2 standard definition official specifications', 'iPhone 15 compatibility with Qi2 official specifications',
    ]);
  });

  it('keeps arbitrary personal names, unknown store SKUs and unidentified variants out of web search', async () => {
    mocks.product.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const unknown = await resolve(context('Does SHOP-UNKNOWN-42 support Qi2?'));
    expect(unknown.parts).toEqual([{ type: 'text', text: fallbacks.product_not_found.en }]);
    await resolve(context('Does John Smith support Qi2?'));
    await resolve(context('Does PHONE-RED-02 support Qi2?'));
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it('uses the merchant-edited active FAQ and its citations for a new turn before retrieval or model calls', async () => {
    const text = 'What is Qi2?';
    const first = await resolve(context(text));
    expect(first.evidenceIds).toEqual(['web:' + provenance.url]);
    mocks.knowledge.mockClear();
    mocks.findDraft.mockResolvedValue({ itemId: 'approved', status: 'active' });
    mocks.knowledgeItem.mockResolvedValue({
      id: 'approved', revision: 4, status: 'active', source: 'web',
      body: 'Qi2 aligns compatible devices magnetically for wireless charging.',
      webSuggestion: { citations: [provenance] },
    });
    const repeated = await resolve(context(text));
    expect(repeated.parts).toEqual([
      { type: 'text', text: 'Qi2 aligns compatible devices magnetically for wireless charging.' },
      { type: 'text', text: 'Source 1 · Device specifications\n' + provenance.url },
    ]);
    expect(repeated.evidenceIds).toEqual(['knowledge:approved:r4']);
    expect(mocks.searchWeb).toHaveBeenCalledTimes(1);
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
    expect(mocks.knowledge).not.toHaveBeenCalled();
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it.each(['empty', 'error', 'unsupported', 'commerce', 'inconclusive'])('returns the ordinary fallback for a %s search result', async (failure) => {
    if (failure === 'empty') mocks.searchWeb.mockResolvedValue({ answer: '', citations: [] });
    if (failure === 'error') mocks.searchWeb.mockRejectedValue(new Error('network issue'));
    if (failure === 'unsupported') mocks.searchWeb.mockResolvedValue({ answer: 'Qi2 is a charging standard.', citations: [] });
    if (failure === 'commerce') mocks.searchWeb.mockResolvedValue({ answer: 'Available in stock for $25.', citations: [provenance] });
    if (failure === 'inconclusive') mocks.searchWeb.mockResolvedValue({ answer: "I couldn't verify support.", citations: [provenance] });
    const reply = await resolve(context('What is Qi2?'));
    expect(reply.parts).toEqual([{ type: 'text', text: fallbacks.no_answer.en }]);
    expect(reply.offerStaff).toBe(true);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it.each(['draft', 'deleted'])('does not read or recreate a %s suggestion', async (status) => {
    mocks.findDraft.mockResolvedValue({ itemId: 'existing-suggestion', status });
    const reply = await resolve(context('What is Qi2?'));
    expect(reply.evidenceIds).toEqual([]);
    expect(mocks.knowledgeItem).not.toHaveBeenCalled();
    expect(mocks.searchWeb).not.toHaveBeenCalled();
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it('preserves the provider budget outcome and skips web when general knowledge is off or approved search fails', async () => {
    const off = context('What is Qi2?');
    off.rules.generalKnowledge = false;
    await resolve(off);
    mocks.knowledge.mockRejectedValueOnce(new Error('retrieval unavailable'));
    await resolve(context('What is Qi2?'));
    expect(mocks.searchWeb).not.toHaveBeenCalled();
    mocks.searchWeb.mockRejectedValue(new AppError('PROVIDER_BUDGET_EXHAUSTED', 'Budget exhausted'));
    await expect(resolve(context('What is Qi2?'))).rejects.toMatchObject({ code: 'PROVIDER_BUDGET_EXHAUSTED' });
  });

  it('allows a measured 8.78s search and falls back when the provider exceeds its 12s share', async () => {
    vi.useFakeTimers();
    const timer = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const clock = new AbortController();
      setTimeout(() => clock.abort(), ms);
      return clock.signal;
    });
    try {
      mocks.searchWeb.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((accept, reject) => {
        const delay = setTimeout(() => accept({ answer: 'Qi2 is a charging standard.', citations: [provenance] }), 8_780);
        signal.addEventListener('abort', () => { clearTimeout(delay); reject(signal.reason); }, { once: true });
      }));
      const slow = resolve(context('What is Qi2?'));
      await vi.advanceTimersByTimeAsync(8_780);
      await expect(slow).resolves.toMatchObject({ evidenceIds: ['web:' + provenance.url] });
      expect(mocks.saveDraft).toHaveBeenCalledTimes(1);

      mocks.searchWeb.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((_accept, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }));
      const timeout = resolve(context('What is Qi2?'));
      await vi.advanceTimersByTimeAsync(12_000);
      await expect(timeout).resolves.toMatchObject({ parts: [{ type: 'text', text: fallbacks.no_answer.en }] });
      expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
    } finally {
      timer.mockRestore();
      vi.useRealTimers();
    }
  });

  it('connects the actual draft-generation entry point to product facts', async () => {
    const text = 'What is Qi2?';
    const inbound = {
      id: 'inbound', seq: 1, direction: 'inbound', author: 'customer', parts: [{ type: 'text', text }],
    } as MessageRecord;
    mocks.buildContext.mockResolvedValue(context(text));
    const result = await generateDraft('turn', { id: 'conversation', businessId } as ConversationRecord, [inbound],
      inbound, { language: 'en' } as BusinessSettings, new AbortController().signal, 'suggest');
    expect(result.state).toBe('completed');
    expect(result.draft.evidenceIds).toEqual(['web:' + provenance.url]);
    expect(mocks.buildContext).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(),
      expect.anything(), 'en', expect.anything(), expect.objectContaining({ skipLookups: true }));
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });
});
