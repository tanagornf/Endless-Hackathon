# COOKBOOK: แพตเทิร์นที่ทุก lane ใช้ซ้ำ (copy แล้วเปลี่ยนชื่อ)

ลำดับความจริง: [`contracts.ts`](competition-plan/templates/contracts.ts) (signature, props ของ UI kit) > [`openai-api.md`](openai-api.md) (AI) > `AGENTS.md` (กติกา) > build spec ของฟีเจอร์ ([docs/specs/](specs/README.md): ตาราง, endpoint, algorithm, prompt) > [`docs/specs/F01-core.md`](specs/F01-core.md) (layout, สคริปต์, core) > ไฟล์นี้ ขัดกันเมื่อไรไฟล์นี้ผิด
ตัวอย่างใช้ F08 `catalog` (B1) เป็นหลัก ให้แทน `F08` / `catalog` / `product.*` ด้วยของ lane ตัวเอง · **ข้อเสนอ** = contracts.ts และ C1-setup ไม่ได้กำหนด ใช้ได้ถ้า repo จริงไม่มีของที่ขัด

## 1. โครงฟีเจอร์ (3 โฟลเดอร์ต่อ slug)

```text
server/src/features/<slug>/  routes.ts     export default defineFeatureRoutes(...) core โหลดเองตอน boot (routes + jobs + schedules)
                             service.ts    public API ตาม contracts.ts · ฟีเจอร์อื่น import ได้แค่ไฟล์นี้
                             migrations/001_<snake_name>.sql   seed.ts (ถ้ามี)   *.test.ts   EVIDENCE.md
                             repo.ts tools.ts jobs.ts …       ข้อเสนอ: ไฟล์ภายใน (private)
shared/features/<slug>/      types.ts      public types (C1 แตกจาก contracts.ts) + type ที่เพิ่มเอง
web/src/features/<slug>/     pages.tsx     export default defineFeaturePages(...) core glob เอง
                             CatalogPage.tsx (lazy, default export)   i18n/th.json  i18n/en.json   *.test.tsx
```
```ts
import { AppError, db, jobs, model, publish, sendToCustomer, defineFeatureRoutes } from '../../core';  // core: index.ts เท่านั้น
import type { JobHandler, ModelMessage, ModelTool, ModelToolCall, UsageAttribution } from '../../core';
import { getPrice } from '../catalog/service';                               // ฟีเจอร์อื่น: service.ts เท่านั้น
import type { PriceQuote } from '@nless/shared/features/catalog/types';     // types: shared เท่านั้น
import type { Page, MessagePart } from '@nless/shared/core/types';
// คำสั่ง: npm run lane:init → db:migrate → db:seed → dev (ครั้งแรก) · ก่อน PR: npm run typecheck; npm test -- catalog; npm run check:paths
//         (หรือ npm run check) · npm run db:reset = DB ของ lane ตัวเองเท่านั้น
```
อย่าทำ: แก้นอก 3 โฟลเดอร์ของ slug ตัวเอง (`package.json`, lockfile, core → `NEED TO:C1`) · สร้างไฟล์ routes/เมนู/ภาษากลาง · import ไฟล์ภายในของฟีเจอร์อื่น · import type แบบ value (`verbatimModuleSyntax` เปิด: ต้อง `import type`)

## 2. API route: zod + สิทธิ์ + ApiResult + AppError

path นับจาก `/api/v1` · `auth:'business'` ต้องมี `:businessId` แล้ว core รัน `getBusiness` + `permission` ให้ · zod ไม่ผ่าน → 400 `VALIDATION_ERROR` เอง · return ค่าเปล่า = 200 `{ data, meta }`
```ts
// server/src/features/catalog/routes.ts
import { z } from 'zod';
import { AppError, defineFeatureRoutes, requirePermission } from '../../core';
import { getConversation } from '../inbox/service';
import { createItem, deleteItem, listItems } from './repo';
const ListQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });
const CreateBody = z.object({ sku: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(200), priceMinor: z.number().int().min(0) });
// แก้ไข: PATCH body มี expectedVersion → ไม่ตรง throw VERSION_CONFLICT

export default defineFeatureRoutes({
  featureId: 'F08',
  slug: 'catalog',
  register(api) {
    api.get('/businesses/:businessId/catalog/items',
      { auth: 'business', permission: 'product.read', query: ListQuery, summary: 'รายการสินค้าและบริการ' },
      async (ctx) => listItems(ctx.business!.id, ctx.query));                         // → Page<CatalogItem>
    api.post('/businesses/:businessId/catalog/items',
      { auth: 'business', permission: 'product.write', body: CreateBody, summary: 'เพิ่มสินค้า' },
      async (ctx) => ({ kind: 'json', status: 201, data: await createItem(ctx.business!.id, ctx.body, ctx.user!.id) }));
    api.delete('/businesses/:businessId/catalog/items/:itemId', { auth: 'business' }, async (ctx) => {
      requirePermission(ctx.scope!, 'product.delete');                                 // เช็กสิทธิ์ใน handler ได้ (sync)
      await deleteItem(ctx.business!.id, ctx.params.itemId, ctx.user!.id);
      return { kind: 'no_content' };
    });
    // resource ที่ไม่มี :businessId → auth 'user' แล้ว requireBusiness ก่อนอ่านอย่างอื่น
    api.get('/conversations/:conversationId/catalog-suggestions', { auth: 'user' }, async (ctx) => {
      const conv = await getConversation(ctx.params.conversationId);
      if (!conv) throw new AppError('NOT_FOUND', 'conversation not found');
      await ctx.requireBusiness(conv.businessId, 'product.read');
      return listItems(conv.businessId, { limit: 5 });
    });
  },
});
```

error code ที่โยนเอง: `VALIDATION_ERROR` (กติกาของ input ที่ zod ไม่รู้ เช่น qty ≤ 0) · `NOT_FOUND` (ไม่มีแถว **หรือเป็นของร้านอื่น** ห้ามตอบ 403 ที่บอกว่ามีอยู่) · `VERSION_CONFLICT` (`expectedVersion` ไม่ตรง) · `IDEMPOTENCY_CONFLICT` (`clientRequestId` เดิม payload ต่าง) · `SOLD_OUT` `SLOT_FULL` `PROPOSAL_EXPIRED` `POLICY_BLOCKED` (+ `details.reason`) `CHANNEL_NOT_CONNECTED` `KNOWLEDGE_NOT_READY` ตาม JSDoc ของ contract · `SERVICE_NOT_READY` (ทำ side effect จริงไม่ได้, R8) — ส่วน `AUTH_REQUIRED` `PERMISSION_DENIED` `PROVIDER_*` `RATE_LIMITED` core โยนให้ และ `INTERNAL` ห้ามโยนเอง

