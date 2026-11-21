# F39 chatgpt-catalog — แค็ตตาล็อกพร้อมใช้ใน ChatGPT (ACP product feed + MCP server)

| | |
|---|---|
| Lane / คน | **C1** / **C** · ลำดับ 3 ใน lane (F01 → F35 → **F39** → F36; F39 พักเมื่อถึง 15:15 ตามนาฬิกา เพื่อเริ่ม F36) |
| Tier / เป้า | **P2** · เป้า **R** (ไฟล์ feed ตามรูปแบบ ACP + MCP endpoint ที่ทำงานจริงกับ MCP client; **ไม่ใช่** การอนุมัติหรือขึ้นขายใน ChatGPT: ดู §15) |
| Timebox | 45–105 นาที (ประมาณ 12:45–14:30) · เริ่มเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` และ F35 S3 merge แล้ว |
| พึ่ง | F08 `listCatalogItems`, `getCatalogItemDetails`, `getPrice` · F09 `saveMessage` + contract ใหม่ `getDemoChatHandoff` (§4) · F13 `createOrderFromProposal` (stage `propose` เท่านั้น; ใช้ fake ของ F13 ได้จนกว่า A2 DONE) · core (`db`, `audit`, `storage`, `rateLimit`/`assertRateLimit`, `encryptSecret`/`decryptSecret`, `sendToCustomer`, `config`) · library `@modelcontextprotocol/sdk` 1.32.2 (ติดตั้งตอน F01 S1), `zod` |
| ให้ | ไฟล์ feed สาธารณะ (JSONL/CSV/TSV) ต่อร้าน · MCP server (`search_catalog`, `get_price`, `propose_order`) ต่อร้าน · หน้า `/chatgpt-catalog` · ไม่มี contract ให้ lane อื่น |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/chatgpt-catalog/` · `shared/features/chatgpt-catalog/types.ts` · `web/src/features/chatgpt-catalog/` · แก้ `server/src/core/features.ts` เล็กน้อย (hook `mountExpress` §4: เป็นของ C1) |
| Web path | `/chatgpt-catalog` (เมนูกลุ่ม `knowledge` · permission `product.read` · label "แค็ตตาล็อกสำหรับ ChatGPT") |

อ่าน: `contracts.ts` (`FeatureRoutes`, `HttpResponse`, `rateLimit`, `assertRateLimit`, `createOrderFromProposal`, `OrderReviewPart`, `saveMessage`, `sendToCustomer`) · [F08](F08-catalog.md) §4 (`CatalogItemDetail`) · [F09](F09-inbox.md) §3.3, §5.7 (Demo Chat, visitor token) · [COOKBOOK](../COOKBOOK.md) §6 · แหล่งสาธารณะที่ตรวจเมื่อ 20 พ.ย. 2569: https://developers.openai.com/commerce/specs/feed · https://developers.openai.com/commerce/guides/get-started · README ของ `@modelcontextprotocol/sdk` v1.x (ตัวอย่าง `simpleStatelessStreamableHttp.ts`)

## 1. เป้าหมายและ user stories

ทำไมมี (D8): ลูกค้าเริ่มค้นหาและถามหาสินค้าใน ChatGPT มากขึ้น ร้านเล็กในไทยไม่มีทีมวิศวกรทำ feed หรือ MCP เอง F39 ให้ร้านที่ลงสินค้าใน Endless แล้วได้ (1) ไฟล์ product feed ตามรูปแบบ Agentic Commerce Protocol (ACP) ของ OpenAI พร้อมส่งให้ผู้ให้บริการ/พอร์ทัลของ OpenAI ได้ และ (2) MCP server ให้ MCP client เช่น ChatGPT ในโหมด developer หรือ MCP Inspector ค้นสินค้า ถามราคา และ **เสนอ** ออเดอร์ได้ โดยออเดอร์จริงถูกสร้างเฉพาะเมื่อลูกค้ากดยืนยันในแชต Endless เอง (หลักการเดียวกับ F10/F13: คำพูดของโมเดลไม่ใช่ความยินยอม)

สิ่งที่ F39 **ไม่** อ้าง: ไม่ได้ขึ้นขายใน ChatGPT, ไม่ได้ผ่านการอนุมัติของ OpenAI, ไม่ทำ checkout ผ่าน ChatGPT (`is_eligible_checkout` = false เสมอ) · การส่ง feed ต้องผ่านพอร์ทัลและการยืนยันตัวตนธุรกิจของ OpenAI ซึ่งเป็นขั้นตอนของคน ไม่ใช่ของแอปเรา

ผู้ใช้: เจ้าของ/ผู้จัดการแค็ตตาล็อก (`product.read` ดู, `product.write` เปลี่ยนตั้งค่า/หมุน token) · MCP client ของลูกค้า/ตัวแทน (ผ่าน bearer token) · ผู้ดึง feed (OpenAI หรือคนที่ได้ URL)

User stories:
1. เจ้าของเปิดหน้า `/chatgpt-catalog` เห็นว่าสินค้ากี่ชิ้นเข้า feed ได้ ชิ้นไหนถูกตัดออกเพราะอะไร (ไม่มีรูป ราคา 0 เป็นบริการ) แล้วคัดลอก URL ของ feed (JSONL/CSV/TSV)
2. เจ้าของเปิดใช้ MCP คัดลอก URL + token (แสดงครั้งเดียว) ไปใส่ใน MCP Inspector หรือ connector แล้วเห็นเครื่องมือ 3 ตัวใช้งานได้จริง
3. ตัวแทนใน ChatGPT ถามหาสินค้า ("เกมกระดานไม่เกิน 1,500 บาท") ได้ผลจากแค็ตตาล็อกจริงของร้าน ราคาและสต็อกจาก DB เท่านั้น
4. ตัวแทนเสนอสั่งสินค้า → ได้สรุปรายการ/ยอด และลิงก์ยืนยัน → ลูกค้าเปิดลิงก์ เห็นการ์ดยืนยันใน Demo Chat ของร้าน กดยืนยันจึงเกิดออเดอร์ (ก่อนนั้นไม่มีออเดอร์)
5. เจ้าของหมุน token ได้ทุกเมื่อ (token เก่าใช้ไม่ได้ทันที) และปิด feed/MCP ได้
6. ผู้ดึง feed ที่ไม่มี token ไม่เห็นอะไร; ร้านอื่นไม่เห็นข้อมูลร้านเรา

นอกขอบเขต: checkout/ชำระเงินใน ChatGPT, การส่ง feed ไปยัง OpenAI อัตโนมัติ (ไม่มี API ที่ยืนยัน), OAuth ของ MCP (ใช้ bearer), เครื่องมือแก้ข้อมูลร้าน (read-only ยกเว้น propose), SSE streaming/sessions (stateless JSON เท่านั้น), บริการ (booking) ใน feed, หลายสกุลเงิน (THB เท่านั้น), หน้าสินค้าเต็มรูปแบบ (หน้าเดียวแบบเรียบง่ายสำหรับ `url`)

## 2. Data model

`server/src/features/chatgpt-catalog/migrations/001_chatgpt_catalog.sql`:

```sql
-- dependsOn: core, catalog, inbox
CREATE TABLE chatgpt_catalog_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),   -- ใช้ใน /mcp/<slug> และ URL ของ feed
  feed_enabled boolean NOT NULL DEFAULT false,
  mcp_enabled boolean NOT NULL DEFAULT false,
  feed_token_enc text,                    -- encryptSecret(token): แสดง URL ซ้ำได้
  feed_token_rotated_at timestamptz,
  mcp_token_hash text,                    -- sha256 hex ของ token (ไม่เก็บ token)
  mcp_token_prefix text,                  -- 12 ตัวแรกของ token ไว้แสดง
  mcp_token_rotated_at timestamptz,
  brand text,                             -- null = ใช้ชื่อร้าน
  seller_name text,                       -- null = ใช้ชื่อร้าน
  target_country text NOT NULL DEFAULT 'TH' CHECK (target_country ~ '^[A-Z]{2}$'),
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- บันทึกการใช้งาน (ไม่เก็บ argument ไม่เก็บ IP ดิบ ไม่เก็บข้อความ)
CREATE TABLE chatgpt_catalog_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('feed_fetch','mcp_call','image_fetch')),
  detail text,                            -- format ('jsonl'|'csv'|'tsv') หรือชื่อ tool
  ok boolean NOT NULL,
  error_code text,
  items int,                              -- จำนวนแถวที่คืน
  ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chatgpt_catalog_events_biz_time ON chatgpt_catalog_events (business_id, created_at DESC);
```

กฎ: ทุก query กรอง `business_id` · token ดิบของ MCP **ไม่ถูกเก็บที่ใดเลย** (ตอนหมุนส่งกลับครั้งเดียว) · token ของ feed เก็บเข้ารหัส (`encryptSecret`) เพราะ URL ต้องแสดงซ้ำให้เจ้าของ · `chatgpt_catalog_events` ตัดทิ้งหลัง 30 วันด้วยการลบแบบ lazy ตอน insert (ลบแถวที่เก่ากว่า 30 วันของร้านนั้นไม่เกิน 200 แถว) ไม่ต้องมี schedule · ไม่มีตารางเก็บ proposal (เป็นของ F13) · ร้านที่ไม่มีแถว settings: `getSettings` สร้างแถวเริ่มต้นเมื่อเรียกครั้งแรก (slug ดูกฎ §5.1) ปิดทุกอย่าง

## 3. API endpoints

ทุก path ใต้ `/api/v1` ยกเว้น `/mcp` (mount ที่ root ผ่าน hook §4) · `defineFeatureRoutes({ featureId: 'F39', slug: 'chatgpt-catalog' })` · ต้องลบ route placeholder ของ scaffold ใน PR แรก

### 3.1 ฝั่งเจ้าของร้าน (auth `business`)

