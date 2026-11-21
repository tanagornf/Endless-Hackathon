import { now, shop, tote } from './shop';
import type { ImportView } from '../../shared/features/knowledge-import/types';

const customer = { id: 'sample-mali', displayName: 'Mali · Demo', channel: 'web', tags: ['Canvas bags'], lastSeenAt: now, contact: { email: 'mali@example.test' } };
const productName = tote.nameEn;
const code = { code: tote.sku, itemName: productName, unitPriceMinor: tote.priceMinor };
const date = now.slice(0, 10);
const tomorrow = new Date(Date.parse(now) + 86400000).toISOString();
const orderNumber = 'DEMO-1001';
const turn = { turnId: 'demo-tote-sizing', state: 'completed', intent: 'product_question', latencyMs: 420 };
const daily = [2, 4, 3, 6, 5, 8, 4].map((conversations, i) => ({
  date: new Date(Date.parse(now) - (6 - i) * 86400000).toISOString().slice(0, 10),
  conversations, customerMessages: conversations * 2, aiReplies: conversations, staffMessages: conversations,
}));
const total = daily.reduce((sum, day) => sum + day.conversations, 0);
const guideImport: ImportView = {
  id: 'product-guide', sourceLabel: 'studio-product-guide.csv', kind: 'csv', target: 'faq', state: 'done',
  phase: null, sourceUrl: null, sizeBytes: 192, progress: { done: 1, total: 1 }, header: ['Question', 'Answer'],
  mapping: { faq: { question: 0, answer: 1 } }, detected: null, duplicate: null, version: 1,
  options: { mode: 'extract_faq', folderName: 'Product guide', catalogMode: 'create_only', allowReimport: false },
  counts: { total: 1, ready: 0, error: 0, excluded: 0, written: 1, updated: 0, skipped: 0 },
  warnings: [], moderationFlagged: false, error: null, createdBy: shop.id, createdAt: now,
  timings: { uploadedAt: now, parsedAt: now, readyAt: now, commitStartedAt: now, committedAt: now,
    parseMs: 0, reviewMs: 0, commitMs: 0, totalMs: 0 },
};