อย่าทำ: return `{ data }` เอง (ซ้อนสองชั้น) · อ่าน `businessId`/ราคา/`userId` จาก body · `auth:'business'` บน path ที่ไม่มี `:businessId` · ใส่ข้อความลูกค้าหรือ secret ใน `details` · ข้อเสนอ: `message` ของ AppError เป็นอังกฤษสั้นสำหรับ dev (UI แปลจาก `code` ผ่าน `common:errors.<code>`)

## 3. service.ts: แทน fake โดยไม่เปลี่ยน signature + เรียกข้ามฟีเจอร์

C1 เขียน fake ตาม `@fake` ไว้แล้ว เจ้าของแก้แค่ body · ชื่อ พารามิเตอร์ return type และพฤติกรรม error ตรง JSDoc ทุกตัวอักษร
```ts
// server/src/features/catalog/service.ts
import { AppError } from '../../core';
import type { CatalogItem, PriceQuote, ProductRef } from '@nless/shared/features/catalog/types';
import { findItem } from './repo';
export async function getProduct(businessId: string, ref: ProductRef): Promise<CatalogItem | null> {
  return findItem(businessId, ref);                       // R3: ไม่เจอ / inactive / ร้านอื่น → null ไม่ throw
}
export async function getPrice(businessId: string, input: ProductRef & { variantId?: string | null; quantity?: number }): Promise<PriceQuote> {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) throw new AppError('VALIDATION_ERROR', 'quantity must be a positive integer');
  const item = await getProduct(businessId, input);
  if (!item) throw new AppError('NOT_FOUND', 'catalog item not found');
  const variant = input.variantId ? item.variants.find((v) => v.id === input.variantId) : undefined;
  if (input.variantId && !variant) throw new AppError('NOT_FOUND', 'variant not found');
  const unit = variant?.priceMinor ?? item.priceMinor, available = variant ? variant.stock : item.stock;
  return { itemId: item.id, variantId: variant?.id ?? null, sku: variant?.sku ?? item.sku, name: item.name, quantity,
    unitPriceMinor: unit, subtotalMinor: unit * quantity, currency: 'THB', available,
    soldOut: available !== null && available < quantity, version: item.version };   // R4: soldOut เป็นค่า ไม่ throw
}
// ผู้เรียก (เช่น A2 orders) import { getPrice } from '../catalog/service' เท่านั้น
const q = await getPrice(businessId, { sku: 'A-GAME-01', quantity: 2 });   // businessId จาก ctx.business ไม่ใช่จาก model/body
if (q.soldOut) throw new AppError('SOLD_OUT', `${q.sku} sold out`);
```
อย่าทำ: เปลี่ยน/เพิ่มพารามิเตอร์บังคับ (`CHANGE TO:<เจ้าของ>` ก่อน; field/option ใหม่แบบ optional เพิ่มได้หลังเจ้าของโพสต์ `DONE CHANGE`) · return `ApiFailure` หรือ throw `Error` ธรรมดาใน service (R2) · query ตารางของฟีเจอร์อื่นแทนการเรียก service · catch `SERVICE_NOT_READY` ของ fake แล้วทำเหมือนสำเร็จ · มี side effect ตอน import `service.ts` (service เรียกกันเป็นวง)

## 4. Migration + seed