| Method | Path | permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/businesses/:businessId/chatgpt-catalog/settings` | `product.read` | — | `CatalogSettingsView` | — |
| PUT | `/businesses/:businessId/chatgpt-catalog/settings` | `product.write` | `UpdateSettingsBody` | `CatalogSettingsView` | VALIDATION_ERROR, VERSION_CONFLICT, IDEMPOTENCY_CONFLICT (slug ซ้ำ) |
| POST | `/businesses/:businessId/chatgpt-catalog/tokens/feed/rotate` | `product.write` | — | `{ feedUrls: FeedUrls }` | — |
| POST | `/businesses/:businessId/chatgpt-catalog/tokens/mcp/rotate` | `product.write` | — | `{ token: string; mcpUrl: string; prefix: string }` (token แสดงครั้งเดียว) | — |
| GET | `/businesses/:businessId/chatgpt-catalog/preview` | `product.read` | `PreviewQuery` | `FeedPreview` | VALIDATION_ERROR |
| POST | `/businesses/:businessId/chatgpt-catalog/test-call` | `product.read` | `TestCallBody` | `{ ok: boolean; ms: number; result: unknown; error: string \| null }` | VALIDATION_ERROR, RATE_LIMITED |

### 3.2 สาธารณะ (auth `none`, ทุกตัวผ่าน `rateLimited`)

| Method | Path | การป้องกัน | Response | Errors |
|---|---|---|---|---|
| GET | `/public/chatgpt-catalog/:slug/feed/:token/products.jsonl` | token ใน path (constant-time) + `feed_enabled` + IP 30/นาที + token 20/นาที | `file` `application/x-ndjson; charset=utf-8` | NOT_FOUND (slug/token ผิด/ปิดอยู่: ข้อความเดียวกัน), RATE_LIMITED |
| GET | `/public/chatgpt-catalog/:slug/feed/:token/products.csv` | เหมือนกัน | `file` `text/csv; charset=utf-8` | เหมือนกัน |
| GET | `/public/chatgpt-catalog/:slug/feed/:token/products.tsv` | เหมือนกัน | `file` `text/tab-separated-values; charset=utf-8` | เหมือนกัน |
| GET | `/public/chatgpt-catalog/:slug/images/:fileId` | ไม่มี token แต่ต้องเป็นรูปของสินค้า active ของร้านนี้ + `feed_enabled` หรือ `mcp_enabled` + IP 300/นาที | `file` รูป (`inline`), `Cache-Control: public, max-age=3600` | NOT_FOUND |
| GET | `/public/chatgpt-catalog/:slug/products/:itemId` | `feed_enabled` + IP 120/นาที | `file` `text/html; charset=utf-8` (หน้าสินค้าเรียบง่าย) | NOT_FOUND |

หมายเหตุ: URL จริงที่ให้ภายนอกคือ `${PUBLIC_BASE_URL}/api/v1/public/chatgpt-catalog/...` (ว่าง → `APP_BASE_URL`) · ไม่มี cookie, ไม่มี CSRF (GET เท่านั้น) · log ของ request ใช้ route pattern (F01 §4) จึงไม่มี token ใน log · ต้องไม่ส่ง `Set-Cookie`

### 3.3 MCP (ไม่อยู่ใต้ `/api/v1`)

| Method | Path | auth | Response |
|---|---|---|---|
| POST | `/mcp/:businessSlug` | `Authorization: Bearer nlmcp_<token>` | JSON-RPC ตาม MCP Streamable HTTP (โหมด JSON ไม่ใช้ SSE) |
| POST | `/mcp/:businessSlug/t/:token` | token ใน path (ทางเลือกเมื่อ client ตั้ง header ไม่ได้) | เหมือนกัน |
| GET, DELETE | ทั้งสอง path | — | 405 `{"jsonrpc":"2.0","error":{"code":-32000,"message":"Method not allowed."},"id":null}` (ตามตัวอย่าง stateless ของ SDK) |

ข้อผิดพลาดระดับ HTTP (ก่อนถึง MCP): ไม่มี/ผิด token, slug ไม่มี, MCP ปิด (ร้านหรือ `MCP_ENABLED`) → **401** เหมือนกันทุกกรณี `{"jsonrpc":"2.0","error":{"code":-32001,"message":"Unauthorized"},"id":null}` + `WWW-Authenticate: Bearer` (ไม่บอกว่า slug มีหรือไม่) · เกิน rate limit → 429 + `Retry-After` + JSON-RPC error `-32002` · body เกิน 64 KB → 413

### 3.4 zod และ types (`shared/features/chatgpt-catalog/types.ts`)

```ts
import { z } from 'zod';

export const UpdateSettingsBody = z.object({
  expectedVersion: z.number().int().min(1),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/),
  feedEnabled: z.boolean(),
  mcpEnabled: z.boolean(),
  brand: z.string().trim().max(80).nullable(),
  sellerName: z.string().trim().max(80).nullable(),
}).strict();
export const PreviewQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
export const TestCallBody = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('search_catalog'), args: z.object({ query: z.string().max(100).optional(), maxPriceBaht: z.number().min(0).max(10_000_000).optional(), inStockOnly: z.boolean().optional(), limit: z.number().int().min(1).max(20).optional() }).strict() }),
  z.object({ tool: z.literal('get_price'), args: z.object({ sku: z.string().min(1).max(64), quantity: z.number().int().min(1).max(999).optional() }).strict() }),
]);   // test-call ไม่รองรับ propose_order (สร้างแชตจริง) ใช้ MCP Inspector แทน

export interface FeedUrls { jsonl: string; csv: string; tsv: string }
export interface CatalogSettingsView {
  businessId: string; slug: string; version: number;
  feedEnabled: boolean; mcpEnabled: boolean; mcpGloballyEnabled: boolean;   // = config.MCP_ENABLED
  brand: string | null; sellerName: string | null; targetCountry: string;
  feedUrls: FeedUrls | null;                       // null เมื่อยังไม่มี token
  feedTokenRotatedAt: string | null;
  mcpUrl: string; mcpTokenPrefix: string | null; mcpTokenRotatedAt: string | null;
  counts: { included: number; excluded: number };
  lastFeedFetchAt: string | null; lastMcpCallAt: string | null; calls24h: { feed: number; mcp: number };
  publicBaseUrl: string;
}
export interface FeedExcluded { itemId: string; sku: string; name: string; reason: 'no_image' | 'price_invalid' | 'service' | 'name_empty' }
export interface FeedPreview { rows: Record<string, unknown>[]; excluded: FeedExcluded[]; truncated: boolean; generatedAt: string }
```

Schema ของ MCP tool อยู่ที่ §6 (มาตรฐาน JSON ที่ SDK สร้างจาก zod)

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public ของฟีเจอร์: ใช้โดย routes) · `config.ts` · `feed.ts` (สร้างแถว) · `feed-format.ts` (JSONL/CSV/TSV) · `tokens.ts` · `images.ts` · `product-page.ts` · `mcp.ts` (สร้าง McpServer + mount) · `tools.ts` (logic ของ 3 tools ที่ไม่ผูกกับ SDK ให้ test ได้) · `handoff.ts` (propose_order) · `repo.ts` · `routes.ts` · `seed.ts` · `*.test.ts`

ฟังก์ชันใน `service.ts`: `getSettings(businessId)` · `updateSettings(businessId, input, actor)` · `rotateFeedToken(businessId, actor)` · `rotateMcpToken(businessId, actor)` · `previewFeed(businessId, limit)` · `buildFeed(businessId, format)` · `runTool(businessId, tool, args, ctx)` · `resolveBySlug(slug)` (ภายใน)

### Contract ที่ใช้ (ตาม `contracts.ts`)

- F08: `listCatalogItems(businessId, { query?, category?, maxPriceMinor?, inStockOnly?, limit?, cursor? }): Promise<Page<CatalogItem>>` (active เท่านั้น, limit สูงสุด 100) · `getCatalogItemDetails(businessId, itemIds[≤100]): Promise<CatalogItemDetail[]>` · `getPrice(businessId, ProductRef & { variantId?, quantity? }): Promise<PriceQuote>`
- F13: `createOrderFromProposal({ stage:'propose', businessId, conversationId, items:{ ref: ProductRef; variantId?; quantity }[], deliveryMethod:'shipping'|'pickup', clientRequestId })` → `{ stage:'propose', state:'awaiting_confirmation', proposal: ProposalSummary, review: OrderReviewPart }` (ใช้เฉพาะ stage `propose`; **ห้ามเรียก stage `confirm` จาก F39 ทุกกรณี**)
- F09: `saveMessage(SaveMessageInput)` (ลูกค้า inbound พร้อม `triggerAi:false`) · core `sendToCustomer(conversationId, parts, { author:'ai', origin:'demo', clientRequestId, businessId })` (เหมือน F38)

### Contract additions

```ts
// 1) F09 inbox · A1 (consumer: C1 F39). ขอเพิ่ม (CHANGE TO:A1) — ถ้า A1 ยังไม่ทำ F39 ใช้ fake ด้านล่างและ propose_order ได้ระดับ S
/** @owner F09 inbox · A1 · consumer: C1 F39 propose_order
 *  Creates the identity of a brand-new Demo Chat visitor for this business and returns a link that opens the Demo Chat
 *  as that visitor (the page reads `#v=<visitorToken>` from the URL fragment, verifies it through POST …/session, stores
 *  the cookie and removes the fragment). `customerExternalId` is `demo-visitor:<visitorId>` so F39 can call
 *  saveMessage({ customer: { channel: 'web', externalId, displayName } }). Null when the business has no enabled Demo Chat.
 *  The visitor token is as powerful as any Demo Chat visitor token: it can only read/write that one visitor's chat.
 *  @fake { visitorId: uuid v4, customerExternalId, url: `${PUBLIC_BASE_URL}/demo-chat/s/<SEED slug>#v=fake-token` } for SEED shops, else null. */
export declare function getDemoChatHandoff(businessId: string): Promise<{ visitorId: string; customerExternalId: string; url: string; publicSlug: string } | null>;