export const businessViews: Record<string, unknown> = {
  '/analytics/dashboard': { conversations: { active: total, newCustomers: 8 }, now: { waitingForStaff: 0 },
    messages: { ai: total }, daily, channels: [{ channel: 'line', conversations: total - 4 }, { channel: 'web', conversations: 4 }] },
  '/analytics/usage': { rows: [{ featureLabel: 'Product questions', calls: total, knownUsdMicros: 84000 }] },
  '/analytics/traces': { items: [turn] },
  '/crm/customers': { items: [customer] },
  '/crm/customers/sample-mali': customer,
  '/templates': [{ id: 'tote-sizing', name: 'Tote sizing reply', altText: 'The Everyday Canvas Tote fits a 13-inch laptop.', updatedAt: now }],
  '/broadcasts': { items: [{ id: 'weekend', name: 'Weekend studio collection', status: 'draft', scheduledAt: tomorrow }] },
  '/broadcasts/tags': [{ name: 'Canvas bags' }],
  '/imports': { items: [guideImport], nextCursor: null },
  '/imports/product-guide': guideImport,
  '/imports/product-guide/rows': { items: [{ id: 'guide-row', rowNo: 1, target: 'faq', status: 'written', error: null, warnings: [],
    data: { question: 'Will the tote fit my laptop?', answer: 'It fits a 13-inch laptop.', sourceQuote: null, folder: 'Product guide' },
    cells: null, createdRef: 'tote-sizing' }], nextCursor: null },
  '/chatgpt-catalog/settings': { feedEnabled: true, mcpEnabled: false },
  '/chatgpt-catalog/preview': { rows: [{ item_id: tote.sku, title: productName, price: '690 THB' }], excluded: [{ sku: 'POUCH-02', name: 'Zipper pouch', reason: 'Missing price' }] },
  '/ai/turns': { items: [turn] },
  '/ai/metrics': { turns: 12, completed: 12, medianLatencyMs: 420 },
  '/ai-quality/runs': { items: [{ id: 'sizing-check', mode: 'sandbox', score: 0.95, costUsd: 0 }] },
  '/ai-quality/cases': { items: [{ id: 'tote-laptop-fit', category: 'Product sizing' }] },
  '/follow-ups': { items: [{ customerName: customer.displayName, productName, scheduledFor: tomorrow, state: 'scheduled' }] },
  '/follow-ups/summary': { scheduled: 1, sent: 0, recoveryRate: 0 },
  '/follow-ups/settings': { enabled: true, delayHours: 24, allowedChannels: ['LINE'] },
  '/orders': { items: [{ orderNumber, customerName: customer.displayName, totalMinor: tote.priceMinor, status: 'confirmed', createdAt: now }] },
  '/payments': { items: [{ orderNumber, amountMinor: tote.priceMinor, state: 'pending', expiresAt: tomorrow }] },
  '/booking/appointments': { items: [{ customerName: customer.displayName, serviceName: 'Studio pickup', resourceName: 'Front counter', startAt: tomorrow, status: 'confirmed' }] },
  '/calendar/status': { connection: { status: 'sandbox', calendarName: 'Studio pickups' }, counts: { failed: 0 } },
  '/calendar/calendars': { items: [{ name: 'Studio pickups', timezone: shop.timezone, id: 'demo-pickups' }] },
  '/product-codes': { items: [code] },
  '/live/sessions/current': { title: 'Inside the canvas studio', state: 'draft', startedAt: null },
  '/live/presentation': { codes: [code] },
  '/comment-replies/rules': { items: [{ name: 'Tote availability', channel: 'LINE', keywords: ['tote', 'canvas'], enabled: false }] },
  '/comment-replies/deliveries': { items: [{ channel: 'LINE', ruleName: 'Tote availability', state: 'skipped', createdAt: now }] },
  '/comment-replies/summary': { sent: 0, pending: 0, failed: 0, skipped: 1 },
  '/insights/conversations': { items: [{ customerName: customer.displayName, summary: 'Asked whether the tote fits a laptop.', sentiment: 'positive' }] },
  '/insights/overview': { analysed: 1, followUpOpen: 1 },
  '/channels/meta': { facebook: { status: 'inactive' }, instagram: { status: 'inactive' }, mode: 'sandbox', appConfigured: false },
  '/channels/meta/events': { items: [{ channel: 'Instagram', eventType: 'Sample comment', state: 'skipped', receivedAt: now }] },
  '/notifications': { items: [{ id: 'studio-import', title: 'Product guide imported', body: 'Your canvas care guide is ready to review.', createdAt: now, readAt: null }] },
};

export const globalViews: Record<string, unknown> = {
  '/auth/status': { userId: shop.id, email: 'studio@example.test', displayName: 'UI preview', locale: 'th', emailVerified: true, isPlatformAdmin: true },
  '/businesses': { items: [{ businessId: shop.id, name: shop.name, status: 'active', role: 'owner', isCurrentAccount: true }] },
  '/release/status': { rows: [{ featureId: 'F05', name: 'Knowledge library · Demo', lane: 'B1', actualMode: 'S', blocker: null }], totals: { R: 0, S: 1, A: 0, U: 0 } },
  '/ops/jobs': { items: [{ type: 'knowledge.index', state: 'completed', attempts: 1, runAt: now }] },
  '/ops/schedules': { items: [{ name: 'Daily catalog refresh', lastEnqueuedAt: now }] },
  '/ops/deliveries': { items: [{ channel: 'web', deliveryState: 'sandbox', createdAt: now }] },
  '/ops/build': { shortSha: 'preview', env: 'local', schema: date, modelMode: 'fake' },
  '/ops/routes': { items: [{ method: 'GET', path: '/knowledge/items', permission: 'product.read' }] },
  '/ops/audit': { items: [{ action: 'knowledge.imported', targetType: 'Product guide', createdAt: now }] },
};