`server/src/features/<slug>/migrations/NNN_<snake_name>.sql` เรียง 001, 002 … · บรรทัดแรก `-- dependsOn:` (core implied เสมอ) · ไฟล์ละ transaction · ชื่อตาราง: ตามหัวข้อ "เป็นเจ้าของ" ใน porting brief ถ้าไม่มี **ข้อเสนอ:** ขึ้นต้นด้วย slug แบบ snake (`catalog_`, `live_commerce_`)
```sql
-- dependsOn: core
CREATE TABLE catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,   -- FK ไปตาราง core ได้เสมอ
  sku text NOT NULL, name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('product','service')),                -- enum = text + CHECK ตรง type ใน contracts.ts
  price_minor bigint NOT NULL CHECK (price_minor >= 0),                    -- เงิน = สตางค์ integer
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  stock int,                                                               -- null = ไม่นับสต็อก
  active boolean NOT NULL DEFAULT true, version int NOT NULL DEFAULT 1,    -- version = optimistic lock
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_items_sku ON catalog_items (business_id, lower(sku));
CREATE INDEX catalog_items_list ON catalog_items (business_id, created_at DESC);   -- ข้อเสนอ: ทุก index ขึ้นต้น business_id

-- dependsOn: core, catalog          (orders/migrations/001_orders.sql: FK ข้ามฟีเจอร์ได้เพราะ catalog อยู่ใน dependsOn)
CREATE TABLE order_lines (order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id), unit_price_minor bigint NOT NULL, quantity int NOT NULL CHECK (quantity > 0));
-- id ของฟีเจอร์ที่ไม่ได้อยู่ใน dependsOn → uuid ธรรมดา + index ไม่มี FK
-- vector: embedding vector(1536), embed_model text NOT NULL, embed_dim int NOT NULL (extension vector มีใน core แล้ว)
```
```ts
// server/src/features/catalog/seed.ts · idempotent · SEED เท่านั้น · ข้อเสนอ: default export แบบ routes.ts
import type { FeatureSeed } from '../../core';
export default { featureId: 'F08', dependsOn: ['core'], async run({ db, fixtures, id, log }) {
  for (const it of fixtures.catalog) {
    await db.query(`INSERT INTO catalog_items (id, business_id, sku, kind, name, price_minor, stock, version)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [it.id, id(it.businessAlias), it.sku, it.kind, it.name, it.priceMinor, it.stock, it.version]);   // id(alias) → uuid ตาม SEED
  }
  log(`catalog: ${fixtures.catalog.length} items`);
} } satisfies FeatureSeed;
```
อย่าทำ: `ALTER`/`DROP` ตาราง core หรือของฟีเจอร์อื่น (ต้องการคอลัมน์เพิ่ม → ตารางของตัวเอง key ด้วย id เดิม หรือ `NEED`) · แก้ไฟล์ที่รันแล้ว (checksum fail: ก่อน merge `npm run db:reset`, หลัง merge เพิ่ม NNN ใหม่) · `CREATE EXTENSION` เอง · เงินเป็น `numeric`/float · `timestamp` ไม่มี tz · seed ที่ไม่มีใน SEED หรือเบอร์/บัญชีจริง

## 5. Tests (vitest, test DB, MODEL_MODE=fake)

global setup ของ C1 ล้าง test DB → migrate → seed ครั้งเดียวต่อรอบ ไฟล์ test รันทีละไฟล์ · `npm test -- catalog` กรองตาม path · helper: `server/src/core/test-utils.ts` (`createTestAgent`, `loginAs`, `drainJobs`, `simulateInbound`)
```ts
// server/src/features/catalog/catalog.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEED, SEED_CHECKS } from '@nless/shared/core/fixtures';
import { model } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getPrice } from './service'; import { answerPriceQuestion } from './tools';   // tools = tool loop ภายใน (§7b)
const [bizA, bizB] = ['biz_demo_a', 'biz_demo_b'].map((a) => SEED.businesses.find((b) => b.alias === a)!.id);
afterEach(() => vi.restoreAllMocks());
describe('F08 catalog', () => {
  it('getPrice ตรง SEED_CHECKS', async () => {
    expect((await getPrice(bizA, { sku: 'A-GAME-01', quantity: 2 })).subtotalMinor).toBe(SEED_CHECKS[0].subtotalMinor);
  });
  it('owner สร้างได้ · staff ถูกปฏิเสธ · ร้านอื่น 404', async () => {
    const owner = await createTestAgent(); await loginAs(owner, 'owner.a@example.test');
    const sku = `T-${Date.now()}`;                                   // ข้อมูลใหม่ทุกครั้ง ห้ามแก้แถว SEED
    const res = await owner.post(`/api/v1/businesses/${bizA}/catalog/items`).set('X-Requested-With', 'nless').send({ sku, name: 'ทดสอบ', priceMinor: 12300 });
    expect([res.status, res.body.data.priceMinor]).toEqual([201, 12300]);
    const staff = await createTestAgent(); await loginAs(staff, 'staff.a@example.test');
    const denied = await staff.post(`/api/v1/businesses/${bizA}/catalog/items`).set('X-Requested-With', 'nless').send({ sku: `${sku}s`, name: 'x', priceMinor: 1 });
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
    expect((await owner.get(`/api/v1/businesses/${bizB}/catalog/items`)).status).toBe(404);
  });
  it('tool loop ด้วย fake tool call (ข้อเสนอ: spy แล้วใส่ fake ทีละรอบ)', async () => {
    const real = model.chat.bind(model);
    const spy = vi.spyOn(model, 'chat')
      .mockImplementationOnce((i) => real({ ...i, fake: { toolCalls: [{ id: 'call_1', name: 'get_price', arguments: { sku: 'A-GAME-01', quantity: 2 } }] } }))
      .mockImplementationOnce((i) => real({ ...i, fake: { text: 'รวม 2,980 บาทค่ะ' } }));
    expect((await answerPriceQuestion(bizA, 'A-GAME-01 2 กล่องเท่าไหร่')).text).toContain('2,980');
    const round2 = spy.mock.calls[1]![0];
    expect(round2.providerState).toEqual({ fake: true });              // ส่ง providerState กลับครบ
    expect(round2.messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'call_1' });
  });
});
```
job: enqueue แล้ว `await drainJobs()` ก่อน assert · เวลา: ข้อเสนอ `vi.useFakeTimers({ now: new Date(CLOCK_FIXTURE), toFake: ['Date'] })` (ปลอมแค่ Date ไม่งั้น pg/supertest ค้าง)
อย่าทำ: เรียก OpenAI จริงใน test (env บังคับ fake อย่า override) · assert จำนวนแถวรวมของตารางที่ test อื่นก็เขียน · ลืม `X-Requested-With: nless` กับ POST/PUT/PATCH/DELETE · คาดว่า `r.json` มีค่าใน fake mode โดยไม่ใส่ `fake.json`

## 6. Background job

ประกาศใน `routes.ts`: `jobs: { [INDEX_JOB]: indexJob }` และ `schedules: [{ name, everySeconds, handler }]` · type ซ้ำข้ามฟีเจอร์ = boot fail · **ข้อเสนอ:** ตั้งชื่อ `<domain>.<action>` แบบ `ai.reply`, `core.deliver`
```ts
// server/src/features/knowledge-search/jobs.ts
export const INDEX_JOB = 'knowledge.index';
type IndexPayload = { itemId: string; revision: number };      // type ไม่ใช่ interface (ต้องเข้ากับ Record<string, unknown>)
export const enqueueIndex = (businessId: string, p: IndexPayload) => jobs.enqueue(INDEX_JOB, p, {
  businessId, dedupKey: `${INDEX_JOB}:${p.itemId}:r${p.revision}`,   // dedupKey unique ทั้งระบบ → ขึ้นต้นด้วย type
  lockKey: `knowledge-item:${p.itemId}` });                          // งานของ item เดียวกันไม่รันพร้อมกัน