// 2) core features.ts: hook ให้ฟีเจอร์ mount Express handler ที่ root (C1 เป็นเจ้าของทั้งสองฝั่ง; additive)
export interface FeatureRoutes {
  // …เดิม
  /** Called once at boot after /api and /webhooks are mounted and before the SPA fallback. The feature mounts handlers only under
   *  its own fixed prefix (F39: '/mcp'). Core checks that no other feature mounted the same prefix (boot fails naming both).
   *  Tests: createApp() + loadFeatures() mounts it too, so supertest can call it. */
  mountExpress?(app: import('express').Express): void;
}
```

หมายเหตุ: ถ้าหัวหน้าไม่ต้องการแก้ `FeatureRoutes` ทางสำรองคือ `api.webhook('POST', '/mcp/:businessSlug', handler)` (mount ที่ `/webhooks/mcp/:businessSlug`) โดยใช้ transport แบบ Web Standard `Request`/`Response` ของ SDK: ยังไม่ยืนยันว่ามีใน 1.32.2 (§15) · เส้นทางหลักในสเปกนี้คือ `/mcp/:businessSlug` ตาม D8

## 5. Algorithms

ค่าคงที่ (`config.ts`):

| ค่า | ค่า |
|---|---|
| `FEED_MAX_ITEMS` | 2000 (เกิน = ตัดและ `truncated:true`, log warn) |
| `FEED_PAGE_SIZE` | 100 (ตรงเพดานของ `listCatalogItems`) |
| `TITLE_MAX` / `DESCRIPTION_MAX` | 150 / 5000 (ตามสเปก ACP) |
| `FEED_CACHE_SECONDS` | 60 (cache ผลต่อร้าน+รูปแบบในหน่วยความจำ; ล้างเมื่อ `updateSettings`) |
| `FEED_IP_PER_MIN` / `FEED_TOKEN_PER_MIN` | 30 / 20 |
| `MCP_IP_PER_MIN` / `MCP_BUSINESS_PER_MIN` | 120 / 60 |
| `MCP_PROPOSE_PER_HOUR` / `MCP_PROPOSE_PER_DAY` | 10 / 40 ต่อร้าน |
| `MCP_BODY_MAX` | 64 KB |
| `SEARCH_DEFAULT_LIMIT` / `SEARCH_MAX_LIMIT` | 10 / 20 |
| `IMAGE_MAX_BYTES` | 8 MB (ตาม upload limits ของ F35) |
| `TOKEN_BYTES` | 32 (`crypto.randomBytes`, base64url) |
| `MCP_TOKEN_PREFIX` | `nlmcp_` · feed token ไม่มี prefix |
| `PROPOSAL_CONFIRM_HINT` | ใช้ `expiresAt` ของ proposal จาก F13 (F39 ไม่คำนวณเอง) |

### 5.1 slug และ settings เริ่มต้น

`getSettings(businessId)`: ไม่มีแถว → สร้างด้วยค่า: `slug` = ตัวพิมพ์เล็กของชื่อร้านที่แปลงอักษรไม่ใช่ `[a-z0-9]` เป็น `-` (ชื่อไทยล้วนได้ว่าง) ต่อด้วย `-` และ 4 ตัวสุ่ม `[a-z0-9]` ถ้าสั้นกว่า 3 ตัวใช้ `shop-<6 ตัวสุ่ม>` · ชน unique → สุ่มใหม่สูงสุด 5 ครั้ง · `feed_enabled=false, mcp_enabled=false` · seed ร้านเดโม ใช้ slug เดียวกับ Demo Chat (`demo-boardgame`, `demo-repair`) เพื่อให้ URL อ่านง่ายตอนเดโม (ไม่ใช่ข้อกำหนด: F39 มี slug ของตัวเอง) · `updateSettings`: ตรวจ `expectedVersion` (ไม่ตรง → `VERSION_CONFLICT`), slug ซ้ำ → `IDEMPOTENCY_CONFLICT` (409), เปลี่ยน slug ทำให้ URL เดิมใช้ไม่ได้ (UI เตือน) · audit `chatgpt-catalog.settings.update` · ล้าง cache ของ feed

### 5.2 Token

- **feed token:** `rotateFeedToken` สร้าง 32 ไบต์ base64url → `feed_token_enc = encryptSecret(token)`, `feed_token_rotated_at = now()` · `GET settings` ถอดรหัสแล้วประกอบ `feedUrls` (เฉพาะผู้มี `product.read`; staff ที่มีสิทธิ์นี้เห็นได้ เพราะ feed คือข้อมูลที่ตั้งใจเปิด) · เมื่อ `feed_enabled` เป็น true แต่ยังไม่มี token → `updateSettings` สร้างให้อัตโนมัติ
- **MCP token:** `rotateMcpToken` สร้าง `nlmcp_` + 32 ไบต์ base64url → เก็บ `sha256(token)` hex + prefix 12 ตัวแรก · ตอบ token ดิบครั้งเดียว (header `Cache-Control: no-store`) · token เก่าใช้ไม่ได้ทันที
- **ตรวจ token:** `sha256(candidate)` เทียบ hash ด้วย `crypto.timingSafeEqual` (ความยาวเท่ากัน 32 ไบต์) · slug ไม่มี → เทียบกับ hash หลอก เพื่อให้เวลาตอบใกล้เคียงกัน (กัน enumeration) · feed token เทียบหลังถอดรหัสด้วย `timingSafeEqual` (ความยาวต่างกัน → false ก่อนโดยเทียบกับสตริงหลอกที่ยาวเท่า candidate)
- audit `chatgpt-catalog.token.rotate` (details: `{ kind: 'feed' | 'mcp' }` ไม่มีค่า token)

### 5.3 สร้าง feed (`feed.ts`)

1. โหลด settings (ต้อง `feed_enabled`) · `business` ชื่อ/ภาษาจาก `getBusiness` ผ่านบริการของ core (ชื่อร้านใช้เป็น brand/seller_name เมื่อ settings เป็น null)
2. ดึงสินค้า: วน `listCatalogItems(businessId, { limit: 100, cursor })` จนไม่มี `nextCursor` หรือครบ `FEED_MAX_ITEMS` (ไม่ใส่ `query` เพื่อได้ทุกชิ้นที่ active)
3. แบ่งเป็นกลุ่ม 100 id → `getCatalogItemDetails` (ผลเรียงตาม input; id ที่ไม่ active ถูกข้าม)
4. ต่อสินค้า (`CatalogItemDetail d`) ตัดสินใจรวม/ตัด (เรียงตรวจตามลำดับ; ตัดแล้วบันทึกเหตุผลใน `excluded`):
   - `d.kind='service'` → `service` (ACP เป็นฟีดสินค้า; บริการอยู่ใน booking)
   - ชื่อว่างหลัง trim → `name_empty`
   - `d.priceMinor <= 0` (และไม่มี variant ที่ `effectivePriceMinor > 0`) → `price_invalid`
   - `d.images.length = 0` → `no_image` (ACP กำหนด `image_url` เป็นฟิลด์บังคับ)
5. สร้างแถว (§5.4 mapping) หนึ่งแถวต่อสินค้า หรือหนึ่งแถวต่อ variant ที่ active เมื่อสินค้ามี variant (`listing_has_variations: true`)
6. เรียงแถวตาม `title` แล้ว `item_id` (คงที่ทุกรอบ) · เขียนผลเป็นสตริงตามรูปแบบ (§5.5) · cache `FEED_CACHE_SECONDS`
7. บันทึกเหตุการณ์ `chatgpt_catalog_events` (`feed_fetch`, format, items, ms)

### 5.4 ตารางแมปฟิลด์: `CatalogItemDetail` → ACP feed

ชื่อฟิลด์ตรวจจากสเปก feed สาธารณะของ OpenAI เมื่อ 20 พ.ย. 2569 (https://developers.openai.com/commerce/specs/feed) · ฟิลด์ที่เราไม่ส่ง = ไม่มีข้อมูลจริง (ไม่เดา)

| ฟิลด์ feed | ที่มา / กฎ | หมายเหตุ |
|---|---|---|
| `item_id` | สินค้าเดี่ยว: `d.sku` · variant: `variant.sku` ถ้ามี ไม่งั้น `<d.sku>--<variant.id 8 ตัวแรก>` | ต้องคงที่และไม่ซ้ำในไฟล์ (ตรวจและตัดแถวซ้ำที่สอง + log) |
| `title` | `d.name` (ภาษาไทย) · variant: `d.name — <variant.name>` | ตัดที่ 150 ตัวอักษร (ไม่ตัดกลางอักขระ: ใช้ `Array.from`) |
| `description` | `d.description` ทำความสะอาด (§5.6) · ว่าง → `d.name` + (category ถ้ามี) | ≤ 5000, ข้อความล้วน |
| `url` | `${base}/api/v1/public/chatgpt-catalog/<slug>/products/<d.id>` | หน้าสินค้าของเรา (§5.7) · base = `PUBLIC_BASE_URL` หรือ `APP_BASE_URL` |
| `brand` | `settings.brand ?? ชื่อร้าน` | ACP ให้ `brand` บังคับ; สินค้าไม่มีแบรนด์ใช้ชื่อร้าน (UNCONFIRMED ว่ายอมรับ §15) |
| `seller_name` | `settings.seller_name ?? ชื่อร้าน` | บังคับในทุกแถว |
| `seller_url` | `publicUrl` ของ Demo Chat ร้านนี้ (จาก `getDemoChatHandoff(businessId).url` ตัด fragment ออก) ถ้าไม่มี Demo Chat → ไม่ใส่ฟิลด์ | optional |
| `image_url` | `${base}/api/v1/public/chatgpt-catalog/<slug>/images/<images[0].fileId>` | ต้อง public (§5.8) |
| `additional_image_urls` | รูปที่ 2–6 เป็นอาร์เรย์ URL แบบเดียวกัน (ว่าง = ไม่ใส่ฟิลด์) | |
| `availability` | stock `null` → `in_stock` · stock > 0 → `in_stock` · stock = 0 → `out_of_stock` (variant ใช้ `effectiveStock`) | ค่าที่ ACP ยอมรับ: `in_stock`, `out_of_stock`, `pre_order`, `backorder`, `unknown` (ค่าอื่น = ปฏิเสธแถว) · เราไม่ส่ง `pre_order`/`backorder` |
| `price` | `(priceMinor / 100).toFixed(2) + ' THB'` เช่น `1490.00 THB` · variant ใช้ `effectivePriceMinor` | รูปแบบ `amount CURRENCY` หน่วยหลัก ทศนิยมจุด รหัส ISO 4217 พิมพ์ใหญ่ (ตามสเปก) |
| `target_countries` | `[settings.target_country]` = `["TH"]` | ACP ระบุ standard upload ใช้ `["US"]`: ไทยต้องตั้งค่าตอน onboarding (UNCONFIRMED §15) |
| `store_country` | `settings.target_country` = `TH` | บังคับ |
| `is_eligible_search` | `true` | alias `enable_search` (เราใช้ชื่อหลัก) |
| `is_eligible_checkout` | **`false` เสมอ** | alias `enable_checkout` · ไม่มีตัวเลือกให้เปิดในแอป |
| `group_id` | สินค้ามี variant: `d.sku` | ต้องต่างจาก `item_id` |
| `listing_has_variations` | `true` เมื่อมี variant (ทุกแถวของกลุ่ม) | |
| `variant_dict` | `{ "ตัวเลือก": variant.name }` | อ็อบเจกต์สตริง |
| `product_category` | `d.category` (ถ้ามี) | ใช้ `>` คั่นถ้าเจ้าของใส่มาแบบนั้น |
| `condition` | `new` | |
| `unit` | ไม่ส่ง (ไม่มีฟิลด์ใน ACP ที่ตรวจ) | `d.unit` ไปอยู่ท้าย `description` เมื่อมี เช่น "หน่วยขาย: ชุด" |
| `inventory` | **ไม่ส่ง**: ไม่พบฟิลด์ปริมาณสต็อกในสเปก feed ที่ตรวจ (มีเพียง `availability`) | จำนวนสต็อกเปิดเผยผ่าน MCP `get_price` เท่านั้น (UNCONFIRMED §15) |
| `shipping_price`, `shipping`, `accepts_returns`, `return_policy`, `gtin`, `mpn`, `review_count`, `star_rating` | ไม่ส่ง (ไม่มีข้อมูลจริง; `shipping_price` เว้นว่าง = "ไม่ทราบ" ไม่ใช่ฟรี) | |

### 5.5 รูปแบบไฟล์ (`feed-format.ts`)

- **JSONL:** หนึ่งอ็อบเจกต์ JSON ต่อบรรทัด (`\n` ท้ายทุกบรรทัด รวมบรรทัดสุดท้าย) UTF-8 ไม่มี BOM · ลำดับ key คงที่ตามตาราง §5.4 (ตัวช่วย `ORDERED_KEYS`) · ฟิลด์ที่ไม่มีค่าไม่ถูกใส่ (ไม่ส่ง `null`)
- **CSV / TSV** (สเปก ACP: เซลล์ที่มี comma/quote/newline ต้อง quote, quote ในเซลล์ใช้ `""`, อ็อบเจกต์ JSON ต้อง serialize): แถวหัว = รายชื่อคอลัมน์ตามลำดับ `ORDERED_KEYS` เฉพาะคอลัมน์ที่มีค่าอย่างน้อยหนึ่งแถว · ค่า boolean = `true`/`false` · อาร์เรย์/อ็อบเจกต์ = `JSON.stringify` แล้ว quote · CSV ใช้ `,` และ `\r\n`; TSV ใช้ `\t` และ `\n` (แท็บ/ขึ้นบรรทัดในค่า → แทนด้วยช่องว่าง เพราะ TSV ไม่มี quote มาตรฐาน; ข้อความที่ผ่านขั้น §5.6 ไม่มีสองอย่างนี้อยู่แล้ว)
- ไม่มี gzip (สเปกหน้า feed ไม่กล่าวถึง) · ไฟล์ว่าง (ไม่มีแถว) → ตอบ 200 ไฟล์ว่าง + header `X-Feed-Items: 0` (ไม่ error) และหน้าตั้งค่าแสดงคำเตือน
- header: `Cache-Control: private, max-age=60` · `X-Robots-Tag: noindex` · `Content-Disposition: inline; filename="products.<ext>"`

### 5.6 ทำความสะอาดข้อความ

`cleanText(s, max)`: NFKC → ลบแท็ก HTML (`<[^>]*>` ทำซ้ำสูงสุด 3 รอบ) → ถอด entity พื้นฐาน (`&amp; &lt; &gt; &quot; &#39; &nbsp;`) → ลบอักขระควบคุม (`[\u0000-\u001F\u007F]` ยกเว้น `\n`) → ยุบช่องว่างและขึ้นบรรทัดติดกัน → trim → ตัดด้วย `Array.from(s).slice(0, max)` · ไม่ใส่ราคา ส่วนลด หรือคำโฆษณาที่เจ้าของไม่ได้เขียน (ใช้ข้อความของเจ้าของตามจริง)

### 5.7 หน้าสินค้า (`product-page.ts`)

`GET …/products/:itemId` → `getCatalogItemDetails(businessId, [itemId])` (ไม่เจอ/ไม่ active = 404 หน้า HTML ธรรมดา) → HTML ขนาดเล็กที่สร้างด้วยฟังก์ชัน `esc()` (escape `& < > " '`) ทุกค่า: `<!doctype html><html lang="th">` พร้อม `<meta name="robots" content="noindex">` `<meta name="viewport">`, ชื่อ, รูป (URL ภาพของเรา), ราคา (`formatMoney` แบบ `฿1,490.00` ทำด้วย `Intl.NumberFormat('th-TH')`), สถานะสต็อก, คำอธิบาย (ข้อความล้วนผ่าน `esc` เปลี่ยนขึ้นบรรทัดเป็น `<br>`), ปุ่มลิงก์ "ถามร้านในแชต" ไปที่ Demo Chat ถ้าได้ URL · CSP: `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'` (หน้านี้ไม่มีสคริปต์) · ใช้เป็น `url` ของ feed เท่านั้น

### 5.8 รูปสาธารณะ (`images.ts`)

