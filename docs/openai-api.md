# OpenAI API: วิธีเรียก model ทุกตัวของแอป

อัปเดต 20 พ.ย. 2569 · ใช้คู่กับ [PLAN.md](../PLAN.md) และ [contracts.ts](competition-plan/templates/contracts.ts) · ข้อมูลจากเอกสาร OpenAI ที่ developers.openai.com (ลิงก์ท้ายไฟล์) **และผลยิง API จริงด้วย key ของทีมเมื่อ 20 พ.ย.** ([§15](#15-ผลทดสอบจริง-20-พย-2569)) ข้อที่ยังเขียนว่า **UNCONFIRMED** คือส่วนที่ยังไม่ได้ทดสอบ

## 0. กติกา

1. **AI ทุกอย่างของแอปใช้ OpenAI API เท่านั้น** เครื่อง dev ใช้ API key ของเจ้าของเครื่องใน OpenAI project `app-dev` (hard limit US$30 ต่อคน) และ production ใช้ key เดียวใน project `app-prod` (hard limit US$60) · ห้าม Bedrock, Gemini/Google GenAI/Vertex, Cohere, OpenRouter, Qwen/DashScope, DeepInfra, xAI/Grok, Meta Muse, Cartesia, ElevenLabs, MiniMax, Fish Audio, iApp, Google TTS, Rekognition, Bedrock Guardrails หรือ provider อื่น
2. **ทุก call ผ่าน `model.*` ของ core (C1)** ซึ่งเป็นที่เดียวที่ import `openai` SDK ฟีเจอร์ห้ามเรียก SDK หรือ `fetch('https://api.openai.com/...')` เอง (ยกเว้นฝั่ง browser ของ F30 ที่ต่อ WebRTC ด้วย client secret ที่ core ออกให้)
3. **model ID อ่านจาก env เท่านั้น** ([§1](#1-ค่าเริ่มต้น-model-และ-env)) ห้าม hard-code ใน feature
4. **ทุก call บันทึก `model_usage`** (purpose, model, tokens, ต้นทุน, latency, request id) แม้ call ล้ม ไม่มีโควตา ใช้ได้ไม่จำกัด แต่ต้องเห็นต้นทุน (F27)
5. **test และ CI ใช้ `MODEL_MODE=fake` เสมอ** ไม่เรียก OpenAI จริง (fake ตาม contracts.ts)
6. output ของ model เป็นข้อมูล ไม่ใช่สิทธิ์: validate ด้วย zod ก่อนใช้ ราคาและสต็อกมาจาก DB เท่านั้น
7. ส่วนที่ Papi ใช้ service ภายนอกที่ไม่ใช่ model: **Jina Reader → ไม่ใช้** (อ่าน URL เองด้วย fetch + SSRF guard), **Google Maps Geocoding → ไม่ทำ**, **Slip2Go → ไม่ใช้เป็นค่าเริ่มต้น** (อ่านสลิปด้วย OpenAI vision แล้วตรวจในโค้ด [§7](#7-vision-สลิปและรูปสินค้า)), Google Calendar/Sheets ยังใช้ได้เพราะไม่ใช่ AI · Omise ตัดออก (ไม่มีบัญชี)

## 1. ค่าเริ่มต้น model และ env

| env (core อ่าน) | ค่าเริ่มต้น | ใช้ทำอะไร | พารามิเตอร์ |
|---|---|---|---|
| `OPENAI_API_KEY` | dev: key ของ project `app-dev` ของเจ้าของเครื่อง · production: key ของ project `app-prod` | ทุกอย่าง | dev อยู่ใน `..\nless.secrets.env` ของเครื่องนั้น · production อยู่ใน Render env เท่านั้น |
| `OPENAI_CHAT_MODEL` (`model:'chat'`) | **`gpt-6.2-sol`** | คำตอบแชต F10, tool calling, vision, insights F26, extraction ยาก F06 | `reasoning.effort:'low'`, `text.verbosity:'low'` |
| `OPENAI_CHAT_MODEL_FAST` (`model:'fast'`) | **`gpt-6.2-sol`** | intent classifier, extraction ฟิลด์ (ออเดอร์, ที่อยู่, booking), rerank, rolling summary, แปลข้อความ | effort ต่ำสุด (`'none'` ถูกส่งเป็น `'low'` บน Sol) + Structured Outputs strict |
| `OPENAI_CHAT_MODEL_STRONG` (`model:'strong'`) | **`gpt-6.2-sol`** | ใช้เมื่อ F10 ต้อง retry turn ที่ tool loop ซับซ้อนหรือ claim check ล้ม (ไม่เกิน 1 ครั้งต่อ turn) | `reasoning.effort:'medium'` (ให้ต่างจากรอบแรก) · **ห้ามส่ง `'none'`** (Sol ตอบ 400) |
| `OPENAI_EMBED_MODEL` | **`text-embedding-3-large`** + `dimensions:1536` | embeddings ของ F05/F07/F08/F06 ทั้ง document และ query | `EMBED_DIM=1536` ตรงกับ `vector(1536)` |
| `OPENAI_MODERATION_MODEL` | `omni-moderation-latest` | ตรวจข้อความ/รูปที่ร้านอัปโหลด (F05, F06, F12) | ฟรี |
| `OPENAI_REALTIME_MODEL` | ดู [§10](#10-voice) | F30 voice | — |
| `OPENAI_REALTIME_VOICE` | ดู [§10](#10-voice) | F30 voice | — |
| `OPENAI_TRANSCRIBE_MODEL` | ดู [§10](#10-voice) | ถอดเสียงข้อความเสียงจาก LINE/Messenger/IG, คำพูดลูกค้าใน F30 | — |
| `OPENAI_TTS_MODEL` | ดู [§10](#10-voice) | (ถ้าทำ) อ่านคำตอบเป็นเสียง | — |
| `MODEL_TIMEOUT_MS` | 20000 | timeout ต่อ call | — |
| `MODEL_MAX_OUTPUT_TOKENS` | 2000 | cap ของ output **รวม reasoning token** | ขั้นต่ำ 16 |
| `MODEL_PRICE_TABLE` | ดู §1.1 | คำนวณต้นทุนใน `model_usage` | — |

**ทีมตัดสิน 20 พ.ย.: `gpt-6.2-sol` ทุกงาน text** (ฉลาดที่สุดในกลุ่มที่คุ้ม, `gpt-6.2-astra` แพงกว่า 4 เท่าเกินจำเป็น) · ทดสอบแล้วผ่านทุกข้อ ([§15](#15-ผลทดสอบจริง-20-พย-2569)) · alias สามตัวยังอยู่ ถ้าวันงาน latency หรือต้นทุนสูงไป ลด `OPENAI_CHAT_MODEL_FAST` เป็น `gpt-6-luna` ผ่าน env ได้ทันทีโดยไม่แก้โค้ด (luna ทดสอบแล้วว่าใช้ได้กับ classifier)

ทำไม embeddings ใช้ large: ทดสอบหลายภาษา (MIRACL) ได้ 54.9 เทียบกับ 44.0 ของ small และร้านทดสอบมีข้อมูลน้อย ต้นทุนไม่ถึง US$1 ถ้า smoke test พบว่าใช้ไม่ได้ ใช้ `text-embedding-3-small` (1536 มิติอยู่แล้ว) **ห้ามผสมสอง model ใน index เดียว** ถ้าเปลี่ยน model ต้อง embed ใหม่ทั้งหมด

### 1.1 ราคา (USD ต่อ 1M token, Standard tier)

```json
{
  "gpt-6.2-astra": {"input": 8,    "cachedInput": 0.40, "output": 40},
  "gpt-6.2-sol":   {"input": 2,    "cachedInput": 0.10, "output": 10},
  "gpt-6.1-terra": {"input": 1,    "cachedInput": 0.05, "output": 5},
  "gpt-6-luna":    {"input": 0.10, "cachedInput": 0.01, "output": 0.50},
  "text-embedding-3-large": {"input": 0.13, "cachedInput": 0, "output": 0},
  "text-embedding-3-small": {"input": 0.02, "cachedInput": 0, "output": 0},
  "omni-moderation-latest": {"input": 0, "cachedInput": 0, "output": 0}
}
```

- ทั้ง 4 รุ่นแชตรับ text + image, ตอบ text, รองรับ function calling, Structured Outputs, streaming และ prompt caching · context 1,050,000 token (input สูงสุด 922k) · output สูงสุด 128,000
- prompt ที่ input เกิน 272K คิด 2× input และ 1.5× output (แอปเราไม่ควรถึง)
- cache write (TTL 30 นาทีซึ่งเป็นค่าเริ่มต้น) คิด 1.25× input · reasoning token คิดเป็น output
- ต้นทุนต่อ 1,000 turns (6k input / 400 output): **sol ~$16 (ถ้า cache prefix 5k ได้ ~$7)** ← แผนใช้ตัวนี้ · terra ~$8 · luna ~$0.80

## 2. Papi ใช้อะไร → ระบบใหม่ใช้อะไร

จาก inventory ของ Papi ที่ `71ee7659` (model เลือกผ่าน `L/model-routing.mjs`)

| งาน | Papi (live) | ระบบใหม่ | ฟีเจอร์ |
|---|---|---|---|
| คำตอบแชตหลัก + tool loop | โมเดลแชตเดิม → fallback OpenRouter `openai/gpt-6-luna`; legacy Bedrock `gpt-oss-120b` | `model:'chat'` (`gpt-6.2-sol`) Responses + function tools · retry ด้วย `model:'strong'` ได้ 1 ครั้ง | F10 |
| intent / scenario / price / handoff classifier | Bedrock `openai.gpt-oss-20b-1:0` (+ regex ก่อน) | `model:'fast'` (`gpt-6.2-sol`) effort ต่ำสุด + strict `json_schema` ที่ label เป็น enum · regex ก่อนเหมือนเดิม | F10 |
| commerce action / calculation extraction | ตาม route แชต | `model:'fast'` strict schema; ถ้า schema ไม่ผ่าน retry ด้วย `model:'chat'` | F13, F10 |
| booking intake | OpenRouter `google/gemini-3.8-flash` | `model:'fast'` strict schema | F15 |
| advisory / claim check | Bedrock `gpt-oss-120b` และโมเดลเดิม | `model:'fast'` strict schema (claim ↔ evidence) · OUT ในวันงานตาม F10 brief | F10 |
| extraction จากไฟล์ (PDF/รูป/Office) | OpenRouter `google/gemini-3.1-flash-lite` | `model:'chat'` + `input_file` / `input_image` ([§8](#8-pdf-และไฟล์)) · PDF ดิจิทัล parse text เองก่อน | F06 |
| extraction สินค้าจาก text/URL | OpenRouter `gemini-3.1-flash-lite` | `model:'fast'` strict schema (ยาว/ซับซ้อน → `chat`) | F06, F08 |
| link reader | Jina Reader → OpenRouter web_fetch | fetch เอง + SSRF guard + ตัด HTML เป็น text → `model:'fast'` | F06 (URL) |
| อธิบายรูปที่ลูกค้าส่ง | OpenRouter `gemini-3.1-flash-lite` | `model:'chat'` + `input_image` (OUT ในวันงานตาม F10 brief) | F10 |
| อ่านสลิป | Slip2Go (ไม่ใช่ AI) | `model:'chat'` + `input_image` `detail:'high'` → strict schema แล้วตรวจในโค้ด | F14 |
| embeddings document | Bedrock `cohere.embed-v4:0` + Gemini `gemini-embedding-001` + Qwen shadow (ทั้งหมด 1536) | `text-embedding-3-large` `dimensions:1536` ชุดเดียว (ไม่มี `input_type` แยก document/query) | F05, F07, F08, F06 |
| query embedding + cache | Gemini query embedding + ตาราง `query_embedding_cache` | `model.embed({purpose:'query'})` + cache ใน DB ได้ถ้าทัน (key = business + model + dim + sha256) | F07 |
| rerank | Bedrock Cohere rerank / Gemini LLM scorer (ปิดเป็นค่าเริ่มต้น) | **OpenAI ไม่มี rerank endpoint:** ดึง top ~20 จาก pgvector แล้วให้ `model:'fast'` เรียงด้วย strict schema `{ids_ranked:[...]}` (ถ้าทัน) | F07 |
| moderation | Bedrock Guardrails (text) + Rekognition (รูป) + vision model เดิม | `omni-moderation-latest` (text + รูป) | F05, F06, F12 |
| แปลข้อความ / แปลสรุป | OpenRouter `gpt-oss-20b` และโมเดลเดิม | `model:'fast'` | F09, F26 |
| rolling summary, insights, tag ลูกค้า | Bedrock `gpt-oss-120b` และโมเดลเดิม | `model:'fast'` (summary) / `model:'chat'` (insights) strict schema | F26, F24 |
| paraphrase คำอธิบายสินค้า | โมเดลเดิม | `model:'fast'` | F05 |
| voice realtime | Muse STT → Orchestrator → Cartesia TTS; Qwen omni realtime | OpenAI Realtime ([§10](#10-voice)) | F30 |
| help assistant, SrsBot | โมเดลเดิม | ตัดออกจาก scope | — |

## 3. Responses API (ใช้ตัวนี้ ไม่ใช้ Chat Completions)

- เอกสาร OpenAI: Chat Completions ยังรองรับแต่ **แนะนำ Responses สำหรับงานใหม่ทั้งหมด** และ tool calling บน GPT-6.x ต้องใช้ Responses
- npm `openai` (ล่าสุด 7.62.0, 19 พ.ย. 2569; ต้องใช้ ≥ 7.58.0 ที่เพิ่ม ID ของ GPT-6.2) รองรับ Node 22 และ 24 · client อ่าน `OPENAI_API_KEY` เอง · ค่าเริ่มต้น `maxRetries: 2`, timeout 10 นาที → core ปิด retry ของ SDK (`maxRetries: 0`) แล้ว **retry เองครั้งเดียว** ([§3.6](#36-error-และ-retry)) เพื่อไม่ retry กลุ่ม `insufficient_quota` และไม่เกิน deadline

```ts
import OpenAI from 'openai';
export const openai = new OpenAI({ maxRetries: 0, timeout: Number(process.env.MODEL_TIMEOUT_MS ?? 20000) });
```

### 3.1 คำตอบ text ธรรมดา

```ts
const r = await openai.responses.create({
  model: process.env.OPENAI_CHAT_MODEL!,           // gpt-6.2-sol
  input: [
    { role: 'developer', content: SHOP_RULES },      // ส่วนที่คงที่ไว้หน้าสุด → cache ได้
    ...history,                                       // { role: 'user' | 'assistant', content }
    { role: 'user', content: 'มีไซซ์ M ไหมคะ' },
  ],
  reasoning: { effort: 'low' },
  text: { verbosity: 'low' },
  max_output_tokens: 2000,
  store: false,                                       // แชตมีข้อมูลลูกค้า
  prompt_cache_key: `biz:${businessId}`,
  safety_identifier: sha256(customerId),
  metadata: { purpose: 'ai.reply', conversation_id: conversationId },
});
r.output_text;   // ข้อความรวม
r.status;        // 'completed' | 'incomplete'
```

- ใส่กฎที่ใช้ซ้ำใน **ข้อความ `developer` ตัวแรก** ไม่ใช่ `instructions`: model ตระกูล GPT-6.2 ต่อ `instructions` ไว้หลัง `input` และคิดราคาแบบไม่ cache และ `instructions` ไม่ติดไปกับ `previous_response_id`
- **ห้ามส่ง `temperature`, `top_p`, `top_logprobs`** · ทดสอบแล้ว: `gpt-6.2-sol` ตอบ 400 `Unsupported parameter: 'temperature'` ส่วน luna/terra รับได้ แต่เราไม่ส่งเลยทุกรุ่นเพื่อให้สลับ model ได้ไม่พัง · ช่อง `temperature?` ใน contract ถูกเลิกใช้
- `max_output_tokens` รวม reasoning token · ถ้าตัดกลาง: `status:'incomplete'` + `incomplete_details.reason:'max_output_tokens'` → `finishReason:'length'`
- `truncation` ค่าเริ่มต้น `'disabled'` → input ยาวเกินได้ 400 (core ต้องตัด history เอง)
- `user` เลิกใช้แล้ว ใช้ `safety_identifier` (≤128 ตัว, hash) และ `prompt_cache_key` แทน · `metadata` ได้ ≤16 คู่ key ≤64 ตัว value ≤512 ตัว

### 3.2 Function tools (tool loop ของ F10)

```ts
const tools = [{
  type: 'function',
  name: 'get_price',
  description: 'ราคาจริงจาก catalog ของร้าน',
  parameters: {
    type: 'object',
    properties: { productId: { type: 'string' }, variantId: { type: ['string', 'null'] }, quantity: { type: 'integer' } },
    required: ['productId', 'variantId', 'quantity'],
    additionalProperties: false,
  },
  strict: true,
}] as const;

let input = [...baseInput];
for (let round = 0; round < 4; round++) {
  const r = await openai.responses.create({ model, input, tools, tool_choice: 'auto', parallel_tool_calls: true, store: false, reasoning: { effort: 'low' } });
  input.push(...r.output);                     // ต้องส่ง reasoning item + function_call กลับไปด้วย
  const calls = r.output.filter((it) => it.type === 'function_call');
  if (calls.length === 0) return r;            // คำตอบสุดท้าย
  for (const c of calls) {
    const args = safeJson(c.arguments);        // arguments เป็น JSON string → validate ด้วย zod
    const result = await runTool(c.name, args);
    input.push({ type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(result) });
  }
}
```

- **strict mode:** ทุก property ต้องอยู่ใน `required`, ทุก object ต้องมี `additionalProperties:false`, field ที่ไม่บังคับให้เป็น union กับ `"null"` · ถ้าไม่ใส่ `strict` Responses จะลอง strict แล้ว fallback
- output item ของ tool: `{ type:'function_call', id, call_id, name, arguments }`
- **reasoning item ต้องส่งกลับพร้อม tool output** (ไม่งั้น turn ถัดไปพัง) · ใช้ `store:false` แล้วส่ง item ทั้งหมดกลับเอง (เอกสารยังไม่ยืนยันว่า `previous_response_id` ใช้กับ `store:false` ได้ → ไม่ใช้ `previous_response_id`)
- `include: ['reasoning.encrypted_content']` ส่งได้ไม่เสียหาย แต่**ทดสอบแล้วไม่จำเป็น**: terra/sol ที่ effort `low` + `store:false` ไม่คืน reasoning item ใน `output` เลย (นับ `reasoning_tokens` อย่างเดียว) และ tool loop ที่ไม่ใส่ `include` ก็ทำงานถูก · ยังต้องส่ง `output` ทั้งหมดกลับเหมือนเดิม เผื่อ effort สูงขึ้นแล้วมี reasoning item
- ทดสอบแล้ว: terra เรียก tool **2 ตัวพร้อมกันในรอบเดียว** (parallel) และจบใน 3 รอบ (search → price → ตอบ) ประมาณ 5–7 วินาทีต่อ turn รวม classifier
- `parallel_tool_calls` ค่าเริ่มต้น `true` · `tool_choice`: `'auto'` | `'none'` | `'required'` | `{type:'function', name}` | `allowed_tools` (จำกัด tool โดยไม่เปลี่ยนรายการ tools เพื่อให้ cache ยังโดน) · ให้มี tool ไม่เกิน ~20 ตัว
- งบ tool ต่อ turn ตาม F10 brief: ≤4 call รวม parallel เกินแล้วตอบจากข้อมูลที่มี

### 3.3 Structured Outputs (classifier, extraction)

```ts
const r = await openai.responses.create({
  model: process.env.OPENAI_CHAT_MODEL_FAST!,      // gpt-6.2-sol
  input: [{ role: 'developer', content: CLASSIFIER_RULES }, { role: 'user', content: text }],
  reasoning: { effort: 'low' },                    // Sol ไม่รับ 'none' (400)
  text: { format: { type: 'json_schema', name: 'intent', strict: true, schema: {
    type: 'object',
    properties: { label: { type: 'string', enum: ['PRICE', 'PRODUCT', 'ESCALATION', 'OTHER'] }, confidence: { type: 'number' } },
    required: ['label', 'confidence'], additionalProperties: false,
  } } },
  store: false,
});
const parsed = JSON.parse(r.output_text);          // แล้ว validate ด้วย zod
```

- หรือใช้ `openai.responses.parse({ ..., text: { format: zodTextFormat(Schema, 'intent') } })` จาก `openai/helpers/zod` แล้วอ่าน `r.output_parsed`
- model ปฏิเสธ = content item ชนิด `'refusal'` → `finishReason:'content_filter'`

### 3.4 Streaming (ไม่จำเป็นในวันงาน)

`stream: true` แล้ว `for await (const e of stream)` · event: `response.created`, `response.output_text.delta`, `response.output_item.added` / `.done`, `response.function_call_arguments.delta` / `.done`, `response.completed`, `error` · Demo Chat ส่งคำตอบทีเดียวได้ จึงไม่ต้อง stream

### 3.5 Usage → `model_usage`

```
usage.input_tokens
usage.input_tokens_details.cached_tokens
usage.input_tokens_details.cache_write_tokens
usage.output_tokens
usage.output_tokens_details.reasoning_tokens
usage.total_tokens
```

ต้นทุน = (input − cached − cache_write) × input + cached × cachedInput + cache_write × input × 1.25 + output × output (หาร 1M) · ไม่มีราคาใน `MODEL_PRICE_TABLE` → `costUsdMicros: null`, `costReason:'no_rate'` · เก็บ `r.id` และ header `x-request-id` (SDK: `error.requestID`)

### 3.6 Error และ retry

| สถานะ | ความหมาย | core ทำอะไร |
|---|---|---|
| 400 `BadRequestError` | schema/พารามิเตอร์ผิด (เช่น ส่ง effort `none` ให้ Sol) | ไม่ retry · log · `PROVIDER_UNAVAILABLE` retryable false |
| 401 / 403 | key ผิด, project ไม่มีสิทธิ์ model | ไม่ retry · แจ้งบนบอร์ด |
| 429 rate limit / `slow_down` / 503 `server_is_overloaded` | ชั่วคราว | retry 1 ครั้งตาม `Retry-After` + jitter ภายใน deadline เดิม → `RATE_LIMITED` |
| 429 `insufficient_quota`: `credit_balance_exhausted`, `project_spend_limit_exceeded`, `organization_spend_limit_exceeded`, `organization_usage_limit_exceeded` | เงินหมด / ชน hard limit | **ห้าม retry** · `PROVIDER_BUDGET_EXHAUSTED` · โพสต์ `BLOCKED @lead` · bot ส่งต่อ staff |
| 5xx, timeout, `APIConnectionError` | ชั่วคราว | retry 1 ครั้ง |

body ของ error: `{ error: { message, type, param, code } }` · SDK class: `BadRequestError`, `AuthenticationError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `UnprocessableEntityError`, `RateLimitError`, `InternalServerError`, `APIConnectionError` (มี `.status`, `.headers`, `.requestID`)

## 4. Embeddings

```ts
const r = await openai.embeddings.create({
  model: process.env.OPENAI_EMBED_MODEL!,           // text-embedding-3-large
  input: chunks,                                    // string[]
  dimensions: Number(process.env.EMBED_DIM),        // 1536
});
r.data.map((d) => d.embedding);                     // ยาว 1536, length 1 แล้ว
r.usage.prompt_tokens;
```

- จำกัดต่อ request: **≤8,192 token ต่อ input, ≤2,048 input, รวม ≤300,000 token** → core แบ่ง batch ละ ≤256 chunks
- vector ถูก normalize เป็นความยาว 1 แล้ว: dot product = cosine ใช้ `<=>` (cosine distance) ของ pgvector
- ไม่มี `input_type` แยก document/query แบบ Cohere ใช้ model เดียวกันทั้งสองฝั่ง (`purpose` ใน contract ใช้แค่บันทึก usage)
- **ภาษาไทยไม่มีเว้นวรรคระหว่างคำ:** แบ่ง chunk ตามจำนวน token/ตัวอักษร (~500–800 token, overlap ~80) ไม่ใช่ตามช่องว่าง
- HNSW index ของ pgvector รองรับ `vector` ไม่เกิน 2,000 มิติ (UNCONFIRMED จากเอกสาร pgvector) 1536 จึงใช้ได้ · ร้านทดสอบข้อมูลน้อย exact scan ก็พอ
- threshold ของ Papi (`IDK_RETRY_MAX_TOP_SIM` 0.6 ฯลฯ) จูนกับ Cohere/Gemini → **วัดใหม่** ด้วย fixture ของ SPEC อย่าคัดค่าเดิม
- rate limit (Build → Launch): 5,000 → 10,000 RPM, 1M → 5M TPM

## 5. Rerank

OpenAI ไม่มี rerank endpoint (มีแค่ `ranking_options` ใน `file_search` ของ vector store ซึ่งเราไม่ใช้) วิธีที่แนะนำถ้า F07 ทัน: ดึง top 20 ด้วย cosine จาก pgvector แล้วเรียก `model:'fast'` (effort ต่ำสุด) ด้วย strict schema `{ ids_ranked: string[] }` ที่รับเฉพาะ id ที่ส่งไป ถ้า call ล้ม ใช้ลำดับ cosine เดิม

## 6. Moderation

```ts
const m = await openai.moderations.create({
  model: process.env.OPENAI_MODERATION_MODEL!,      // omni-moderation-latest
  input: [{ type: 'text', text }, { type: 'image_url', image_url: { url: dataUrl } }],
});
m.results[0].flagged; m.results[0].categories; m.results[0].category_scores;
```

- **ฟรี** · รูปไม่เกิน 20 MB · หมวด: harassment, harassment/threatening, hate, hate/threatening, illicit, illicit/violent, sexual/minors (text เท่านั้น), self-harm (+/intent, /instructions), sexual, violence, violence/graphic
- เอกสารไม่ระบุว่ารองรับภาษาไทยดีแค่ไหน → ใช้เป็นสัญญาณเตือนของ F05/F06/F12 ไม่ใช่ตัวบล็อกเดียว
- rate limit (Build → Launch): 500 → 2,000 RPM, 20k → 250k TPM

## 7. Vision: สลิปและรูปสินค้า

```ts
input: [{ role: 'user', content: [
  { type: 'input_text', text: 'อ่านสลิปโอนเงินนี้ ตอบเป็น JSON ตาม schema' },
  { type: 'input_image', image_url: `data:image/jpeg;base64,${b64}`, detail: 'high' },
] }]
```

- รูปแบบ: PNG, JPEG, WEBP, GIF ที่ไม่เคลื่อนไหว · URL หรือ base64 data URL หรือ `file_id` (purpose `vision`) · `detail`: `low` | `high` | `original` | `auto`
- payload ≤512 MB และ ≤1,500 รูปต่อ request · รูปเกิน 30,000 patch ถูกปฏิเสธ · ต้นทุนคิดตาม patch 32×32 px (multiplier ของ terra UNCONFIRMED ให้ smoke test อ่านจาก `usage`)
- **ข้อจำกัดที่เอกสารเตือน:** อ่านตัวอักษรที่ไม่ใช่ละตินและข้อความเอียงได้ไม่ดีเท่า → F14 ใช้ strict schema `{ amountSatang, transferredAt, bankRef, receiverName, receiverAccountMasked, confidence }` แล้ว **ตรวจในโค้ด**: ยอดตรงกับออเดอร์, ผู้รับตรงกับร้าน (ชื่อ + 4 หลักท้ายที่**โค้ดตัดเองจาก `receiverAccountMasked`**), `bankRef` ไม่ซ้ำ (unique index) · ไม่มั่นใจหรือไม่ตรง → `verifying_payment` ให้ staff กดยืนยัน · โหมดนี้คือ **S** (ไม่ได้ยืนยันกับธนาคาร) ห้ามอ้างว่าตรวจกับธนาคารแล้ว
- ทดสอบแล้วกับสลิปไทยสังเคราะห์: ยอด, เวลา (แปลง พ.ศ. → `2026-11-20T14:32:00+07:00` ให้เอง), เลขรายการ, ชื่อผู้โอน/ผู้รับถูกทั้งหมด confidence 0.98–0.99 · **แต่ถ้าขอ `receiverAccountLast4` ตรง ๆ model คืน `null`** จากเลขแบบ `xxx-x-x1234-x` จึงให้คัดเลขที่เห็นแล้วตัดในโค้ด · ~1,080 input token ต่อสลิป (~$0.002, ครั้งที่สองโดน cache)

## 8. PDF และไฟล์

```ts
{ type: 'input_file', filename: 'menu.pdf', file_data: `data:application/pdf;base64,${b64}` }
```

- ต่อไฟล์ <50 MB และรวม <50 MB ต่อ request ไม่ต้อง upload ผ่าน Files API ก่อน · ไม่ระบุจำนวนหน้าสูงสุด
- PDF ถูกอ่านเป็น text + รูปของแต่ละหน้า (กิน token มาก) · docx/xlsx ได้แค่ text → F06 parse PDF ดิจิทัล/CSV/XLSX เองก่อน แล้วส่ง text ให้ `model:'fast'` · ส่ง `input_file` เฉพาะ PDF ที่เป็นภาพสแกน (stretch)
- Files API (ถ้าใช้): purpose `user_data` สำหรับ input ของ model, ≤512 MB ต่อไฟล์, ตั้ง `expires_after` 1 ชม.–30 วัน

## 9. Prompt caching และข้อมูล

- cache **อัตโนมัติ** เมื่อ prefix ที่เหมือนกัน ≥1,024 token · อ่าน cache คิด 0.05× input (terra/sol) หรือ 0.1× (luna) · เขียน cache 1.25× (30 นาที) หรือ 2.5× (12 ชม.)
- วิธีให้โดน cache: `developer` prompt + รายการ tools คงที่และอยู่หน้าสุด, ต่อข้อความใหม่ท้าย, ใช้ `allowed_tools` แทนการลบ tool, ตั้ง `prompt_cache_key: 'biz:<businessId>'`
- cached token ยังนับใน TPM · `prompt_cache_retention` เลิกใช้แล้ว (ใช้ `prompt_cache_options: { ttl: '30m' | '12h' }` ถ้าจำเป็น)
- ข้อมูล API ไม่ถูกใช้ train เป็นค่าเริ่มต้น · Responses `store` ค่าเริ่มต้น `true` (เก็บ 30 วัน) → **core ส่ง `store:false` ทุก call** เพราะมีข้อความลูกค้าและสลิป

## 10. Voice

### 10.1 ค่าเริ่มต้น

| env | ค่า | ใช้ทำอะไร |
|---|---|---|
| `OPENAI_REALTIME_MODEL` | **`gpt-realtime-2.1`** (dev/ซ้อม: `gpt-realtime-2.1-mini`) | F30: ลูกค้าคุยกับ AI ของร้านใน browser (speech-to-speech + function tools) |
| `OPENAI_REALTIME_VOICE` | `marin` (หรือ `cedar`) | เสียงตอบ เปลี่ยนไม่ได้หลังตอบเสียงครั้งแรก |
| `OPENAI_REALTIME_TRANSCRIBE_MODEL` | `gpt-live-transcribe` | ถอดคำพูดลูกค้าระหว่าง session (`languages:['th']`) เพื่อแสดง caption และบันทึกใน inbox |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-transcribe` | ถอดข้อความเสียงที่ลูกค้าส่งมาทาง LINE/Messenger/IG (ไฟล์) |
| `OPENAI_TTS_MODEL` | ว่าง (ไม่ใช้) | TTS ทุกรุ่นถูก deprecate (ปิด 6 ม.ค. 2570) · ถ้าต้องการเสียงให้ใช้ Realtime |
| `VOICE_MAX_SECONDS` / `VOICE_DAILY_SECONDS` | 120 / 900 | กันค่าใช้จ่ายของ demo tenant (ไม่ใช่โควตาลูกค้า) |

- `gpt-realtime-2.1` (ออก 6 ก.ค. 2569, GA) · context 128,000 · output สูงสุด 32,000 · `reasoning.effort`: `minimal` | `low` (ค่าเริ่มต้น) | `medium` | `high` | `xhigh` · session ยาวสุด **60 นาที** · `gpt-realtime` / `gpt-realtime-mini` รุ่นเก่าปิด 20 ม.ค. 2570
- **ราคา (USD ต่อ 1M token):** 2.1 audio in $32 / cached $0.40 / out $64, text in $4 / cached $0.40 / out $24 · 2.1-mini audio $10 / $0.30 / $20, text $0.60 / $0.06 / $2.40 · เสียงลูกค้า 1 token ต่อ 100 ms, เสียง AI 1 token ต่อ 50 ms · **ประมาณ $0.05–0.10 ต่อนาทีสนทนา** (mini ~$0.02–0.03) + ถอดเสียง ~$0.017/นาที · ทดสอบ 30 นาที ≈ $2–4
- rate limit: Build 400 RPM / 200k TPM, Launch 10,000 / 4M · เอกสารไม่ระบุเพดาน session พร้อมกัน (UNCONFIRMED)
- **ทางเลือกที่ไม่ใช้ในวันงาน:** `gpt-live-1.1` (ออก 19 พ.ย. 2569, `POST /v1/live/sessions`) เอกสาร Audio แนะนำสำหรับแอปเสียงใหม่ แต่ส่ง tool ไปให้ model ตัวอื่นและ event คนละชุด ใหม่เกินไปสำหรับงานหนึ่งวัน
- **ภาษาไทย: ทดสอบแล้วใช้ได้** (OpenAI ไม่ได้ประกาศรายการภาษา): `gpt-live-transcribe` ถอดคำพูดไทยถูกทั้งประโยค และ `gpt-realtime-2.1` พูดไทยเรียก tool แล้วตอบ "รวม 130 บาทค่ะ" ถูก · เขียน `instructions` เป็นภาษาไทย สั่งชัดว่าตอบภาษาไทยและใช้คำลงท้าย "ค่ะ" · เริ่มด้วย `server_vad` (ยังไม่ได้ลอง `semantic_vad`)
- **`gpt-realtime-2.1-mini` ไม่ใช้ใน demo:** ทดสอบแล้วอ่านราคาเป็น "13,000 สตางค์" แทน 130 บาท และใช้ "ผม" ปนกับ "ค่ะ" · ใช้ได้แค่ตอน dev · **tool ของเสียงต้องคืนราคาเป็นข้อความบาทพร้อมพูด** (เช่น `total: "130 บาท"`) ไม่คืนแค่สตางค์

### 10.2 Flow ของ F30 (WebRTC)

```
browser (F30 page)                  server (core + F30)                         OpenAI
  กดปุ่ม "คุยกับร้าน" ─────────────► POST /api/v1/voice/sessions
                                      core.model.createRealtimeSession() ──────► POST /v1/realtime/client_secrets
                                      (instructions + tools ของร้าน, TTL 600 s)  ◄── { value: "ek_…", expires_at }
  ◄──────────────── { clientSecret, voiceSessionId, expiresAt }
  RTCPeerConnection + mic + data channel "oai-events"
  POST /v1/realtime/calls (Bearer ek_…, application/sdp) ─────────────────────► answer SDP
  เสียงไป-กลับผ่าน media track · event ผ่าน data channel
  response.done มี function_call ─► POST /api/v1/voice/sessions/:id/tools  (server validate + scope ตาม session)
  ◄──────────────── result
  conversation.item.create (function_call_output) + response.create ──────────►
  response.done.usage ─────────────► POST /api/v1/voice/sessions/:id/usage → model_usage
```

- **API key หลักห้ามไปถึง browser** browser ได้แค่ ephemeral key (`ek_…`) ที่ core ออกให้
- tool ที่ browser ขอให้รัน **ต้องผูกกับ `voiceSessionId` ที่ server สร้าง** (business, customer, เวลาหมดอายุ) และ validate args ทุกครั้ง เพราะ client แก้ข้อมูลได้ · tool ชุดเดียวกับ F10: `search_knowledge`, `get_price`, `find_slots`, `create_booking` (ต้องให้ลูกค้ายืนยันก่อน เหมือนแชต)
- server ตัด session เมื่อครบ `VOICE_MAX_SECONDS` (ไม่ออก key ใหม่ + บอก browser ให้ปิด) · ทางที่ปลอดภัยกว่า (ถ้าทัน): unified interface ที่ server รับ SDP แล้วต่อ sideband WebSocket `wss://api.openai.com/v1/realtime?call_id=rtc_…` เพื่อรัน tool ฝั่ง server เอง
- mic ใช้ได้เฉพาะ HTTPS หรือ `localhost` · เล่นเสียงต้องเริ่มจากการกดของผู้ใช้ · ใน iframe ต้องมี `allow="microphone"`

### 10.3 สร้าง client secret (core, ฝั่ง server)

```ts
const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'OpenAI-Safety-Identifier': sha256(customerId) },
  body: JSON.stringify({
    expires_after: { anchor: 'created_at', seconds: 600 },        // 10–7200 วินาที
    session: {
      type: 'realtime',                                             // จำเป็นใน GA
      model: process.env.OPENAI_REALTIME_MODEL,                    // gpt-realtime-2.1
      instructions: shopVoiceInstructionsTh,                       // ภาษาไทย ตอบสั้น ใช้ tool
      output_modalities: ['audio'],
      reasoning: { effort: 'low' },
      max_output_tokens: 1024,
      tools: voiceTools, tool_choice: 'auto',
      audio: {
        input: {
          transcription: { model: process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL, languages: ['th'] },
          turn_detection: { type: 'server_vad', silence_duration_ms: 600, create_response: true, interrupt_response: true },
          noise_reduction: { type: 'far_field' },
        },
        output: { voice: process.env.OPENAI_REALTIME_VOICE },
      },
    },
  }),
});
const { value, expires_at } = await r.json();                       // ส่งแค่ value + expires_at ให้ browser
```

SDK เทียบเท่า: `openai.realtime.clientSecrets.create({...})` (openai ≥ 7.62.0) · ห้ามใส่ header `OpenAI-Beta: realtime=v1` (ปิดแล้ว) · ไม่มี `temperature` ใน GA · tool ใน realtime ใช้ `{ type:'function', name, description, parameters }`

### 10.4 Browser

```ts
const { clientSecret } = await (await fetch('/api/v1/voice/sessions', { method: 'POST' })).json();
const pc = new RTCPeerConnection();
const audio = new Audio(); audio.autoplay = true;
pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
pc.addTrack(mic.getTracks()[0], mic);
const dc = pc.createDataChannel('oai-events');
dc.addEventListener('message', async (e) => {
  const ev = JSON.parse(e.data);
  if (ev.type === 'error') return report(ev.error);
  if (ev.type === 'conversation.item.input_audio_transcription.completed') showCaption('customer', ev.transcript);
  if (ev.type !== 'response.done' || ev.response.status !== 'completed') return;
  postUsage(ev.response.usage);
  const calls = (ev.response.output ?? []).filter((o) => o.type === 'function_call');
  if (!calls.length) return;
  for (const c of calls) {
    const result = await runToolOnServer(c.name, c.arguments);      // POST /api/v1/voice/sessions/:id/tools
    dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(result) } }));
  }
  dc.send(JSON.stringify({ type: 'response.create' }));             // ครั้งเดียวหลังส่งผลครบ
});
const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
const ans = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' } });
await pc.setRemoteDescription({ type: 'answer', sdp: await ans.text() });
```

รอ `response.done` ก่อนส่ง `response.create` เพื่อไม่ชนกับ response ที่ยัง active · ตัดเสียงเอง: `response.cancel` แล้ว `output_audio_buffer.clear` (WebRTC) · ทางเลือกระดับสูง: `@openai/agents` (`RealtimeAgent`, `RealtimeSession`) แต่ต้องเพิ่ม library ตอน setup

### 10.5 Event ที่ใช้ (ชื่อแบบ GA)

| ทิศ | event |
|---|---|
| client → server | `session.update`, `input_audio_buffer.commit` / `.clear`, `conversation.item.create`, `response.create`, `response.cancel`, `output_audio_buffer.clear` |
| server → client | `session.created` / `.updated`, `input_audio_buffer.speech_started` / `.speech_stopped` / `.committed`, `conversation.item.added` / `.done`, `conversation.item.input_audio_transcription.delta` / `.completed`, `response.created`, `response.output_item.added` / `.done`, `response.output_audio_transcript.delta` / `.done`, `response.function_call_arguments.delta` / `.done`, `response.done`, `output_audio_buffer.started` / `.stopped` / `.cleared`, `rate_limits.updated`, `error` |

ชื่อแบบ beta ที่ห้ามใช้: `response.audio.delta`, `response.audio_transcript.delta`, `response.text.delta`, `modalities`, `voice` ที่ระดับบน, `input_audio_transcription`, `turn_detection` ที่ระดับบน

### 10.6 Usage ของเสียง

`response.done.response.usage`: `input_tokens`, `output_tokens`, `input_token_details.{text_tokens, audio_tokens, image_tokens, cached_tokens, cached_tokens_details}`, `output_token_details.{text_tokens, audio_tokens}` · ต้นทุน = text และ audio คิดแยกตามอัตรา §10.1 · ถอดเสียงอ่าน `usage` จาก `conversation.item.input_audio_transcription.completed` · บันทึกลง `model_usage` (purpose `voice.turn`, `voice.transcribe`)

### 10.7 ถอดเสียงจากไฟล์ (ข้อความเสียงในแชต)

```ts
import { toFile } from 'openai';
const t = await openai.audio.transcriptions.create({
  model: process.env.OPENAI_TRANSCRIBE_MODEL!,                       // gpt-transcribe
  file: await toFile(buffer, 'voice.m4a'),                           // ต้องมีนามสกุล
  languages: ['th'],
});
t.text; t.usage;                                                     // { type:'duration', seconds }
```

- `multipart/form-data` ไฟล์ ≤25 MB · รองรับ flac, mp3, mp4, mpeg, mpga, **m4a**, ogg, wav, webm (`.aac` ดิบไม่อยู่ในรายการ) · ราคา ~$0.0045/นาที
- LINE: ดาวน์โหลดจาก `GET https://api-data.line.me/v2/bot/message/{id}/content` (ไฟล์เป็น m4a: UNCONFIRMED ให้ลองกับ test OA)
- `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` ถูก deprecate (ปิด 26 ก.พ. 2570) ห้ามใช้

## 11. Rate limit, tier และ hard limit

| Tier | เงื่อนไข (ยอดซื้อสะสม) | วงเงินใช้ต่อเดือน |
|---|---|---|
| Free | — | US$100 |
| Build | ซื้อ ≥US$5 | US$500 |
| Launch | ซื้อ ≥US$100 | US$5,000 |
| Grow | ซื้อ ≥US$500 | US$200,000 |

- ขึ้น tier อัตโนมัติ เครดิต US$100 น่าจะได้ Launch (ช่วงรอหลังได้เครดิตยัง UNCONFIRMED: ดู Settings → Limits)
- rate limit ต่อ model (Build → Launch): `gpt-6-luna` 5k → 10k RPM, 2M → 10M TPM · `gpt-6.1-terra`, `gpt-6.2-sol`, `gpt-6.2-astra` 5k → 10k RPM, 1M → 4M TPM · tier ที่จ่ายเงินไม่มีจำกัดต่อวัน
- header: `x-ratelimit-limit-requests`, `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens` (+ `*-project-tokens` ถ้ามี limit ระดับ project) และ `Retry-After`
- **hard limit:** Project settings → Limits → Edit spend limit → เปิด "Enforce a hard limit" เกินแล้วได้ 429 `project_spend_limit_exceeded` การตัดไม่ทันทีจึงตั้งเผื่อ · การแจ้งเตือนอย่างเดียวไม่หยุด traffic
- organization verification: **ไม่ต้อง** สำหรับทุก model ที่แผนใช้ (ทดสอบด้วย key จริง 20 พ.ย. ทุกตัวตอบ 200) · key ที่ทดสอบอยู่ tier Launch (header บอก 10,000 RPM / 4M TPM บน `gpt-6.1-terra`)

## 12. ของที่เลิกใช้แล้ว ห้ามเขียน

| อย่าใช้ | เหตุผล |
|---|---|
| Assistants API (`assistants`, `threads`) | ปิดแล้ว 26 ส.ค. 2569 |
| header `OpenAI-Beta: realtime=v1`, `assistants=v1` | ปิดแล้ว |
| `o1`, `o1-pro`, `o3-mini`, `o4-mini`, `gpt-4.1-nano`, `gpt-4o-2024-05-13` | ปิดแล้ว 23 ต.ค. 2569 |
| `*-chat-latest`, `*-codex`, `dall-e-2`, `dall-e-3`, `text-moderation-*` | ปิดแล้ว |
| `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `o3`, `o3-pro` | ปิด 11 ธ.ค. 2569 |
| snapshot `gpt-4o-*`, `gpt-4.1-*` (รวม `gpt-4o-mini-2024-07-18`) | ปิด 14 ม.ค. 2570 |
| `/v1/prompts`, Evals, Agent Builder | ปิด 30 พ.ย. 2569 |
| พารามิเตอร์ `user`, `prompt_cache_retention`, `reasoning.generate_summary`, `temperature`/`top_p` บน GPT-6.x | เลิกใช้ / ให้ละไว้ |
| Node 20 | SDK ไม่รองรับแล้ว (เราใช้ Node 24) |

## 13. contract ของ core ที่เปลี่ยน

`model.*` ใน [contracts.ts](competition-plan/templates/contracts.ts) (เจ้าของ C1) ต้องรองรับ:

- `model.chat()` → Responses API · `model` เป็น `'chat' | 'fast' | 'strong'` · role `developer` แทน `system` (core รับ `system` แล้วส่งเป็น developer) · `messages[].content` เป็น string หรือ parts (`text`, `image` data URL/upload ref, `file` PDF) · `reasoningEffort?: 'none' | 'low' | 'medium'` (core แปลง `none` เป็น `low` เองถ้า model ไม่รับ) · ไม่มี `temperature`
- tool loop: ผลลัพธ์มี `toolCalls` (`id` = `call_id`) และ `providerState` (ทึบ) ที่ผู้เรียกต้องส่งกลับใน `model.chat()` รอบถัดไปพร้อมข้อความ `{ role:'tool', toolCallId, content }` เพื่อให้ core ส่ง reasoning item กลับให้ OpenAI ครบ
- `ModelUsage` เพิ่ม `reasoningTokens` และ `cacheWriteTokens`
- `model.embed()` → `text-embedding-3-large` + `dimensions: EMBED_DIM`
- `model.moderate({ text?, images? })` → `{ flagged, categories }`
- `model.transcribe({ audio, languages })` และ `model.createRealtimeSession()` + `model.recordRealtimeUsage()` สำหรับเสียง ([§10](#10-voice))
- 429 กลุ่ม `insufficient_quota` → `AppError('PROVIDER_BUDGET_EXHAUSTED')` (ไม่ retry) · 429 อื่น → `RATE_LIMITED`
- ทุกตัวเขียน `model_usage` และมี fake mode ที่ deterministic

## 14. Smoke test ก่อนวันงาน

**ทางหลัก: [tools/openai-check](../tools/openai-check/)** (ชุดทดสอบเดียวกับ §15) ใส่ `OPENAI_API_KEY=` ใน `..\nless.secrets.env` (นอก repo) แล้วรัน:

```powershell
cd tools/openai-check; npm ci; npm run fixtures; npm run check
```

ได้ PASS/FAIL ทุกข้อ + ต้นทุน (ประมาณ $0.08 ต่อรอบ) · `npm run site` เปิดหน้าเว็บที่ http://localhost:5199 เพื่อลอง flow ทั้งหมด (คลังความรู้ → Demo Chat → inbox/takeover → สลิป → ถอดเสียง → คุยเสียง WebRTC → ตาราง usage) · key อยู่ฝั่ง server เท่านั้น

ทางสำรองถ้าไม่มี Node (PowerShell, ไม่พิมพ์ key ออกจอ) ทุกบรรทัดต้องได้ 200:

```powershell
$h = @{ Authorization = "Bearer $env:OPENAI_API_KEY"; 'Content-Type' = 'application/json' }
foreach ($m in 'gpt-6.2-sol') {                       # model เดียวของทุก alias
  $effort = 'low'
  $body = @{ model = $m; input = 'ตอบคำเดียวว่า สวัสดี'; reasoning = @{ effort = $effort }; max_output_tokens = 50; store = $false } | ConvertTo-Json -Depth 5
  $r = Invoke-RestMethod -Method Post -Uri 'https://api.openai.com/v1/responses' -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($body))
  "$m -> $($r.status) in=$($r.usage.input_tokens) out=$($r.usage.output_tokens)"
}
$e = @{ model = 'text-embedding-3-large'; input = @('ทดสอบ'); dimensions = 1536 } | ConvertTo-Json
$er = Invoke-RestMethod -Method Post -Uri 'https://api.openai.com/v1/embeddings' -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($e))
"embed dim=$($er.data[0].embedding.Count)"     # ต้องได้ 1536
$mo = @{ model = 'omni-moderation-latest'; input = 'สวัสดี' } | ConvertTo-Json
"moderation flagged=$((Invoke-RestMethod -Method Post -Uri 'https://api.openai.com/v1/moderations' -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($mo))).results[0].flagged)"
```

บันทึกผลใน `SOURCE-BASELINE.md` (model ไหนใช้ได้, tier, rate limit ที่เห็นใน Settings → Limits) ถ้า model ไหนได้ 403/404 ให้ใช้รุ่นที่ใช้ได้ที่ใกล้ที่สุดแล้วแก้ `.env.example`

## 15. ผลทดสอบจริง 20 พ.ย. 2569

ยิง OpenAI API จริงด้วย key ของทีม (tier Launch) ผ่าน [tools/openai-check](../tools/openai-check/): **CLI 27/28 ผ่าน + flow ทั้งหมดบนหน้าเว็บผ่าน** ใช้เงินรวมประมาณ **US$0.15** (ถอดเสียงและ TTS ไม่ได้คิดราคาในตาราง) · ไฟล์ทดสอบเป็นข้อมูลสังเคราะห์ทั้งหมด

| เรื่อง | ผล |
|---|---|
| model ที่แผนใช้ | key เห็นครบทั้ง 13 ตัว (`gpt-6.2-astra/sol`, `gpt-6.1-terra`, `gpt-6-luna`, `text-embedding-3-large/small`, `omni-moderation-latest`, `gpt-realtime-2.1(-mini)`, `gpt-live-transcribe`, `gpt-transcribe`, `gpt-4o-mini-tts`, `gpt-live-1.1`) ไม่ต้อง verify organization |
| SDK | `openai@7.62.0` มี `responses.create/parse`, `zodTextFormat`, `toResponseInputItems`, `realtime.clientSecrets.create`, `audio.transcriptions`, `moderations` · ถ้าใช้ WebSocket ฝั่ง server ต้องลง `ws@^8.21.0` (peer ของ SDK) |
| แชต (`gpt-6.1-terra`, effort low) | ตอบไทยถูก ~1.5–2.5 s ต่อ call · `usage` มี `input_tokens_details.cached_tokens`, `cache_write_tokens` (+ แยก TTL), `output_tokens_details.reasoning_tokens` ตาม §3.5 |
| effort `none` | luna, terra รับ · **sol ตอบ 400 `unsupported_value`** (core ต้อง map เป็น `low`) |
| `temperature` | luna, terra รับ · **sol ตอบ 400** → ไม่ส่งเลย |
| classifier (`gpt-6-luna`, effort none, strict enum) | ถูก 4/4 ประโยคไทย ~$0.00002 ต่อ call ~1–2 s |
| `responses.parse` + zod | ดึงออเดอร์ไทย (สินค้า, ไซซ์, จำนวน, ที่อยู่, เบอร์) ได้ครบ |
| tool loop | terra 3 รอบ เรียก 2 tool พร้อมกันได้ ราคา 130 บาทถูก · sol ก็ถูก (140 บาท) · ไม่มี reasoning item คืนมา · ไม่ใส่ `include` ก็ใช้ได้ |
| prompt caching | prefix 1.8k token: ครั้งแรก `cache_write_tokens` 1,828 · ครั้งที่สอง `cached_tokens` 1,819 |
| streaming | event: `response.created`, `.in_progress`, `.output_item.added/.done`, `.content_part.added/.done`, `.output_text.delta/.done`, `.completed` |
| vision: สลิป | ยอด/เวลา/เลขรายการ/ชื่อถูก · last4 ต้องตัดในโค้ด (§7) · ตรวจสลิปซ้ำทำงาน |
| vision: รูปสินค้า | บอกชื่อและราคาจากรูปถูก |
| PDF สแกน 2 หน้า | ดึงราคาได้ครบ 8 แถว แต่กิน **~25,600 input token (~$0.03)** → parse เองก่อนตามแผน ส่ง `input_file` เฉพาะ PDF สแกน |
| error | model ไม่มีจริง → 404 `model_not_found` · schema strict ผิด → 400 `invalid_json_schema` |
| embeddings | ทั้งสองรุ่นได้ 1536 มิติ ความยาว 1.0000 · ชุดทดสอบไทย 4 คำถาม: **small 4/4, large 3/4** (large พลาด "กาแฟนมเย็นแก้วกลาง") ตัวอย่างน้อยเกินตัดสิน → B1 วัดด้วย fixture ของ SPEC ทั้งสองรุ่นตอนเช้า (ถูกและเร็ว) แล้วเลือกผ่าน `OPENAI_EMBED_MODEL` ก่อน index จริง · ใน flow จริงที่มีคำว่า "ไซซ์กลาง" large ค้นถูก |
| moderation | ข้อความปกติไม่ติด · ข้อความขู่ทำร้ายติด `harassment`, `harassment/threatening`, `violence` · รูปสินค้าไม่ติด · ฟรี |
| ถอดเสียง (`gpt-transcribe`, `languages:['th']`) | ถอดประโยคไทยถูกทั้งประโยค ~1 s · `usage: { type:'duration', seconds }` · ไฟล์ m4a จาก LINE ยังไม่ได้ลอง |
| Realtime client secret | `POST /v1/realtime/client_secrets` ได้ `ek_…` อายุ 600 s · session สะท้อนค่า model/voice/transcription ที่ตั้ง |
| Realtime WebSocket | ข้อความไทย → `get_price` → พูด "รวมสองแก้ว 130 บาทค่ะ" · เสียงไทย (pcm 24 kHz) → ถอดถูก → tool → ตอบถูก · ~$0.013–0.021 ต่อคำถามสั้น · mini พูดราคาเป็นสตางค์ (§10.1) |
| Realtime WebRTC (browser) | `POST /v1/realtime/calls` ด้วย `ek_…` ได้ 201 · data channel `oai-events` · server VAD จับประโยคไทยได้ · tool รันที่ server ตาม `voiceSessionId` · AI ตอบ "รวม 130 บาทค่ะ" · ~$0.02 ต่อคำถาม |
| ข้อควรรู้ตอนทดสอบเสียงอัตโนมัติ | ถ้าป้อนไฟล์เสียงแทนไมค์ ต้องผสม noise เบา ๆ ไว้ใต้เสียง ไม่งั้นหลังไฟล์จบ track เงียบสนิทแล้ว VAD ไม่ปิดประโยค (ไมค์จริงไม่มีปัญหานี้) |
| latency ของ turn แชต | ~5–7 s (classifier 1–2 s + tool loop 2–3 call) · ถ้าช้าไปสำหรับ demo: ข้าม classifier เมื่อใช้ tool loop อยู่แล้ว หรือยิง classifier คู่ขนานกับ search |

**รันซ้ำด้วย `gpt-6.2-sol` ทุก alias (20 พ.ย. บ่าย):** text checks 18/18 ผ่าน · classifier 4/4 ~2.6 s และ ~$0.0004 ต่อ call (effort `low`) · tool loop ถูก (130/140 บาท) ~$0.003 ต่อ turn ทดสอบ · **Sol อ่าน 4 หลักท้ายของบัญชีจากสลิปได้เอง** (terra คืน null) แต่ยังตัดในโค้ดตาม §7 เพื่อความชัวร์ · PDF สแกน 2 หน้า ~$0.066 · บนหน้าเว็บ turn แชต **7–11.5 s** (เดิม 5–7 s) และ ~2 เท่าของต้นทุนเดิม → ถ้าช้าไป ให้ยิง classifier คู่ขนานกับ tool loop รอบแรก หรือลด `fast` เป็น luna ผ่าน env

ยังไม่ได้ทดสอบ: ไฟล์เสียง m4a จาก LINE, การตัดเมื่อชน hard limit ของ project, จำนวน Realtime session พร้อมกัน, `semantic_vad` กับภาษาไทย, `gpt-live-1.1`

## แหล่งข้อมูล

- https://developers.openai.com/api/docs/models และหน้า model `gpt-6-luna`, `gpt-6.1-terra`, `gpt-6.2-sol`, `gpt-6.2-astra`, `text-embedding-3-small`, `text-embedding-3-large`, `omni-moderation-latest`
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/migrate-to-responses · /latest-model · /text · /function-calling · /structured-outputs · /streaming-responses · /reasoning · /conversation-state · /prompt-caching
- https://developers.openai.com/api/reference/resources/responses/methods/create · /responses/streaming-events
- https://developers.openai.com/api/docs/guides/rate-limits · /spend-limits · /error-codes
- https://developers.openai.com/api/docs/guides/embeddings · /api/reference/resources/embeddings/methods/create · /guides/retrieval
- https://developers.openai.com/api/docs/guides/moderation · /images-vision · /pdf-files · /your-data · /deprecations
- https://github.com/openai/openai-node (README, CHANGELOG)
- https://www.pinecone.io/learn/openai-embeddings-v3/ (ตัวเลข MIRACL, แหล่งรอง)
- Voice: https://developers.openai.com/api/docs/models/gpt-realtime-2.1 · /models/gpt-realtime-2.1-mini · /guides/realtime · /guides/voice-webrtc · /guides/voice-websockets · /guides/voice-server-controls · /guides/realtime-conversations · /guides/realtime-transcription · /guides/voice-latency-cost · /guides/voice-prompting · /guides/speech-to-text · /guides/text-to-speech · /guides/audio · /guides/live · /docs/changelog
- Voice reference: https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create · /realtime/client-events · /realtime/server-events · /audio/subresources/transcriptions/methods/create
- https://github.com/openai/openai-agents-js (ตัวอย่าง voice agent) · MDN getUserMedia / Autoplay · https://developers.line.biz/en/reference/messaging-api/