export const indexJob: JobHandler<IndexPayload> = async (job) => {
  const { itemId, revision } = job.payload;
  if (await db.maybeOne(`SELECT 1 FROM knowledge_index_states WHERE item_id = $1 AND revision = $2 AND state = 'ready'`, [itemId, revision])) return; // idempotent
  const texts = await loadChunks(itemId, revision);
  if (texts.length === 0) throw new AppError('VALIDATION_ERROR', 'empty item', { retryable: false });   // → dead ทันที
  const e = await model.embed({ usage: { featureId: 'F07', purpose: 'embed-document', businessId: job.businessId }, texts, purpose: 'document' });
  await db.tx((tx) => saveChunks(tx, itemId, revision, texts, e.vectors, e.model, e.dim));              // model อยู่นอก tx
  await job.progress(1, 1);
  publish(job.businessId!, { type: 'knowledge.status', knowledgeItemId: itemId, indexState: 'ready' });
};
```
throw ธรรมดา → retry (5s × attempt²) จนครบ `maxAttempts` แล้ว `dead` (เห็นใน /ops) · รอของภายนอก → `return { retryAt }` (ไม่นับ attempt) · ส่ง `job.signal` ต่อให้ `model.chat({ signal })`
อย่าทำ: บอกผู้ใช้ว่า "เสร็จ" ตอน enqueue (pending ≠ done) · เรียก `model.*`/provider ใน `db.tx` · ใส่ข้อความลูกค้า/secret ใน payload (ส่ง id แล้วอ่านใหม่) · ลืม `lockKey: conversation:<id>` กับงานที่แตะลำดับข้อความของแชต

## 7. model.* (OpenAI ผ่าน core เท่านั้น)

ทุก call มี `usage: UsageAttribution` (`featureId`, `purpose`, `businessId`, `conversationId?`) · purpose ตาม contracts: `reply` `classify` `extract` `rerank` `summarize` `translate` `slip-read` `embed-document` `embed-query` `moderate` `transcribe` · เลือก alias `chat` / `fast` / `strong` ไม่ใส่ model id · ไม่มี `temperature` · ปกติไม่ตั้ง `reasoningEffort` (core: `fast` = none ส่งเป็น low บน `gpt-6.2-*`; `strong` ตอน retry ใช้ `'medium'`) · `maxOutputTokens` รวม reasoning: ต่ำไป = `finishReason 'length'` + text ว่าง · core ส่ง `store:false` ทุก call

**(a) classifier / extraction แบบ strict JSON**
```ts
const Intent = z.object({ label: z.enum(['PRICE', 'PRODUCT', 'ORDER', 'INFO', 'ESCALATION', 'OTHER']), confidence: z.number() });
const r = await model.chat({
  usage: { featureId: 'F10', purpose: 'classify', businessId, conversationId }, model: 'fast',
  messages: [{ role: 'developer', content: CLASSIFIER_RULES }, { role: 'user', content: maskCardNumbers(text) }],
  responseFormat: { name: 'intent', schema: z.toJSONSchema(Intent) }, maxOutputTokens: 500,
});
const parsed = Intent.safeParse(r.json);                      // json = ข้อมูล ไม่ใช่สิทธิ์ · fake mode = undefined
const label = parsed.success ? parsed.data.label : 'OTHER';   // ต้องมีทางสำรองเสมอ
```
schema strict: ทุก field อยู่ใน `required`, `additionalProperties:false`, field ไม่บังคับใช้ `.nullable()` ไม่ใช่ `.optional()`/`.default()` · ได้ 400 `invalid_json_schema` → เขียน schema มือแบบ openai-api.md §3.3
**(b) tool loop ≤ 4 call ต่อ turn + providerState**
```ts
const GetPriceArgs = z.object({ sku: z.string(), quantity: z.number().int().min(1) });
const tools: ModelTool[] = [{ name: 'get_price', description: 'ราคาจริงจาก catalog ของร้าน', parameters: z.toJSONSchema(GetPriceArgs) }];
const usage: UsageAttribution = { featureId: 'F10', purpose: 'reply', businessId, conversationId };
const messages: ModelMessage[] = [{ role: 'developer', content: SHOP_RULES }, ...history, { role: 'user', content: maskCardNumbers(q) }];
let r = await model.chat({ usage, model: 'chat', messages, tools }), used = 0;
while (r.finishReason === 'tool_calls') {
  messages.push({ role: 'assistant', content: r.text, toolCalls: r.toolCalls });
  for (const call of r.toolCalls) {                           // ทุก call ต้องมี tool message ตอบ แม้เกินงบ
    const out = ++used <= 4 ? await runTool(businessId, call) : { error: 'TOOL_BUDGET' };
    messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(out) });
  }
  r = await model.chat({ usage, model: 'chat', messages, tools, providerState: r.providerState, toolChoice: used >= 4 ? 'none' : 'auto' });
}
async function runTool(businessId: string, call: ModelToolCall) {
  const a = GetPriceArgs.safeParse(call.arguments);           // arguments มาจาก model: validate ก่อน
  if (call.name !== 'get_price' || !a.success) return { error: 'VALIDATION_ERROR' };
  const p = await getPrice(businessId, a.data);                // businessId จาก server เท่านั้น
  return { sku: p.sku, soldOut: p.soldOut, subtotalMinor: p.subtotalMinor, subtotalText: `${(p.subtotalMinor / 100).toLocaleString('th-TH')} บาท` };
}
```
**(c) รูปสลิป (F14) → strict schema → ตรวจในโค้ด**
```ts
const Slip = z.object({ amountSatang: z.number().int().nullable(), transferredAt: z.string().nullable(), bankRef: z.string().nullable(),
  receiverName: z.string().nullable(), receiverAccountMasked: z.string().nullable(), confidence: z.number() });
const r = await model.chat({
  usage: { featureId: 'F14', purpose: 'slip-read', businessId }, model: 'chat',
  messages: [{ role: 'user', content: [
    { type: 'text', text: 'อ่านสลิปโอนเงินนี้ตาม schema ช่องที่อ่านไม่ได้ให้เป็น null เลขบัญชีให้คัดตามที่เห็น' },
    { type: 'image', uploadRef: fileId, detail: 'high' },      // fileId จาก storage.save ของร้านนี้ ไม่ใช่ URL จากลูกค้า
  ] }],
  responseFormat: { name: 'slip', schema: z.toJSONSchema(Slip) },
});
const s = Slip.safeParse(r.json);
const last4 = s.success ? (s.data.receiverAccountMasked ?? '').replace(/\D/g, '').slice(-4) : '';   // โค้ดตัดเอง
const ok = s.success && s.data.amountSatang === order.totalMinor && last4 === shopLast4 && s.data.confidence >= 0.8; // + bankRef unique index
// ok → paid (สูงสุด S: ไม่ได้ยืนยันกับธนาคาร) · ไม่ ok → pending_verification ให้ staff ยืนยัน
```
**(d) embed + pgvector (cosine `<=>`)**
```ts
const e = await model.embed({ usage: { featureId: 'F07', purpose: 'embed-query', businessId }, texts: [query], purpose: 'query' });
const { rows } = await db.query<{ itemId: string; score: number }>(
  `SELECT item_id AS "itemId", 1 - (embedding <=> $2::vector) AS score FROM knowledge_chunks
    WHERE business_id = $1 AND searchable AND embed_model = $3 ORDER BY embedding <=> $2::vector LIMIT $4`,
  [businessId, db.toVector(e.vectors[0]!), e.model, topK]);
```
**(e) moderate / transcribe + PROVIDER_BUDGET_EXHAUSTED**
```ts
const m = await model.moderate({ usage: { featureId: 'F05', purpose: 'moderate', businessId }, text: `${title}\n${body}` });
if (m.flagged) await markForReview(itemId, m.categories);     // สัญญาณเตือนให้ staff ไม่ใช่ตัวบล็อกเดียว
const t = await model.transcribe({ usage: { featureId: 'F17', purpose: 'transcribe', businessId }, audio: { uploadRef: fileId, filename: 'voice.m4a' } });
try { r = await model.chat(input); }
catch (err) {
  if (err instanceof AppError && err.code === 'PROVIDER_BUDGET_EXHAUSTED') return fallbackToStaff();  // ไม่ retry ไม่มีข้อความจาก model
  throw err;                    // job: retryable true → retry, false → dead · route: core ตอบ ApiFailure เอง
}
// ข้อเสนอ: ปิดเลขบัตรก่อนส่ง model/trace (ไม่มี helper กลางใน contracts.ts; F10 port payment-card.mjs เป็นตัวหลัก)
const maskCardNumbers = (s: string) => s.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => `[บัตร •••• ${m.replace(/\D/g, '').slice(-4)}]`);
```
เจอ budget หมดครั้งแรก → โพสต์ `BLOCKED @<lead login> PROVIDER_BUDGET_EXHAUSTED ที่ <ID>` · `finishReason` `'content_filter'` / `'length'` = ไม่มีคำตอบที่ใช้ได้ ให้ทางสำรอง
อย่าทำ: import `openai` หรือ `fetch` api.openai.com · ใส่ model id ในโค้ด · เอาราคา/สต็อก/ยอดจากข้อความ model · ส่ง URL ที่ลูกค้าให้มาเป็นรูป · ส่ง history ไม่จำกัด (ยาวเกิน = 400) · ใช้ `instructions` แทน developer message แรก

## 8. ส่งข้อความหาลูกค้า + บันทึกข้อความเข้า

`saveMessage()` (F09) = ทางเดียวที่เขียนตาราง `messages` · `sendToCustomer()` (core) = ทางเดียวที่ส่งออกทุกช่องทาง: persist ก่อนส่ง คืน `delivery.state 'pending'` แล้ว realtime `message.updated` บอกผลจริง
```ts
// inbound จาก webhook (C2) / Demo Chat (A1): ไม่เรียก AI เอง saveMessage enqueue 'ai.reply' ให้
const r = await saveMessage({ businessId, direction: 'inbound', author: 'customer', parts: [{ type: 'text', text }],
  customer: { channel: 'line', externalId: lineUserId, displayName }, providerMeta: { replyToken, replyTokenExpiresAt },
  externalId: lineMessageId });                               // webhook ซ้ำ → created:false ไม่มีแถวใหม่