1. `settings` ต้องมี `feed_enabled` หรือ `mcp_enabled` มิฉะนั้น 404
2. ตรวจว่า `fileId` เป็นรูปของสินค้า active ของร้านนี้: ใช้แผนที่ `fileId → itemId` ที่สร้างจาก `listCatalogItems` + `getCatalogItemDetails` ทั้งแค็ตตาล็อก (cache 60 วินาทีต่อร้าน; พลาดก็สร้างใหม่ 1 ครั้ง) · ไม่อยู่ในแผนที่ → 404 (ไม่เปิดไฟล์อื่นของร้านเช่นสลิป)
3. `storage.read(fileId, { businessId })` → null → 404 · `mimeType` ต้องขึ้นต้น `image/` และไม่ใช่ `image/svg+xml` · ขนาด ≤ 8 MB มิฉะนั้น 404
4. ตอบ `file` `inline` พร้อม `Cache-Control: public, max-age=3600` และ `X-Content-Type-Options: nosniff` · บันทึกเหตุการณ์ `image_fetch` แบบสุ่มตัวอย่าง (1 ใน 10) เพื่อลดจำนวนแถว

### 5.9 MCP server (`mcp.ts`)

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

(path import ตามตัวอย่างทางการของ SDK v1.x · ตรวจกับไฟล์ที่ติดตั้งจริงใน `node_modules` ก่อนเขียน §15 ข้อ 3)

`mountExpress(app)` (ทำเมื่อ `config.MCP_ENABLED` เท่านั้น; ไม่งั้นไม่ mount อะไร และ `/mcp/*` ตกไป 404 ปกติ):
1. `app.post(['/mcp/:businessSlug', '/mcp/:businessSlug/t/:token'], express.json({ limit: '64kb' }), handler)` · `app.all(<สอง path เดิม>, (req,res) => 405)` สำหรับ GET/DELETE/อื่น
2. `handler`:
   1. `assertRateLimit({ key: 'mcp:ip:'+req.ip, limit: 120, windowSeconds: 60 })` (จับ `RATE_LIMITED` → 429 + `Retry-After`)
   2. `token` = path param หรือ `Authorization: Bearer <t>` (ตรงตัวพิมพ์ `Bearer ` ไม่สนตัวพิมพ์ของคำนำหน้า) · ไม่มี → 401
   3. `resolveBySlug(slug)` + `verifyMcpToken` (§5.2) + `mcp_enabled` + business active (ผ่านบริการของ core `getBusiness`-equivalent ที่ไม่ต้องมี session: ใช้ query `businesses.status='active'` ในตารางกลาง อ่านอย่างเดียวได้) → ไม่ผ่านข้อใด 401 เหมือนกัน
   4. `assertRateLimit({ key: 'mcp:biz:'+businessId, limit: 60, windowSeconds: 60 })`
   5. สร้างต่อ request (stateless): `const server = buildMcpServer({ businessId, slug, requestId })` + `const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` · `res.on('close', () => { transport.close(); server.close(); })` · `await server.connect(transport)` · `await transport.handleRequest(req, res, req.body)`
   6. error ที่หลุด → 500 `{"jsonrpc":"2.0","error":{"code":-32603,"message":"Internal server error"},"id":null}` (ไม่ส่งรายละเอียด) · log ระดับ error พร้อม `requestId` ไม่มี token/args
3. `buildMcpServer`: `new McpServer({ name: 'nless-catalog', version: '1.0.0' })` แล้ว `registerTool` 3 ตัว (§6 schema) · `instructions` ของ server (ถ้า SDK รองรับใน options: UNCONFIRMED) ไม่จำเป็น: ใส่ข้อความช่วยตัวแทนไว้ใน `description` ของแต่ละ tool แทน
4. ทุก tool wrapper: จับเวลา, เรียก `tools.ts`, บันทึก `chatgpt_catalog_events` (`mcp_call`, ชื่อ tool, ok, errorCode, ms, items), แปลง `AppError` เป็นผลลัพธ์ tool `{ isError: true, content: [{ type: 'text', text }] }` (ข้อความสั้นอังกฤษ + ไทย ไม่ส่ง stack/SQL) แทนการโยน protocol error · input ที่ไม่ตรง schema เป็นหน้าที่ของ SDK (JSON-RPC error `-32602`)
5. ผลสำเร็จ: `content: [{ type: 'text', text: JSON.stringify(result) }]` (JSON ย่อ ≤ 20 KB; เกิน → ตัดจำนวนรายการและตั้ง `truncated: true`) · ไม่ใช้ `outputSchema` (ลดความเสี่ยงความเข้ากันกับ client)

### 5.10 Tool logic (`tools.ts`)

ทุก tool รับ `{ businessId, requestId }` จาก context ที่ผูกตอนสร้าง server (client ส่ง businessId ไม่ได้)

**`search_catalog`** → `listCatalogItems(businessId, { query, category, maxPriceMinor: round(maxPriceBaht × 100), inStockOnly, limit: limit ?? 10 })` → `getCatalogItemDetails` ของ id ที่ได้ → map เป็น:
`{ items: [{ sku, name, nameEn, category, description (≤ 300 ตัว), price: "1490.00 THB", priceMinor, availability: 'in_stock'|'out_of_stock', imageUrl|null, productUrl, variants: [{ id, name, sku, price, availability }] }], count, nextCursor|null, note: "ราคาและสต็อกมาจากระบบร้านขณะนี้" }` · ไม่ใส่ `stock` เป็นตัวเลข (เปิดเฉพาะ `get_price`) · สินค้าไม่มีรูปยังอยู่ในผลค้นหาได้ (`imageUrl:null`; ต่างจาก feed ที่ตัดออก) · query ว่าง = ลิสต์ตามชื่อ · ผล 0 รายการ = `items: []` ไม่ error

**`get_price`** → `getPrice(businessId, { sku, variantId, quantity: quantity ?? 1 })` (ไม่พบ → `NOT_FOUND` → ผลลัพธ์ isError "ไม่พบสินค้า/variant") → `{ sku, name, variantId, quantity, unitPrice: "1490.00 THB", unitPriceMinor, subtotal: "2980.00 THB", subtotalMinor, currency:'THB', available: number|null, soldOut: boolean, note: "ยังไม่รวมค่าจัดส่ง" }` · ห้ามคำนวณราคาเองนอกจากแปลงหน่วย (ตัวเลขมาจาก `PriceQuote` ทั้งหมด)

**`propose_order`** (§5.11)

### 5.11 `propose_order` — เสนอออเดอร์ ไม่สร้างออเดอร์

1. rate limit: `assertRateLimit('mcp:propose:'+businessId, 10, 3600)` และ `…:day`, 40, 86400 → เกิน = ผลลัพธ์ isError `RATE_LIMITED` พร้อมข้อความรอ
2. `items` ทุกชิ้นตรวจ: `getPrice(businessId, { sku, variantId, quantity })` (ตรวจมีจริง/active) → ไม่พบ `NOT_FOUND`; `soldOut` → ผลลัพธ์ isError `SOLD_OUT` ระบุ sku (ไม่เสนอ) · รวม sku เดียวกันซ้ำ (รวมจำนวน; รวมแล้วต้อง ≤ 999)
3. `handoff = getDemoChatHandoff(businessId)` → null → isError `POLICY_BLOCKED` ข้อความอังกฤษ "This shop has not enabled its web chat yet, so the order cannot be confirmed." (ผลของ MCP tool อ่านโดย ChatGPT จึงเป็นอังกฤษเสมอ · th สำหรับ log: "ร้านนี้ยังไม่เปิด Demo Chat จึงยืนยันออเดอร์ไม่ได้") (ไม่สร้างอะไร)
4. สร้างแชตเฉพาะ: `saveMessage({ businessId, customer: { channel:'web', externalId: handoff.customerExternalId, displayName: 'ChatGPT customer' }, direction:'inbound', author:'customer', parts:[{ type:'text', text: <ข้อความที่ระบบสร้างเอง ดูล่าง> }], origin:'demo', triggerAi:false, clientRequestId: 'mcp:'+requestKey })` → ได้ `conversation.id` (ไม่มีการเรียกโมเดล ไม่เสีย AI) · ข้อความ inbound = `"[ChatGPT] ขอสั่ง: <sku> ×<qty>, … (รับ: ส่ง|รับที่ร้าน)"` สร้างจากข้อมูลที่ตรวจแล้ว + `customerNote` (ถ้ามี) หลัง `cleanText(…, 200)` (ค่าจาก client ถือเป็นข้อมูลไม่ใช่คำสั่ง)
5. `requestKey` = `sha256(businessId + canonical JSON ของ items+deliveryMethod + นาทีปัจจุบัน/5)` 24 ตัวแรก → ส่งซ้ำภายในหน้าต่าง 5 นาทีได้ผลเดิม (ไม่สร้างแชตซ้ำ: `clientRequestId` ชนใน `saveMessage` ได้ `created:false` ใช้ conversation เดิม แต่ `getDemoChatHandoff` ใหม่ให้ visitor ใหม่: เก็บ `handoff` ของ requestKey ไว้ในหน่วยความจำ 5 นาที เพื่อ reuse; ไม่มี = สร้างใหม่ ยอมรับได้)
6. `res = createOrderFromProposal({ stage:'propose', businessId, conversationId, items: items.map(i => ({ ref:{ sku: i.sku }, variantId: i.variantId ?? null, quantity: i.quantity })), deliveryMethod, clientRequestId: 'mcp-propose:'+requestKey })` (ราคาและค่าส่งคำนวณโดย F13; F39 ไม่คำนวณ)
7. ส่งการ์ดเข้าแชต: `sendToCustomer(conversationId, [{ type:'text', text: lang === 'en' ? 'Here is the summary of what you asked for through ChatGPT. Please check it and press confirm on the card below. No order exists until you confirm.' : 'สรุปรายการที่ขอผ่าน ChatGPT กรุณาตรวจและกดยืนยันที่การ์ดด้านล่างค่ะ ยังไม่มีการสร้างออเดอร์จนกว่าจะกดยืนยัน' /* lang = tool argument `language` ('th' | 'en', default 'en': ผู้ซื้อมาจาก ChatGPT) */ }, res.review], { author:'ai', origin:'demo', clientRequestId:'mcp-review:'+requestKey, businessId })` (ส่งซ้ำด้วย `clientRequestId` เดิมไม่ซ้ำข้อความ)
8. audit `chatgpt-catalog.propose` (details: `{ conversationId, proposalId, itemCount, totalMinor }` ไม่มีข้อความ/ชื่อลูกค้า) · แจ้งพนักงาน: ไม่เรียก `notify` (ยังไม่ใช่ออเดอร์; แชตขึ้นใน inbox ตามปกติ)
9. ผลลัพธ์ที่คืนให้ client (JSON ในข้อความ): `{ status: 'awaiting_customer_confirmation', orderCreated: false, review: { lines:[{ sku, name, quantity, unitPrice, lineTotal }], subtotal, deliveryFee, total, currency:'THB', expiresAt }, confirmUrl: handoff.url, instructions: "Give confirmUrl to the shopper. They open it and press confirm on the card in the chat. No order exists until they confirm.", note: "ลิงก์นี้ใช้กับลูกค้าคนนี้เท่านั้น" }` · **F39 ไม่เรียก `createOrderFromProposal` stage `confirm` ที่ใดเลย** (test จับด้วย spy) และไม่มี `reviewToken` ในผลลัพธ์ที่คืน (token ใช้ได้ในแชตเท่านั้น)
10. proposal หมดอายุ/ราคาเปลี่ยน → F13 จัดการตอนกดยืนยัน (`PROPOSAL_EXPIRED` / `VERSION_CONFLICT`) และ Demo Chat แสดงข้อความของ F09 ตามภาษาของหน้า (th/en)

### 5.12 ความปลอดภัยของการยืนยัน