if (!r.created) return;
// staff ตอบจากหน้าเว็บ (route permission 'chat.reply'): core บันทึกให้แล้วส่ง
const parts: MessagePart[] = [{ type: 'text', text: 'สวัสดีค่ะ' },
  { type: 'action_buttons', buttons: [{ id: 'pay', label: 'ชำระเงิน', action: { kind: 'link', url: paymentPageUrl } }] }];  // ≤4 ปุ่ม, url จาก server
await sendToCustomer(conversationId, parts, { author: 'staff', authorUserId: ctx.user!.id, clientRequestId, businessId: ctx.business!.id });
```

| ใคร | เรียกอะไร |
|---|---|
| C2 webhook LINE / Messenger / IG | `saveMessage` inbound + `externalId` + `providerMeta` · ตอบ 200 เร็ว งานหนักเข้า job |
| A1 Demo Chat | `saveMessage` channel `'web'` (origin default `'demo'`) |
| B2 `ai.reply` | `saveMessage` outbound `author:'ai'` → `sendToCustomer(id, parts, { messageId })` ไม่ insert ซ้ำ · F30 transcript `triggerAi:false` |
| A1 staff/บรอดแคสต์, A2 ออเดอร์/ชำระเงิน, A3 นัด, C2 คอมเมนต์ | `sendToCustomer` + `author` / `origin` (`'broadcast'`, `'comment'`, `'system'`) · บรอดแคสต์เช็ก consent ตอนส่ง |

อย่าทำ: เรียก API ของ LINE/Meta จากฟีเจอร์ที่ไม่ใช่ sender ของ C2 · `INSERT INTO messages` เอง · ส่ง HTML หรือ URL ที่ลูกค้า/model ให้มา · แสดง "ส่งแล้ว" ก่อนได้ state `sent` · ถือข้อความ model ว่า "ยืนยันแล้ว" เป็น consent (ต้องเป็นปุ่ม `confirm_proposal`)

## 9. หน้าเว็บ

```tsx
// web/src/features/catalog/pages.tsx (คง path/group/icon/permission/order ตาม scaffold ของ C1)
import { defineFeaturePages } from '../../core';
export default defineFeaturePages({ featureId: 'F08', slug: 'catalog',
  routes: [{ path: '/catalog', load: () => import('./CatalogPage'), permission: 'product.read', titleKey: 'catalog:page.title' }],
  menu: [{ path: '/catalog', labelKey: 'catalog:menu.title', group: 'knowledge', icon: 'Inventory2Outlined', order: 30, permission: 'product.read', searchTerms: ['สินค้า', 'product'] }],
  // slots: [{ slot: 'chatSidePanels', id: 'catalog.chat-panel', order: 30, load: () => import('./ChatPanel') }],  // host ส่ง { conversationId }
});
```
```tsx
// web/src/features/catalog/CatalogPage.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TextField } from '@mui/material';
import type { Page } from '@nless/shared/core/types';
import type { CatalogItem } from '@nless/shared/features/catalog/types';
import { ConfirmDialog, DataTable, EmptyState, formatMoney, FormDialog, PageHeader, SectionCard, StatusChip,
  useApiMutation, useApiQuery, useCan, useRealtime, useToast } from '../../core';