ความยินยอมเกิดจากการกดปุ่มบนการ์ดใน Demo Chat ของลูกค้า (action ของ F09 → `createOrderFromProposal` stage `confirm` ผ่าน identity ของ visitor) เท่านั้น ตัวแทน/MCP client จึงทำให้เกิดออเดอร์เองไม่ได้ · ลิงก์ยืนยันมี visitor token ใน fragment (`#v=`): ไม่ถูกส่งไปที่ server ใน HTTP request แรก/ไม่เข้า log; ผู้ถือลิงก์เห็นได้แค่แชตของ visitor นั้น (ไม่มีข้อมูลร้านอื่น/ลูกค้าอื่น) · ผู้ที่ได้ลิงก์ = ผู้ยืนยันได้: ระบุใน UI ว่าให้ส่งลิงก์เฉพาะลูกค้าที่ต้องการสั่ง

## 6. AI calls

ไม่มี AI call ใน F39 (`model.*` ไม่ถูกเรียก, ไม่มี `model_usage`) · คนเรียก MCP คือ AI ภายนอก (เช่น ChatGPT) ซึ่งอยู่นอกการควบคุมและต้นทุนของเรา · ข้อมูลที่ MCP คืนเป็นข้อมูล ผู้เรียกต้องไม่ถือเป็นคำสั่งต่อระบบเรา: ทุก tool ตรวจ input ด้วย zod และรัน logic ในโค้ด

### 6.1 นิยาม tool (ชื่อ, description และ input schema ที่ลงทะเบียนกับ SDK)

เป้าหมายของ description คือให้ตัวแทนภายนอกใช้ถูก (ภาษาอังกฤษ ตามที่ MCP client ส่วนใหญ่อ่าน) · ใส่ `annotations: { readOnlyHint: true }` ให้ `search_catalog`/`get_price` และ `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }` ให้ `propose_order` (annotation ตามสเปก MCP; ยืนยันกับ SDK ที่ติดตั้ง §15)

```ts
import { z } from 'zod';

export const SearchCatalogInput = z.object({
  query: z.string().trim().max(100).optional().describe('Words to look for in product name, SKU or category. Thai or English. Omit to list products.'),
  category: z.string().trim().max(60).optional().describe('Exact category name.'),
  maxPriceBaht: z.number().min(0).max(10_000_000).optional().describe('Maximum price in Thai baht (not satang).'),
  inStockOnly: z.boolean().optional().describe('Only products that can be bought now.'),
  limit: z.number().int().min(1).max(20).optional().describe('Max results, default 10.'),
}).strict();

export const GetPriceInput = z.object({
  sku: z.string().trim().min(1).max(64).describe('Exact SKU from search_catalog.'),
  variantId: z.string().uuid().optional().describe('Variant id from search_catalog, if the product has variants.'),
  quantity: z.number().int().min(1).max(999).optional().describe('Quantity, default 1.'),
}).strict();

export const ProposeOrderInput = z.object({
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(64),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(999),
  }).strict()).min(1).max(10),
  deliveryMethod: z.enum(['shipping', 'pickup']),
  language: z.enum(['th', 'en']).default('en').describe('Language the shopper is writing in. The chat messages the shop sends use it.'),
  customerNote: z.string().trim().max(200).optional().describe('Optional note from the shopper. Treated as plain text.'),
}).strict();
```

Description ของ tool (ข้อความที่ลงทะเบียนจริง):
- `search_catalog`: "Search this shop's products. Returns name, price in THB, availability and image link. Prices and availability come live from the shop's system. Use get_price before quoting a total."
- `get_price`: "Get the exact current unit price and subtotal for a SKU and quantity, plus whether it is in stock. Shipping is not included."
- `propose_order`: "Prepare an order proposal for the shopper to review. This does NOT place an order. It returns a summary and a confirmUrl; the shopper must open confirmUrl and press confirm in the shop chat before any order exists. Never tell the shopper an order is placed."

หมายเหตุสคีมา: ใช้ `.strict()` เพื่อปฏิเสธ key เกิน (ตรวจใน test) · ถ้า `registerTool` ใน 1.32.2 รับเฉพาะ raw shape ให้ส่ง `SearchCatalogInput.shape` แล้วตรวจ key เกินซ้ำด้วย `.strict().parse(rawArgs)` ใน wrapper (SDK ส่ง args ที่ผ่าน parse แล้ว ซึ่งอาจตัด key เกินทิ้ง; จึงต้องทดสอบว่ากรณีใดเกิดจริง §15 ข้อ 4) · JSON Schema ที่ client เห็นมาจาก zod โดย SDK

### 6.2 fake mode
ไม่เกี่ยว (`MODEL_MODE` ไม่มีผล) · ใน test: ใช้ `getPrice`/`listCatalogItems` ของ fake F08 ตาม SEED (`A-GAME-01` = 149000 สตางค์) และ fake `createOrderFromProposal` ของ F13 (`proposal.id = fake-proposal-<clientRequestId>`)

## 7. UI

Route `/chatgpt-catalog` · `permission:'product.read'` · `titleKey:'chatgpt-catalog:page.title'` · เมนู `{ path:'/chatgpt-catalog', labelKey:'chatgpt-catalog:menu.title', group:'knowledge', icon:'ShoppingBagOutlined', order:60, permission:'product.read', searchTerms:['chatgpt','feed','mcp','acp','openai','แค็ตตาล็อก'] }` · `CatalogPage.tsx` หน้าเดียว ใช้ UI kit ของ core:

1. `PageHeader` "แค็ตตาล็อกสำหรับ ChatGPT" + คำอธิบายสั้น + `Alert warning` คงที่ "ไฟล์นี้ใช้ส่งให้ OpenAI ผ่านพอร์ทัลของ OpenAI เอง การขึ้นขายใน ChatGPT ต้องผ่านการตรวจของ OpenAI และยังไม่ได้ทำ · ระบบเราไม่รับชำระเงินผ่าน ChatGPT"
2. `SectionCard` "Product feed": สวิตช์เปิด/ปิด · สรุป "เข้า feed {{n}} ชิ้น · ตัดออก {{m}} ชิ้น" · ช่อง URL ทั้ง 3 รูปแบบพร้อมปุ่มคัดลอก (เฉพาะเมื่อเปิดและมี token) · ปุ่ม "สร้างลิงก์ใหม่" (`ConfirmDialog`: ลิงก์เดิมจะใช้ไม่ได้) · วันที่ดึงล่าสุด · ตารางตัวอย่าง (`GET preview`): item_id, title, price, availability, รูป (thumbnail) + ตาราง "ถูกตัดออก" (sku, ชื่อ, เหตุผล + ลิงก์ไปแก้ที่ `/catalog`)
3. `SectionCard` "MCP server": สวิตช์เปิด/ปิด (ปิดทั้งระบบเมื่อ `mcpGloballyEnabled=false` → `Alert info` "ปิดอยู่ทั้งระบบ ตั้ง MCP_ENABLED=1 ใน Render") · URL (`mcpUrl` = `${publicBaseUrl}/mcp/<slug>`) + ปุ่มคัดลอก · token: แสดงเฉพาะ prefix + เวลาที่หมุน · ปุ่ม "สร้าง token ใหม่" → `ConfirmDialog` แล้ว `FormDialog` แสดง token เต็ม **ครั้งเดียว** พร้อมปุ่มคัดลอกและข้อความ "บันทึกไว้ตอนนี้ ปิดแล้วดูอีกไม่ได้" · ช่อง slug (แก้ได้ + เตือนว่า URL เดิมใช้ไม่ได้) · ชื่อแบรนด์/ชื่อผู้ขายใน feed (ว่าง = ชื่อร้าน) · ปุ่มบันทึก (ผู้มี `product.write`; ผู้อื่นอ่านอย่างเดียว) · `VERSION_CONFLICT` → toast + โหลดใหม่
4. `SectionCard` "ลองเรียกเครื่องมือ": เลือก `search_catalog` หรือ `get_price`, กรอกอาร์กิวเมนต์ (ช่องตามสคีมา), ปุ่ม "เรียก" → `POST test-call` → แสดงผล JSON ในกล่อง `<pre>` + เวลา ms (เรียก logic เดียวกับ MCP แต่ไม่ผ่าน HTTP/token) · มีคำอธิบายว่า `propose_order` ทดสอบผ่าน MCP Inspector (สร้างแชตจริง)
5. `SectionCard` "วิธีเดโม": ขั้นตอนสั้น ๆ (MCP Inspector: `npx @modelcontextprotocol/inspector` → เลือก transport Streamable HTTP → ใส่ URL → ใส่ Authorization: Bearer <token> → List Tools → เรียก `search_catalog`) + ข้อความ "ChatGPT connector: ขึ้นกับบัญชีและแผน ดู docs.openai.com ล่าสุด (ยังไม่ยืนยัน)"
6. `SectionCard` "การใช้งานล่าสุด" (24 ชม.): ดึง feed กี่ครั้ง, MCP เรียกกี่ครั้ง, ครั้งล่าสุด
7. states: loading (skeleton ของการ์ด), error (`EmptyState` + ลองใหม่), feed ว่าง (`EmptyState`: "ยังไม่มีสินค้าที่พร้อมเข้า feed ต้องมีรูปและราคา" + ปุ่มไป `/catalog`) · ปุ่มคัดลอกใช้ `navigator.clipboard` + toast · ไม่มีปุ่มเปล่า

i18n (namespace `chatgpt-catalog`):