export default function CatalogPage() {
  const { t } = useTranslation('catalog'); const toast = useToast(); const canWrite = useCan('product.write');
  const list = useApiQuery<Page<CatalogItem>>('/catalog/items');        // core ใส่ /businesses/<ร้านปัจจุบัน> ให้ (ห้าม api.biz ซ้ำ)
  useRealtime('custom', (e) => { if (e.featureId === 'F08') list.reload(); });   // server: publish(businessId, { type: 'custom', featureId: 'F08', name: 'catalog.changed', data: {} })
  const create = useApiMutation<{ sku: string; name: string; priceMinor: number }, CatalogItem>('POST', '/catalog/items');
  const remove = useApiMutation<string, void>('DELETE', (id) => `/catalog/items/${id}`);
  const [form, setForm] = useState<{ sku: string; name: string; price: string } | null>(null);
  const [target, setTarget] = useState<CatalogItem | null>(null); const [formError, setFormError] = useState<string | null>(null);
  // useApiQuery ไม่ toast: หน้าแสดง error เอง
  if (list.error) return <EmptyState title={t(`common:errors.${list.error.error.code}`)} action={<Button onClick={list.reload}>{t('common:actions.retry')}</Button>} />;
  return (
    <>
      <PageHeader title={t('page.title')} />   {/* props ของ PageHeader ตาม C1 setup (contracts.ts ไม่กำหนด) */}
      <SectionCard title={t('list.title')} actions={canWrite && <Button variant="contained" onClick={() => setForm({ sku: '', name: '', price: '' })}>{t('actions.create')}</Button>}>
        <DataTable rows={list.data?.items ?? []} rowKey={(r) => r.id} loading={list.loading}
          empty={<EmptyState title={t('empty.title')} description={t('empty.description')} />}
          columns={[
            { key: 'sku', header: t('fields.sku'), width: 140 },
            { key: 'name', header: t('fields.name') },
            { key: 'price', header: t('fields.price'), align: 'right', render: (r) => formatMoney(r.priceMinor) },   // ฿1,490
            { key: 'active', header: t('fields.status'), render: (r) => <StatusChip status={r.active ? 'active' : 'inactive'} /> },  // generic map: ใช้งาน / ปิดใช้งาน
            { key: 'actions', header: '', align: 'right', render: (r) => canWrite && <Button color="error" onClick={() => setTarget(r)}>{t('common:actions.delete')}</Button> },
          ]} />
      </SectionCard>
      <FormDialog open={!!form} title={t('create.title')} submitting={create.running} error={formError} onClose={() => setForm(null)}
        onSubmit={async () => {
          const priceMinor = bahtToMinor(form!.price);
          if (priceMinor === null) return setFormError(t('create.badPrice'));   // error = ข้อความระดับฟอร์ม · error จาก API core toast ให้แล้ว
          await create.run({ sku: form!.sku, name: form!.name, priceMinor });   // reject → dialog ค้างไว้เอง
          toast.success(t('common:toast.saved')); setForm(null); list.reload();   // FormDialog ไม่ปิดเอง
        }}>
        <TextField autoFocus label={t('fields.sku')} value={form?.sku ?? ''} onChange={(e) => setForm({ ...form!, sku: e.target.value })} />
        <TextField label={t('fields.name')} value={form?.name ?? ''} onChange={(e) => setForm({ ...form!, name: e.target.value })} />
        <TextField label={t('fields.priceBaht')} inputMode="decimal" value={form?.price ?? ''} onChange={(e) => setForm({ ...form!, price: e.target.value })} />
      </FormDialog>
      <ConfirmDialog open={!!target} danger title={t('delete.title')} message={t('delete.message', { name: target?.name })} onClose={() => setTarget(null)}
        onConfirm={async () => { await remove.run(target!.id); toast.success(t('delete.done')); list.reload(); }} />   {/* สำเร็จแล้ว dialog เรียก onClose เอง */}
    </>
  );
}
// ข้อเสนอ: "1,490.50" → 149050 แบบ string ไม่ผ่าน float · ผิดรูปแบบ → null
const bahtToMinor = (s: string) => { const m = s.replace(/[,\s฿]/g, '').match(/^(\d+)(?:\.(\d{1,2}))?$/); return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null; };
```
วันที่: `formatDateTime(iso)` / `formatDateTime(iso, { dateOnly: true })` · ซ่อนปุ่มด้วย `useCan(key)` หรือ `RequirePermission` (props ของ `PageHeader` / `RequirePermission` ตาม C1 setup) · `useApiQuery(null)` = ยังไม่ยิง · filter: ใส่ใน path หรือ `{ deps: [status] }` · route ที่ไม่มี `:businessId` (เช่น `/me`) → `api.get` ตรง · ไม่อยากให้ toast error อัตโนมัติ: `useApiMutation(method, path, { toastOnError: false })` · FormDialog เต็มจอบนมือถือ ConfirmDialog ไม่เต็มจอ
อย่าทำ: `fetch` เอง · mount `ToastProvider` (core mount ครั้งเดียวแล้ว) · toast error ซ้ำหลัง `run()` reject (core toast แล้ว) · คิดยอดรวม/ค่าส่งใน browser แล้วให้ server เชื่อ (staff แก้ราคา catalog ส่ง `priceMinor` ได้) · ซ่อนปุ่มอย่างเดียวโดย API ไม่มี `permission` · หน้าใหม่นอก `webPaths` ของฟีเจอร์ตัวเอง

## 10. i18n

`web/src/features/<slug>/i18n/th.json` + `en.json` · namespace = slug (`useTranslation('catalog')`, ข้าม namespace เขียน `common:actions.save`) · `menu.title`, `page.title` มีตั้งแต่ scaffold ห้ามลบ · ข้อความกลางอยู่ใน `common` ของ core แล้ว: `actions.{save,cancel,confirm,delete,close,retry}`, `table.empty`, `toast.saved`, `errors.generic` + `errors.<ErrorCode>`, `status.<kind>.<status>` · **ข้อเสนอ** กลุ่ม key ของฟีเจอร์: `list` `actions` `fields` `empty` `create` `delete` (+ `errors.<code>` เฉพาะที่ต้องพูดต่างจาก common)
```json
{
  "menu": { "title": "สินค้าและบริการ" },
  "page": { "title": "สินค้าและบริการ" },
  "list": { "title": "รายการทั้งหมด" },
  "actions": { "create": "เพิ่มสินค้า" },
  "fields": { "sku": "รหัสสินค้า", "name": "ชื่อสินค้า", "price": "ราคา", "priceBaht": "ราคา (บาท)", "status": "สถานะ" },
  "empty": { "title": "ยังไม่มีสินค้า", "description": "เพิ่มสินค้าชิ้นแรกเพื่อให้ AI ตอบราคาได้" },
  "create": { "title": "เพิ่มสินค้า", "badPrice": "กรอกราคาเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง" },
  "delete": { "title": "ลบสินค้านี้?", "message": "ลบ {{name}} แล้วลูกค้าจะไม่เห็นสินค้านี้อีก", "done": "ลบแล้ว" }
}
```
เขียน th ก่อน แล้ว en ให้มี key ชุดเดียวกันทุกตัว · ตัวแปรใช้ `{{name}}` ของ i18next
อย่าทำ: ข้อความไทย/อังกฤษใน TSX (รวม `aria-label`, placeholder, toast) · ต่อ string แปลเอง (`t('a') + name`) · เพิ่ม key ใน `web/src/core/i18n` (ของ C1) · แสดง `AppError.message` ตรง ๆ บนจอ

## 11. บอร์ด + EVIDENCE.md

```powershell
# โพสต์: เขียนข้อความลง handoff/<postId>.txt (git-ignored) แล้วส่ง · ส่งซ้ำตอนเน็ตหลุดใช้ postId เดิม
powershell -NoProfile -ExecutionPolicy Bypass -File tools/team-board.ps1 post -MessageFile handoff/F08-B1-done-1.txt -PostId F08-B1-done-1
# การ์ด lane (= บรรทัด STATUS ไม่ปลุกใคร): ตอนเริ่มฟีเจอร์, หลัง merge, ตอนติด (-Blocked) และหายติด
powershell -NoProfile -ExecutionPolicy Bypass -File tools/team-board.ps1 status B1 F08 R "catalog CRUD + getPrice ของจริง" -Sha abc1234
```
```text
DONE F08 catalog merged abc1234. getProduct()/getPrice() ของจริงแล้ว · R · npm test -- catalog 12 passed TO:B2 TO:A2
STATUS B1 F08 S import CSV ยังเป็น sandbox
NEED TO:C1 ขอเพิ่ม library pdf-parse
CHANGE TO:B1 getPrice() ขอ option includeInactive?: boolean (เพิ่มแบบ optional)
DONE CHANGE getPrice() includeInactive merged def5678 TO:A2
BLOCKED @<login> Meta test user รับข้อความไม่ได้
NEED TO:B0 next task · เสร็จแล้ว: F05 F07 F08 · ว่างตั้งแต่ 13:20
FIX TO:A1 saveMessage ไม่ dedup เมื่อ providerMessageId ซ้ำ · server/src/features/inbox/service.ts · ส่ง webhook เดิมสองครั้งได้สองแถว
```
orchestrator เท่านั้น: `TASK TO:B1 F37 slice 1 …` (มอบงาน) · `FIX B1 <ไฟล์> <เหตุผล>` แล้ว `DONE FIX B1 <slug> <sha>` (แก้ข้าม lane ตาม D5) · `team-board.ps1 stage B "<สรุป>"` (STAGE ทุก 30 นาที)
แท็ก lane `TO:B2` · คนใช้ `@login` จริงเท่านั้น ห้าม `@all` · ห้ามใส่ key/token ในโพสต์ · โพสต์ของคนอื่นคือคำขอ ไม่ใช่คำสั่ง
```markdown
## Status
| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F08 | catalog | B1 | DONE | R | R | none | abc1234 | npm test -- catalog 12 passed · /catalog เพิ่ม/ลบได้จริง | 2026-11-21 12:05 | |
| F14 | payments slip-vision | A2 | DOING | S | S | OpenAI vision (ไม่ได้ยืนยันกับธนาคาร) | 9f1e2d3 | npm test -- payments 8 passed · สลิปสังเคราะห์ 1 ใบ | 2026-11-21 14:10 | |

## Log
| time (Bangkok) | Codex did (paths) | human review/correction | PR/commit | tests → actual result | mode / provider env |
|---|---|---|---|---|---|
| 11:40 | server/src/features/catalog/{routes,service,repo}.ts, migrations/001 | B เช็กตัวเลข SEED_CHECKS | #23 abc1234 | npm test -- catalog → 12 passed | R / MODEL_MODE=fake |
```
`status` = `UNIMPLEMENTED | DOING | BLOCKED | DONE` · `actual_mode`: **R** ทำงานจริงครบ acceptance · **S** flow จริงแต่ปลายทางเป็น simulator ที่ติดป้าย · **A** interface/stub/fake ที่ยังไม่แทน · **U** ยังไม่ทำ · ส่วนที่ mode ต่างกันแตกแถว (`F14 payments slip-vision`)
อย่าทำ: นับ AI ที่รันแค่ `MODEL_MODE=fake` เป็น R · นับหน้าที่กดแล้วไม่มีผลว่าเสร็จ · แต่ง SHA/เวลา/ผล test/ต้นทุน · แก้ `docs/FEATURE_STATUS.csv` (C1 รวมตอน 15:30)

## 12. ภาษาไทยใน UI + อภิธานศัพท์

- **UI ของ staff:** สุภาพ สั้น เป็นกลาง ไม่มี ค่ะ/ครับ ในปุ่ม เมนู label toast · ปุ่มขึ้นต้นด้วยกริยา ("บันทึก", "เพิ่มสินค้า", "ส่งต่อพนักงาน") · toast บอกผล ("บันทึกแล้ว") · error บอกว่าเกิดอะไรและทำอะไรต่อ ("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง") · ConfirmDialog: title เป็นคำถาม ("ลบสินค้านี้?") · message บอกผลที่ตามมา · ปุ่มยืนยันใช้กริยาเดียวกับ title (ไม่ใช่ "ตกลง")
- **ข้อความบอทถึงลูกค้า:** สุภาพ สั้น ลงท้าย "ค่ะ" (ตรง fake ของ F10 และ prompt ของ F30) · เทมเพลตที่ร้านเขียนเองเป็นของร้าน ไม่ต้องแก้
- **เงิน:** ตาราง/การ์ด `formatMoney` → `฿1,490` · คำพูดของบอท (โดยเฉพาะเสียง F30) "1,490 บาท" ห้ามพูดเป็นสตางค์ · โค้ดและ DB เป็นสตางค์ integer เสมอ
- **วันเวลา:** เก็บ ISO UTC · แสดงด้วย `formatDateTime` เขต Asia/Bangkok · **เลือก: UI ภาษาไทยแสดงปี พ.ศ.** ตามตัวอย่าง `localDisplay` "22 พ.ย. 2569 10:00" ใน contracts.ts, UI อังกฤษแสดง ค.ศ. · เวลา 24 ชั่วโมง · ตัวเลขมีจุลภาคหลักพัน (ข้อเสนอ: `new Intl.NumberFormat('th-TH').format(n)` ได้เลขอารบิก)
- **ศัพท์อังกฤษ:** ไม่ใช้ใน UI ไทย ยกเว้นชื่อแบรนด์/ช่องทาง (LINE, Messenger, Instagram, Google Calendar), AI และป้ายสถานะ R/S/A/U ที่ contracts.ts กำหนด · สะกด "แชต" (ข้อเสนอ: เมนู scaffold ของ C1 เขียน "แชต" ให้ A1 แก้ใน th.json ของ inbox)

| ไทย (UI) | key / code | หมายเหตุ |
|---|---|---|
| ร้าน / บัญชี | `business`, `businessId` / `account` | ไม่ใช้ "ธุรกิจ" · บัญชีหนึ่งถือได้หลายร้าน |
| เจ้าของร้าน / พนักงาน / สมาชิก / สิทธิ์ | `owner` / `staff` (`MembershipRole`) / members / `PermissionKey` | หน้า `/members` |
| ลูกค้า / แชต / กล่องข้อความ | `customer` / `conversation` / inbox `/chat` | ข้อความ = `message` |
| ช่องทาง | `Channel` `line` `facebook` `instagram` `web` | แสดง LINE, Messenger, Instagram, เว็บ (Demo Chat) |
| AI ตอบ / ปิด AI | `aiEnabled` (ร้าน), `aiForceOn` (แชต) · chip `ai` | |
| รับช่วงแชต / พนักงานตอบ | takeover, `handler:'human'`, `chat.takeover` | คืนให้ AI = `assignConversation(id, null)` |
| ส่งต่อพนักงาน | handoff, `state:'handoff'`, notify `chat.handoff` | |
| คลังความรู้ / โฟลเดอร์ | `knowledge` / `knowledgeFolders` | |
| ร่าง / ใช้งาน / ปิดใช้งาน | `draft` / `active` / `inactive` | ป้าย StatusChip generic |
| สินค้า / บริการ | `kind:'product'` / `'service'` | เมนู "สินค้าและบริการ" |
| ตัวเลือกสินค้า / รหัสสินค้า / รหัสสินค้าไลฟ์ | `variant` / `sku` / live product code (F22) | |
| ราคา / คงเหลือ / สินค้าหมด | `priceMinor` (สตางค์) / `stock`, `available` / `soldOut` | ราคาแสดง ฿ หรือ บาท |
| ออเดอร์ | `order` | สถานะ: รอชำระเงิน ชำระแล้ว กำลังเตรียม จัดส่งแล้ว ส่งถึงแล้ว ยกเลิก |
| สรุปรายการ (รอยืนยัน) | proposal, `order_review` | ปุ่ม ยืนยัน / ยกเลิก = `confirm_proposal` |
| ยอดสินค้า / ค่าส่ง / ยอดรวม | `subtotalMinor` / `deliveryFeeMinor` / `totalMinor` | |
| ชำระเงิน / สลิป / รอตรวจสลิป | `payment`, `paymentState` / slip / `pending_verification` | ตรวจสลิปด้วย vision = สูงสุด S |
| นัดหมาย / ช่วงเวลาว่าง / ปฏิทิน | `appointment`, booking / `slot` / calendar | ปฏิทิน = Google Calendar (F16) |
| แท็ก / บรอดแคสต์ / ผู้รับ | `tag` / `broadcast` / audience | |
| รับข่าวสาร / ไม่รับข่าวสาร | `marketingConsent` `granted` / `revoked` | ไม่ใช่ consent ทางกฎหมาย |
| ข้อความสำเร็จรูป | message template (F12) | ชื่อเมนูตาม C1 (= เทมเพลตข้อความ) |
| คอมเมนต์ / ตอบคอมเมนต์ | comment (F21) | |
| แจ้งเตือน | `notification` | |
| ส่งแล้ว / รอดำเนินการ / ล้มเหลว / ไม่ทราบผล | `DeliveryState` `sent` / `pending` / `failed` / `unknown` | ป้าย StatusChip generic |
| งานเบื้องหลัง | `job` | เมนู `/ops` |
| จริง (R) / Sandbox (S) / Adapter (A) / ยังไม่ทำ (U) | สถานะ R/S/A/U | ป้าย StatusChip `kind="feature"` |

## 13. Playwright smoke กับ production (หนึ่งไฟล์ต่อฟีเจอร์)

ฟีเจอร์เป็น R ได้เมื่อ smoke ของตัวเองผ่านบน production (D6) ไฟล์อยู่ในโฟลเดอร์ของฟีเจอร์ จึงผ่าน ownership check: `web/src/features/<slug>/e2e/<slug>.smoke.spec.ts` · fixture กลางเป็นของ C1 ([spec F01](specs/F01-core.md))

```ts
// web/src/features/catalog/e2e/catalog.smoke.spec.ts
import { test, expect, e2eMarker } from '../../../../../tests/e2e/fixtures';