| key | th | en |
|---|---|---|
| `menu.title` | แค็ตตาล็อกสำหรับ ChatGPT | ChatGPT catalog |
| `page.title` | แค็ตตาล็อกสำหรับ ChatGPT | ChatGPT-ready catalog |
| `page.subtitle` | ส่งออกสินค้าเป็นไฟล์ feed แบบ ACP และเปิด MCP ให้ตัวแทน AI ค้นสินค้า ถามราคา และเสนอออเดอร์ | Export products as an ACP feed and open an MCP server so AI agents can search, quote prices and propose orders |
| `notice.limits` | ไฟล์นี้ใช้ส่งผ่านพอร์ทัลของ OpenAI เอง การขึ้นขายใน ChatGPT ต้องผ่านการตรวจของ OpenAI และยังไม่ได้ทำ ระบบนี้ไม่รับชำระเงินผ่าน ChatGPT | The file is submitted through OpenAI's own portal. Listing in ChatGPT needs OpenAI's review and has not been done. Payment through ChatGPT is not supported |
| `feed.title` | Product feed | Product feed |
| `feed.enable` | เปิดใช้ feed | Enable feed |
| `feed.counts` | เข้า feed {{included}} ชิ้น · ตัดออก {{excluded}} ชิ้น | {{included}} in the feed · {{excluded}} excluded |
| `feed.url.jsonl` | ลิงก์ JSONL | JSONL link |
| `feed.url.csv` | ลิงก์ CSV | CSV link |
| `feed.url.tsv` | ลิงก์ TSV | TSV link |
| `feed.copy` | คัดลอก | Copy |
| `feed.copied` | คัดลอกแล้ว | Copied |
| `feed.rotate` | สร้างลิงก์ feed ใหม่ | Create a new feed link |
| `feed.rotateConfirm` | ลิงก์เดิมจะใช้ไม่ได้ทันที ต้องส่งลิงก์ใหม่ให้ผู้ดึงข้อมูล | The old link stops working immediately. Share the new one |
| `feed.lastFetch` | ดึงล่าสุด | Last fetched |
| `feed.neverFetched` | ยังไม่มีใครดึง | Not fetched yet |
| `feed.preview` | ตัวอย่างแถวใน feed | Sample feed rows |
| `feed.excluded` | สินค้าที่ถูกตัดออก | Excluded products |
| `feed.empty` | ยังไม่มีสินค้าที่พร้อมเข้า feed ต้องมีรูปและราคามากกว่า 0 | No product is ready for the feed yet. Products need an image and a price above 0 |
| `reason.no_image` | ไม่มีรูปสินค้า | No image |
| `reason.price_invalid` | ราคาไม่ถูกต้อง | Invalid price |
| `reason.service` | เป็นบริการ (ไม่อยู่ใน feed สินค้า) | A service (not in the product feed) |
| `reason.name_empty` | ไม่มีชื่อ | No name |
| `mcp.title` | MCP server | MCP server |
| `mcp.enable` | เปิดใช้ MCP | Enable MCP |
| `mcp.globallyOff` | ปิดอยู่ทั้งระบบ ตั้ง MCP_ENABLED=1 ใน Render แล้ว deploy ใหม่ | Disabled system-wide. Set MCP_ENABLED=1 in Render and redeploy |
| `mcp.url` | URL ของ MCP | MCP URL |
| `mcp.token` | token | Token |
| `mcp.tokenNone` | ยังไม่มี token | No token yet |
| `mcp.tokenRotatedAt` | หมุนเมื่อ | Rotated at |
| `mcp.rotate` | สร้าง token ใหม่ | Create a new token |
| `mcp.rotateConfirm` | token เดิมจะใช้ไม่ได้ทันที | The old token stops working immediately |
| `mcp.tokenOnce` | บันทึก token นี้ไว้ตอนนี้ ปิดหน้าต่างแล้วดูอีกไม่ได้ | Save this token now. You cannot see it again |
| `mcp.slug` | ชื่อใน URL (slug) | Name in the URL (slug) |
| `mcp.slugWarn` | เปลี่ยนแล้ว URL เดิมของ feed และ MCP จะใช้ไม่ได้ | Changing it breaks the current feed and MCP URLs |
| `mcp.brand` | ชื่อแบรนด์ใน feed | Brand in the feed |
| `mcp.seller` | ชื่อผู้ขายใน feed | Seller name in the feed |
| `mcp.brandHelp` | ว่าง = ใช้ชื่อร้าน | Empty = shop name |
| `mcp.save` | บันทึก | Save |
| `mcp.saved` | บันทึกแล้ว | Saved |
| `mcp.conflict` | มีคนแก้การตั้งค่าไปแล้ว โหลดใหม่ให้แล้ว | Someone changed the settings. Reloaded |
| `test.title` | ลองเรียกเครื่องมือ | Try a tool |
| `test.tool` | เครื่องมือ | Tool |
| `test.call` | เรียก | Call |
| `test.result` | ผลลัพธ์ | Result |
| `test.proposeNote` | propose_order สร้างแชตจริง ทดสอบผ่าน MCP Inspector | propose_order creates a real chat. Test it with MCP Inspector |
| `demo.title` | วิธีเดโม | How to demo |
| `demo.inspector` | เปิด MCP Inspector (npx @modelcontextprotocol/inspector) เลือก Streamable HTTP ใส่ URL ด้านบนและ Authorization: Bearer <token> แล้วกด List Tools | Open MCP Inspector (npx @modelcontextprotocol/inspector), pick Streamable HTTP, paste the URL above and Authorization: Bearer <token>, then List Tools |
| `demo.chatgpt` | การเพิ่มเป็น connector ใน ChatGPT ขึ้นกับบัญชีและแผน ตรวจเอกสารล่าสุดของ OpenAI | Adding it as a ChatGPT connector depends on your account and plan. Check OpenAI's latest docs |
| `usage.title` | การใช้งาน 24 ชั่วโมงล่าสุด | Last 24 hours |
| `usage.feed` | ดึง feed | Feed fetches |
| `usage.mcp` | เรียก MCP | MCP calls |
| `usage.lastMcp` | เรียก MCP ล่าสุด | Last MCP call |
| `error.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Jobs / schedules | ไม่มี (ทุกอย่างตอบแบบ synchronous; feed สร้างตอนถูกเรียกและ cache 60 วินาที) |
| Realtime | ไม่มี event ใหม่ (แชตที่ propose_order สร้างขึ้นผ่าน `message.created` ปกติของ F09) |
| Audit | `chatgpt-catalog.settings.update` · `chatgpt-catalog.token.rotate` (`kind`) · `chatgpt-catalog.propose` (ไม่ audit การอ่าน feed/search/get_price: นับใน `chatgpt_catalog_events`) |
| notify | ไม่มี |
| `model_usage` | ไม่มี |
| Mount | `mountExpress` ที่ `/mcp` เมื่อ `MCP_ENABLED` |

## 9. Seed และ fixtures

`server/src/features/chatgpt-catalog/seed.ts` (`FeatureSeed`, `dependsOn: ['core','catalog','inbox']`, idempotent `ON CONFLICT DO NOTHING`):
- ร้าน A (`biz_demo_a`): `slug 'demo-boardgame'`, `feed_enabled=true`, `mcp_enabled=true`, token: ไม่ seed (null; เปิดหน้าตั้งค่าแล้วกดสร้าง/หมุน หรือ `feed_enabled` ทำให้สร้าง feed token ตอนเรียก `getSettings` ครั้งแรก) · ร้าน B: `slug 'demo-repair'`, ปิดทั้งสอง
- `runDemo(ctx)`: ไม่ทำอะไรเพิ่ม (รูปสินค้าเดโม `A-DEMO-01…06` มาจาก `db:seed -- --demo` ของ core + `runDemo` ของ F08 จึงทำให้ feed ของร้าน A มีอย่างน้อย 6 แถวที่มีรูป) · `resetDemo(ctx)`: ลบ `chatgpt_catalog_events` ของสองร้านเดโม (ไม่แตะ settings/token) และลบ `customers` ที่ `external_id` ขึ้นต้น `demo-visitor:` ซึ่ง F09 `resetDemo` ลบอยู่แล้ว (แชตที่ propose_order สร้างจึงหายตามไปเอง)

Fixtures ของ test (สร้างด้วยโค้ด): ร้านใหม่ต่อ test ไม่ได้ (SEED ตายตัว) จึงใช้ร้าน A + สร้างสินค้า/รูปใหม่ผ่านบริการของ F08 ไม่ได้ข้าม feature → ใช้ fake/จริงของ `listCatalogItems` กับ SEED เป็นหลัก และ mock `vi.mock('../catalog/service')` ในกรณีต้องควบคุม (สินค้าไม่มีรูป, ราคา 0, variant, service, > 100 ชิ้น 2 หน้า) · รูปทดสอบ: `sharp` สร้าง PNG 64×64 แล้ว `storage.save` ผ่าน core (purpose `product_image`) ใน `beforeAll` · token ทดสอบ: ผ่าน `rotateMcpToken` จริง · MCP client ใน test: `Client` + `StreamableHTTPClientTransport` ของ SDK ต่อกับ `app.listen(0)` (UNCONFIRMED path import §15) และ supertest สำหรับ JSON-RPC ตรง ๆ

## 10. Tests

Unit/service (`MODEL_MODE=fake`):

| ไฟล์ | case |
|---|---|
| `feed.test.ts` | แมปฟิลด์ครบตาม §5.4: สินค้า `A-GAME-01` → `item_id`, `title`, `price:"1490.00 THB"`, `availability:'in_stock'`, `brand`/`seller_name` = ชื่อร้าน, `target_countries:["TH"]`, `store_country:"TH"`, `is_eligible_search:true`, **`is_eligible_checkout:false`** ทุกแถว · สต็อก 0 → `out_of_stock` · สต็อก `null` → `in_stock` · สินค้ามี variant → แถวต่อ variant, `group_id` ≠ `item_id`, `listing_has_variations:true`, `variant_dict`, ราคา = `effectivePriceMinor` · ไม่มีรูป/ราคา ≤ 0/บริการ/ชื่อว่าง → อยู่ใน `excluded` พร้อมเหตุผล · `title` ตัด 150, `description` ตัด 5000, ลบแท็ก HTML/entity · `image_url` ขึ้นต้น `PUBLIC_BASE_URL` และชี้เส้นทางรูปของร้าน · เรียงแถวคงที่สองรอบเท่ากัน · > 100 ชิ้นดึงหลายหน้า · เกิน 2000 → `truncated` · ไม่มีคีย์ `null` ใน JSONL · item_id ซ้ำถูกตัด |
| `feed-format.test.ts` | JSONL: บรรทัดละอ็อบเจกต์, `\n` ท้ายไฟล์, UTF-8 ไทยไม่เพี้ยน · CSV: เซลล์ที่มี comma/quote/ขึ้นบรรทัด ถูก quote และ `""` · อาร์เรย์/อ็อบเจกต์เป็น JSON ใน cell · คอลัมน์เฉพาะที่มีค่า · TSV: ไม่มีแท็บในค่า · ไฟล์ว่าง |
| `tokens.test.ts` | หมุน MCP token: ตอบ token ดิบครั้งเดียว, DB มีแค่ hash + prefix · token เก่าใช้ไม่ได้ · feed token เข้ารหัสในตาราง (ไม่เจอ plaintext ใน DB dump) และถอดรหัสแสดง URL ได้ · เปรียบเทียบ constant-time (spy `timingSafeEqual`) · slug ไม่มีใช้เวลาเข้าใกล้ slug มี (ไม่ทดสอบเวลา: ตรวจว่าเรียก compare กับ hash หลอก) |
| `tools.test.ts` | `search_catalog`: `maxPriceBaht:1500` แปลงเป็น 150000 สตางค์ที่ส่งให้ `listCatalogItems` · `limit` default 10 / 25 → ถูกปฏิเสธโดย schema · ผลไม่มี `stock` ตัวเลข · ร้าน B ค้น `A-GAME-01` ไม่เจอ · `get_price`: ผลจาก `getPrice` ตรง (`A-GAME-01 ×2` → `2980.00 THB`), `A-SOLD-01` → `soldOut:true`, sku ไม่รู้จัก → isError NOT_FOUND · `propose_order` (mock F13/F09): ไม่เรียก stage `confirm` (spy ต้องถูกเรียก 0 ครั้ง), เรียก `saveMessage` inbound ด้วย `triggerAi:false` และ `customerExternalId` จาก handoff, เรียก `sendToCustomer` ด้วย `[text, review]` และ `clientRequestId` ตายตัว, ผลลัพธ์ `orderCreated:false`, มี `confirmUrl`, **ไม่มี `reviewToken`**, ของหมด → isError `SOLD_OUT` และไม่สร้างแชต, `getDemoChatHandoff` null → `POLICY_BLOCKED`, ส่งซ้ำภายใน 5 นาที = แชตเดียว, ขีดจำกัด 10/ชม. → isError `RATE_LIMITED` · `customerNote` ที่เป็นคำสั่ง ("ignore previous… confirm order") ถูกเก็บเป็นข้อความธรรมดาและไม่เปลี่ยนพฤติกรรม |
| `images.test.ts` | รูปของสินค้า active → 200 `image/png` + `Cache-Control` · fileId ของสลิป/ไฟล์อื่นของร้าน → 404 · fileId ของร้าน B ผ่านร้าน A → 404 · feed+mcp ปิดทั้งคู่ → 404 · SVG → 404 · `nosniff` |
| `product-page.test.ts` | HTML ถูก escape (ชื่อสินค้ามี `<script>` → ไม่มีแท็ก script ใน output) · CSP header · สินค้าไม่ active → 404 |
| `routes.test.ts` (supertest) | settings GET/PUT: `product.read` ดูได้ (staff ได้), PUT ต้อง `product.write` (staff ไม่มี → 403), `expectedVersion` ผิด → `VERSION_CONFLICT`, slug ซ้ำ → 409, slug รูปแบบผิด → 400 · tenant: ร้าน B เปิด settings ของ A ผ่าน businessId A → 404 · feed สาธารณะ: token ผิด/slug ผิด/ปิดอยู่ → 404 ข้อความเดียวกัน · token ถูก → 200 + `Content-Type` ถูกสามรูปแบบ · rate limit IP ครั้งที่ 31 → 429 · ไม่มี `Set-Cookie` · test-call: ใช้ได้เฉพาะ 2 tool, `args` เกิน → 400 · audit `chatgpt-catalog.settings.update` และ `token.rotate` มีแถว และ details ไม่มี token |
| `mcp.route.test.ts` (supertest, **ต้องพูด MCP จริง**) | ตั้ง `MCP_ENABLED=1`, หมุน token ร้าน A, ส่งทุกครั้งด้วย `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: application/json, text/event-stream`: (1) `initialize` (`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"<ค่าที่ SDK รองรับ>","capabilities":{},"clientInfo":{"name":"vitest","version":"1"}}}`) → 200 JSON-RPC `result.serverInfo.name='nless-catalog'` และ `result.capabilities.tools` ไม่ว่าง · (2) `tools/list` → ชื่อครบสามตัว (`search_catalog`, `get_price`, `propose_order`) แต่ละตัวมี `inputSchema.type='object'`, `additionalProperties:false` และ `required` ตรง (`propose_order`: `items`, `deliveryMethod`) · (3) `tools/call search_catalog {query:"A-GAME"}` → `result.content[0].text` เป็น JSON ที่มี `A-GAME-01` และราคา `1490.00 THB` · (4) `tools/call get_price {sku:"A-GAME-01", quantity:2}` → `2980.00 THB` · (5) `tools/call` ด้วย key เกิน (`{query:"x", evil:1}`) → error (`-32602` หรือ `isError`) ไม่ทำงาน · (6) `tools/call` ชื่อ tool ไม่มี → error · (7) `tools/call propose_order` (F13 fake) → `orderCreated:false` + `confirmUrl` + แถว `messages` ในแชตใหม่ (outbound `order_review`) และไม่มีแถวใน `orders` เพิ่ม (นับผ่านบริการของ F13 หรือ `jobs`/audit: ตรวจ spy ว่า `confirm` ไม่ถูกเรียก) |
| `mcp.auth.test.ts` | ไม่มี Authorization → 401 · token ผิด → 401 · token ของร้าน B ใช้กับ slug ของ A → 401 · slug ไม่มี → 401 (เนื้อหา response เหมือนกัน) · MCP ปิดที่ร้าน → 401 · `MCP_ENABLED` ปิด → 404 (ไม่ mount) · token ใน path `/mcp/<slug>/t/<token>` ใช้ได้เท่ากับ header · `GET /mcp/<slug>` → 405 · body > 64 KB → 413 · ครั้งที่ 61 ในหนึ่งนาทีของร้านเดียว → 429 + `Retry-After` · หมุน token แล้ว token เก่า 401 ทันที · ไม่มี token ใน log (จับ stream ของ pino) |
| `mcp.client.test.ts` | เปิดเซิร์ฟเวอร์จริงบนพอร์ตสุ่ม ใช้ `Client` + `StreamableHTTPClientTransport` ของ SDK (ส่ง header bearer) → `connect()`, `listTools()` ได้ 3 tools, `callTool({ name:'search_catalog', arguments:{ query:'A-GAME' } })` ได้ผล · พิสูจน์ว่า server คุยกับ client จริงของ SDK ไม่ใช่แค่ JSON ที่เราประกอบเอง |

Playwright smoke `web/src/features/chatgpt-catalog/e2e/chatgpt-catalog.smoke.spec.ts` (production-safe: ใช้ร้านเดโม A, marker `e2e-<ts>`; ไม่ยืนยันออเดอร์; ปล่อยการตั้งค่า feed/MCP เปิดไว้):
1. `ownerPage` เปิด `/chatgpt-catalog` → เห็นหัวข้อ คำเตือนขอบเขต และตัวเลข "เข้า feed" > 0 (ร้าน A มีสินค้าเดโมพร้อมรูป)
2. เปิดสวิตช์ feed และ MCP (ถ้ายังปิด) → บันทึก → คัดลอกลิงก์ JSONL จากช่อง (อ่านค่าจาก `input` ที่แสดง) → `fetch` ด้วย context ไม่มี cookie → 200, บรรทัดแรก parse เป็น JSON ที่มี `item_id`, `title`, `price` ตรง `^\d+\.\d{2} THB$`, `is_eligible_checkout === false`, `image_url` → ดึงรูปได้ 200 `image/*`
3. กด "สร้าง token ใหม่" ยืนยัน → อ่าน token จาก dialog → POST `/mcp/<slug>` `initialize` แล้ว `tools/list` (3 ชื่อ) และ `tools/call search_catalog` ได้ `A-GAME-01` · token เก่า (ถ้ามี) ใช้ไม่ได้
4. `tools/call propose_order` (`A-GAME-01 ×1, pickup`) → ได้ `confirmUrl` → เปิดใน context ใหม่ (`#v=` ถูกแปลงเป็น cookie) → เห็น `demo-chat-message` ที่มีการ์ดสรุปรายการและปุ่มยืนยัน **ไม่กด** · ข้อนี้ `test.skip` พร้อมเหตุผลถ้า F13 ไม่ R หรือ A1 ยังไม่ทำ `#v=` handoff
5. ผู้ใช้ไม่มี token: `GET` feed ด้วย token ผิด → 404 · `POST /mcp/<slug>` ไม่มี header → 401

## 11. Acceptance: R ตาม D6

- [ ] `/chatgpt-catalog` ทำงานจริง: เปิด/ปิด feed และ MCP, บันทึก, `VERSION_CONFLICT`, หมุน token (MCP แสดงครั้งเดียว), คัดลอก URL, ตัวอย่างแถวและรายการตัดออกตรงข้อมูลจริงของ F08
- [ ] ไฟล์ feed ดึงได้จริงบน production ทั้ง JSONL/CSV/TSV ด้วย token · ฟิลด์ทุกตัวตรงตาราง §5.4 · `is_eligible_checkout` เป็น false ทุกแถว · รูปเสิร์ฟสาธารณะได้เฉพาะรูปสินค้า active · **ตรวจกับสเปก feed สาธารณะอีกรอบตอนเริ่ม S1** (วันที่/เวอร์ชันที่ตรวจจดใน EVIDENCE.md)
- [ ] MCP: `initialize` + `tools/list` + `tools/call` ทำงานจริงบน production กับ client จริงของ SDK หรือ MCP Inspector อย่างน้อย 1 ครั้ง (จดผลใน EVIDENCE.md พร้อมเวลา) · input เกิน/ผิด schema ถูกปฏิเสธ · token ผิด = 401 · rate limit ทำงาน
- [ ] `propose_order`: สร้างแชตเฉพาะ + การ์ดยืนยันที่เห็นได้ใน Demo Chat ผ่านลิงก์ · ไม่มีออเดอร์เกิดก่อนกดยืนยัน · F39 ไม่เรียก `confirm` (test) · ถ้า F13/A1 ยังไม่พร้อม ฟีเจอร์นี้เป็นระดับ S: บันทึกตามจริง
- [ ] ราคาและสต็อกมาจาก F08 ทุกจุด · ไม่มีข้อมูลร้านอื่น (test tenant) · audit ครบ · ไม่มี token ใน log/DB/response ที่ไม่ควรมี
- [ ] loading/empty/error, i18n th/en, ตรวจ permission (`product.read`/`product.write`) + tenant, unit + route + `mcp.route.test.ts` + `mcp.client.test.ts` ผ่าน, Playwright smoke ผ่านบน production
- **S**: feed ใช้ได้แต่ MCP ใช้ได้เฉพาะ `search_catalog`/`get_price` (propose ยังไม่ผ่าน handoff/F13) · **A**: มีแต่ไฟล์ feed จากปุ่มส่งออกในหน้าเดียว · ไม่ถึง R ตอน 15:30 → ซ่อน `/chatgpt-catalog` ด้วย feature flag (`/ops`) และปิด `MCP_ENABLED` ถ้าไม่ได้ใช้เดโม
- **คำที่ห้ามใช้เมื่อพูดถึงฟีเจอร์นี้**: "ขายใน ChatGPT แล้ว", "OpenAI อนุมัติ", "ชำระเงินใน ChatGPT" (ดูตารางห้ามอ้างของ F36)

## 12. Security และ privacy

- **Tenant:** ทุก query กรอง `business_id`; businessId ของ MCP มาจาก slug+token ฝั่ง server เท่านั้น (client ส่งไม่ได้) · รูป: ตรวจว่าเป็นรูปของสินค้า active ของร้านนั้น (ไม่เปิดไฟล์อื่น)
- **Auth:** MCP ใช้ bearer token ต่อร้าน (เก็บเฉพาะ sha256) แบบ read-only ยกเว้น `propose_order` ที่ไม่สร้างออเดอร์ · feed ใช้ token ใน path (เข้ารหัสใน DB) · เปรียบเทียบด้วย `timingSafeEqual` · ข้อผิดพลาดเหมือนกันทุกกรณีเพื่อไม่ให้เดา slug · หมุน token ได้ทันที
- **Rate limit** (`rateLimit`/`assertRateLimit` ของ core; in-memory ต่อ process ซึ่งพอเพราะมี instance เดียว): feed 30/นาที/IP และ 20/นาที/token · MCP 120/นาที/IP และ 60/นาที/ร้าน · propose 10/ชม. และ 40/วัน/ร้าน · รูป 300/นาที/IP · หน้าสินค้า 120/นาที/IP · ตั้ง `trust proxy` แล้วตาม F01 (IP ถูกต้องหลัง Render proxy)
- **การไม่เชื่อ client:** อาร์กิวเมนต์ MCP ผ่าน zod `.strict()`; `customerNote` เป็นข้อความธรรมดา (`cleanText`), ไม่ถูกส่งให้โมเดลของเรา (ข้อความ inbound ใช้ `triggerAi:false`) · ราคา/สต็อก/ค่าส่งมาจาก DB/F13 เท่านั้น
- **ห้ามตัวแทนยืนยัน:** F39 ไม่เรียก `createOrderFromProposal` stage `confirm`; `reviewToken` ไม่ออกทาง MCP; ออเดอร์เกิดจากปุ่มบนการ์ดใน Demo Chat เท่านั้น
- **ข้อมูลที่เปิดสาธารณะผ่าน feed:** ชื่อ/คำอธิบาย/ราคา/สถานะสต็อก/รูปของสินค้า active เท่านั้น (ไม่มีต้นทุน, ไม่มีจำนวนสต็อก, ไม่มีข้อมูลลูกค้า) · เจ้าของทราบและเปิดเอง (ค่าเริ่มต้นปิด)
- **Transport:** token ใน path ไม่ลง log (log ใช้ route pattern) · ไม่ส่ง `Set-Cookie` · ไม่เปิด CORS · ไม่ตรวจ `Origin` เพราะไม่ใช้ cookie/session (auth ด้วย bearer ที่ browser แนบเองไม่ได้ จึงไม่เสี่ยง DNS rebinding/CSRF แบบ cookie)
- **หน้าสินค้า:** escape ทุกค่า, CSP `default-src 'none'`, ไม่มีสคริปต์, `noindex`
- ห้าม log: token, header `Authorization`, argument ของ tool, ข้อความ `customerNote`, URL เต็มของ feed · `chatgpt_catalog_events` เก็บเฉพาะชนิด/ผล/เวลา

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| สินค้าไม่มีรูป | ไม่อยู่ใน feed (`no_image`) แต่ยังค้นเจอใน MCP (`imageUrl:null`) |
| สินค้าไม่ active/ถูกลบหลัง cache | feed ล้าสุดภายใน ≤ 60 วินาที · รูปของสินค้าที่ปิดแล้วให้ 404 ภายใน ≤ 60 วินาที (cache แผนที่รูป) |
| สินค้ามี variant ที่ปิดบางตัว | เฉพาะ variant ที่ active (F08 ส่งมาเฉพาะ active) เป็นแถว · ถ้าเหลือศูนย์ variant ใช้แถวสินค้าหลัก |
| ชื่อ/คำอธิบายไทยยาวหรือมีอีโมจิ/HTML | ตัดด้วยจุดรหัส (Array.from) ไม่ตัดกลางอักขระ · แท็ก HTML ถูกลบ |
| ราคาทศนิยม satang ไม่ลงตัว | `toFixed(2)` จากจำนวนเต็มสตางค์ (ไม่มี floating error: คำนวณด้วยจำนวนเต็ม `Math.trunc(m/100)` และ `m%100`) |
| ไม่มี Demo Chat ของร้าน (`getDemoChatHandoff` null) | `propose_order` → `POLICY_BLOCKED` ชัดเจน · feed/search/get_price ยังทำงาน · feed ไม่ใส่ `seller_url` |
| `MCP_ENABLED` ปิด | `/mcp` ไม่ถูก mount (404) · หน้าตั้งค่าบอกเหตุผล · feed ยังทำงานแยกกัน |
| client ส่ง JSON-RPC แบบ batch/หลายข้อความ | SDK จัดการตามสเปก (stateless รองรับ request ต่อ POST) ; body เกินขีดจำกัดถูกตัด 413 |
| MCP client เรียก `initialize` ครั้งเดียวแล้วเรียก tool ใน request แยก | ได้ (stateless: ไม่มี session id) · client ที่ต้องการ session จะได้รับโหมด stateless ตามที่ระบุใน response header ของ SDK |
| ลูกค้าเปิด `confirmUrl` ซ้ำ/หลังหมดอายุ | Demo Chat แสดงการ์ดเดิม; ยืนยันหลังหมดอายุ → `PROPOSAL_EXPIRED` ข้อความไทยของ F09/F13 · ขอใหม่ผ่าน `propose_order` อีกครั้ง |
| ผู้โจมตีเรียก `propose_order` รัว | rate limit 10/ชม./ร้าน แล้วตัด (ผลลัพธ์ `RATE_LIMITED`) · ไม่มีออเดอร์/ค่าใช้จ่าย AI เกิดขึ้น แต่มีแชตที่ไม่มีการตอบ (พนักงานเห็นเป็นลูกค้า "ลูกค้าจาก ChatGPT"): เพดาน 40/วัน |
| หมุน token ระหว่างที่ผู้ดึง feed ใช้อยู่ | ครั้งถัดไปได้ 404 · ต้องส่ง URL ใหม่ (UI เตือน) |
| ร้านถูกระงับ/soft-delete | MCP 401, feed/รูป/หน้าสินค้า 404 (ตามกติกา: ธุรกิจที่ไม่ active ไม่รับอะไร) |
| `demo:reset` | `resetDemo` ลบแถวใน `chatgpt_catalog_events`; แชตจาก propose หายไปพร้อม `demo-visitor:*` ของ F09; settings/token คงอยู่ |
| ชื่อร้านเป็นภาษาไทยล้วน | slug เริ่มต้น `shop-xxxxxx` (ผู้ใช้แก้ได้) |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **S1 feed + settings** | 40 | migration · types · `config.ts`, `tokens.ts`, `feed.ts`, `feed-format.ts`, `images.ts`, `product-page.ts`, `service.ts` (settings/rotate/preview/buildFeed) · routes 3.1 + 3.2 (ลบ placeholder) · tests feed/feed-format/tokens/images/product-page/routes · ตรวจสเปก feed ของ OpenAI อีกรอบ (จดวันที่) · ใช้ fake `listCatalogItems` ได้ถ้า F08 ยังไม่ merge |
| **S2 MCP server** | 45 | `core/features.ts` hook `mountExpress` (+ test boot) · `mcp.ts`, `tools.ts` (`search_catalog`, `get_price`) · auth + rate limit · `mcp.route.test.ts`, `mcp.auth.test.ts`, `mcp.client.test.ts` · ตรวจ API จริงของ SDK 1.32.2 ใน `node_modules` (ข้อ §15 3–4) · ทดสอบกับ MCP Inspector หนึ่งครั้งและจดผล |
| **S3 propose_order + หน้า UI + smoke** | 40 | `handoff.ts` (propose_order), contract `getDemoChatHandoff` (ขอ CHANGE TO:A1 ตั้งแต่ S1: ถ้าไม่ทัน ใช้ fake + ระดับ S) · `CatalogPage.tsx` + i18n + web test · test-call route · seed + `resetDemo` · Playwright smoke · EVIDENCE.md · ซ้อมเดโม MCP Inspector/connector ตามหัวข้อ "วิธีเดโม" |

ลำดับ: ถ้าถึง 15:15 ก่อนจบ S3 → commit WIP ที่ผ่าน test แล้วพัก (F36 เริ่ม) · slice ที่ไม่ผ่าน test ห้าม merge · ซ่อนฟีเจอร์ด้วย flag ถ้าไม่ถึง R ตอน 15:30

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

ตรวจแล้วจากแหล่งหลัก (20 พ.ย. 2569): ชื่อฟิลด์และกฎของ ACP product feed จาก https://developers.openai.com/commerce/specs/feed (รวม `item_id`/`id`/`sku`, `title`, `description`, `url`, `brand`, `seller_name`, `image_url`, `availability` ∈ {`in_stock`,`out_of_stock`,`pre_order`,`backorder`,`unknown`}, `price` = `amount CURRENCY`, `target_countries`, `store_country`, `is_eligible_search`/`enable_search`, `is_eligible_checkout`/`enable_checkout`, `group_id`, `listing_has_variations`, `variant_dict`, `additional_image_urls`, `seller_url`, `product_category`, `condition`) และรูปแบบ JSONL/CSV/TSV · จาก README/ตัวอย่างทางการของ `@modelcontextprotocol/sdk` v1.x: `McpServer`, `registerTool(name, { description, inputSchema }, handler)`, `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`, `transport.handleRequest(req, res, req.body)`, การตอบ 405 สำหรับ GET/DELETE ใน stateless · ที่เหลือ **ยังไม่ยืนยัน**:

1. **ประเทศและสกุลเงิน:** สเปกบอกว่า standard upload ใช้ `target_countries:["US"]`, `store_country:"US"` · ไทย (`TH`, THB) ได้รับรองหรือไม่ ขึ้นกับ onboarding ของ OpenAI: ตรวจ https://developers.openai.com/commerce (หน้า get-started/ประเทศที่รองรับ) และข้อความในพอร์ทัล · ถ้า TH ไม่รองรับ ไฟล์ยังเป็น "รูปแบบ ACP" แต่ห้ามพูดว่าส่งได้จริง
2. **`brand` บังคับ:** เราใช้ชื่อร้านเมื่อสินค้าไม่มีแบรนด์ ไม่ทราบว่า OpenAI ยอมรับหรือไม่ · ฟิลด์ปริมาณสต็อก (`inventory`) ไม่พบในสเปกที่ตรวจ จึงไม่ส่ง · `url` ต้องเป็นหน้าสินค้าที่ผู้ซื้อใช้ได้จริง: หน้าของเราเป็นหน้าเรียบง่าย (อาจไม่ผ่านการตรวจของ OpenAI)
3. **การส่ง feed:** สเปกอธิบายว่าส่งผ่านพอร์ทัลของ OpenAI (อัปโหลดมือ / URL HTTPS / SFTP) และต้อง claim ธุรกิจและยืนยันตัวตน: เราไม่ทำและไม่รู้ว่าผู้ดึงส่ง header ได้หรือไม่ (จึงใช้ token ใน path) · รูปแบบไฟล์ที่พอร์ทัลรับจริง (เช่น gzip) ยังไม่ยืนยัน
4. **SDK 1.32.2 (ตรวจจากไฟล์ใน `node_modules/@modelcontextprotocol/sdk` หลัง `npm ci`):** (ก) path import `server/mcp.js` และ `server/streamableHttp.js` · (ข) ชื่อ option `enableJsonResponse` ของ transport (ถ้าไม่มี ให้ตั้ง `Accept: application/json, text/event-stream` และรับ SSE ในโหมด stateless: ปรับ `mcp.route.test.ts` ให้อ่านทั้งสองรูปแบบ) · (ค) `registerTool` รับ `z.object().strict()` หรือเฉพาะ raw shape · ถ้าเป็น raw shape ต้องตรวจ key เกินเอง (§6.1) · (ง) รองรับ `annotations`, `instructions` · (จ) transport แบบ Web Standard `Request`/`Response` (ถ้ามี ใช้เป็นทางสำรองแทน `mountExpress`) · (ฉ) `Client` + `StreamableHTTPClientTransport` สำหรับ `mcp.client.test.ts` · (ช) ค่า `protocolVersion` ที่ SDK รองรับ ให้ test ใช้ค่าล่าสุดจาก `LATEST_PROTOCOL_VERSION` ของ SDK ไม่ hard-code
5. **zod 4 กับ SDK:** SDK ประกาศ peer `zod ^3.25 || ^4.0`; ตรวจว่า `npm ls zod` เห็นเวอร์ชันเดียวและ JSON Schema ที่ได้ใน `tools/list` มี `additionalProperties:false` (ตรวจใน `mcp.route.test.ts`; ถ้าไม่มี ให้เพิ่มด้วย `z.toJSONSchema`/`override` ตามที่ SDK รองรับ)
6. **ChatGPT custom connector (สำคัญ: ตรวจคืนนี้):** (ก) บัญชีที่เพิ่ม MCP/connector แบบกำหนดเองได้ (developer mode) แผนใดบ้าง และเปิดที่ไหน (คาดว่า Settings → Connectors/Apps → Advanced; ไม่ยืนยัน) → วิธีตรวจ: ล็อกอิน chatgpt.com ด้วยบัญชีที่จะใช้เดโมและดูเมนูนั้น, อ่านหน้า help ล่าสุดของ OpenAI เรื่อง developer mode · (ข) ChatGPT รองรับการยืนยันตัวตนแบบใดสำหรับ MCP ระยะไกล (ไม่มี / OAuth / header token): ถ้าไม่รองรับ bearer header ให้ใช้ URL แบบ `/mcp/<slug>/t/<token>` ที่เราเตรียมไว้ หรือเดโมด้วย MCP Inspector แทน · (ค) ต้องใช้ HTTPS สาธารณะ (Render ให้อยู่แล้ว; localhost ใช้ไม่ได้) · (ง) เครื่องมือที่ไม่ได้ติด `readOnlyHint` อาจต้องยืนยันก่อนเรียกใน ChatGPT: ไม่ยืนยัน · **แผนสำรองที่ต้องเตรียมไว้เสมอ:** MCP Inspector (`npx @modelcontextprotocol/inspector`) และ `mcp.client.test.ts` เป็นหลักฐานว่า server ทำงานจริง
7. **Dev origin ของ MCP Inspector:** Inspector (เบราว์เซอร์) เรียก server ผ่าน proxy ของมันเอง ไม่ต้องเปิด CORS; ถ้าใช้โหมดตรงจากเบราว์เซอร์จะติด CORS (เราไม่เปิด) ให้ใช้โหมด proxy ปกติ: ตรวจตอนซ้อมเดโม
8. `getDemoChatHandoff` และการอ่าน `#v=` ของหน้า Demo Chat เป็นข้อเสนอที่ **ยังไม่ได้ตกลงกับ A1**: โพสต์ `CHANGE TO:A1` ตั้งแต่เริ่ม S1 พร้อมสัญญาในข้อความ §4 ถ้า A1 ปฏิเสธ ให้ลดเป็นระดับ S (ไม่มี `propose_order` แบบครบ) และแก้ §11
9. `createOrderFromProposal` stage `propose` ของ F13 จริง: ตรวจว่ารับ `ref: { sku }` + `variantId` และคืน `review` ที่เป็น `OrderReviewPart` พร้อม `expiresAt` (ตามสัญญา: ตรวจกับโค้ด A2 เมื่อ DONE) · fake ของ F13 คืน proposal ไม่เก็บถาวร ปุ่มยืนยันบนการ์ดจะไม่ทำงานจนกว่า A2 DONE (ตั้งป้ายใน EVIDENCE.md)
10. Render: `MCP_ENABLED` default ใน `.env.example` ต้องตรวจ (ปิดเป็นค่าเริ่มต้นปลอดภัย) · ตั้ง `MCP_ENABLED=1` ใน Render env เฉพาะเมื่อจะเดโม · ตรวจว่าเส้นทาง `/mcp/*` ไม่ถูก SPA fallback ดักก่อน (F01 `server.ts` ยกเว้นเฉพาะ `/api,/webhooks,/ws,/health…`: ต้องเพิ่ม `/mcp` ในรายการยกเว้น: งานของ C1 ใน S2) และ `mountExpress` ถูกเรียกก่อน SPA fallback
11. ค่า `target_country` ที่เจ้าของร้านควรตั้ง และการแสดงราคาสกุลอื่น: ไม่รองรับ (THB เท่านั้น)