test('catalog: owner A เพิ่มสินค้าแล้วเห็นในรายการ และร้าน B มองไม่เห็น', async ({ ownerPage, api }) => {
  const sku = `E2E-${e2eMarker()}`;                       // ข้อมูลทดสอบมี marker เสมอ ลบทิ้งท้าย test
  await ownerPage.goto('/catalog');
  await ownerPage.getByRole('button', { name: /เพิ่มสินค้า/ }).click();
  await ownerPage.getByLabel(/SKU/).fill(sku);
  await ownerPage.getByLabel(/ชื่อสินค้า/).fill('สินค้าทดสอบ e2e');
  await ownerPage.getByLabel(/ราคา/).fill('120');
  await ownerPage.getByRole('button', { name: /บันทึก/ }).click();
  await expect(ownerPage.getByRole('cell', { name: sku })).toBeVisible();
  // ลบข้อมูลทดสอบด้วย API ของฟีเจอร์เอง (`api` ใช้ session เดียวกับ ownerPage) แล้วตรวจว่าหายจริง
  // const res = await api.delete(`<path ตาม §3 ของ spec>`); expect(res.ok()).toBeTruthy();
});
```

ตัวอย่างนี้แสดงรูปแบบเท่านั้น: label, `data-testid` และ path ของ API ให้ใช้ตาม §3 และ §7 ของ spec ของฟีเจอร์ตัวเอง

```powershell
npm run e2e -- catalog                                        # กับ dev ของ lane (คนรัน npm run dev ไว้ก่อน)
$env:E2E_BASE_URL = 'https://<production-url>'; npm run e2e -- catalog   # กับ production หลัง deploy (3–6 นาทีหลัง merge)
```

กติกา: รันซ้ำบน production ได้ไม่จำกัดครั้ง (สร้างข้อมูลด้วย `e2eMarker()` แล้วลบ หรือทิ้งไว้ได้ถ้าไม่รบกวน demo) · ใช้ร้านสังเคราะห์ A เท่านั้น แตะร้าน B เฉพาะเพื่อพิสูจน์ว่าแยกกัน · เลือก element ด้วย role/label ภาษาไทยหรือ `data-testid` ที่ spec กำหนด · ห้ามพึ่งข้อมูลที่ demo reset จะล้าง · smoke ที่เรียก AI ให้ยืนยันผลที่ตรวจได้แน่นอน (เช่นมี "1,490") ไม่ใช่ทั้งประโยค
อย่าทำ: นับ smoke ที่ผ่านบน localhost ว่าเป็น R · ปิด test ที่ล้มเพื่อให้ merge ได้ · ใส่รหัสผ่านหรือ token ในไฟล์ test (อ่านจาก env: `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_DEV_LOGIN_TOKEN`)

## 14. Rate limit, ความลับใน DB และข้อมูล demo

```ts
import { assertRateLimit, encryptSecret, decryptSecret } from '../../core';

// route สาธารณะทุกตัว (Demo Chat, webhook, login, feed, /mcp): กันก่อนทำงานจริง
assertRateLimit({ key: `demo-chat:visitor:${visitorId}`, limit: 20, windowSeconds: 60 });   // เกิน → AppError('RATE_LIMITED') 429

// token ของ provider, refresh token ของ OAuth, ค่าตั้งการชำระเงิน: เข้ารหัสก่อนเก็บ ถอดเฉพาะตอนใช้ ห้าม log
await db.query('UPDATE line_channels SET access_token_enc = $1 WHERE id = $2', [encryptSecret(accessToken), id]);
const token = decryptSecret(row.access_token_enc);
```

```ts
// server/src/features/<slug>/seed.ts — เพิ่มได้ถ้าฟีเจอร์เก็บข้อมูลธุรกรรม (ออเดอร์, แชต, การจอง)
export async function runDemo(ctx: SeedContext) { /* ข้อมูลที่กรรมการเห็น: ไทย สมจริง ไม่มีคนจริง (npm run db:seed -- --demo) */ }
export async function resetDemo(ctx: SeedContext) { /* ลบข้อมูลธุรกรรมของร้าน demo ที่เกิดระหว่าง demo (npm run demo:reset) */ }
```

อย่าทำ: เก็บ token เป็น plain text · ใช้ `rateLimit` เป็นโควตาของลูกค้า (ไม่มีโควตา: นี่คือการกันงบและกันยิงถล่มเท่านั้น) · ลบข้อมูล seed หลัก (SKU ที่ gate ใช้) ใน `resetDemo`
