# F30 voice — คุยเสียงบนเบราว์เซอร์

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F30-voice.md](../specs/F30-voice.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P3** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P3` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane** B2 ลำดับ 3/3 (ต่อจาก F10 และ F38) · **เจ้าของ** B · **พึ่ง** F10 (tool และกติกาชุดเดียวกับแชท), F09 (`saveMessage`, `getHistory`), F35 · **timebox** 90–210 นาที
**ให้** หน้า `/voice` (staff demo) และ `/call` (ลูกค้า) + route `POST /api/v1/voice/sessions`, `/voice/sessions/:id/tools`, `/voice/sessions/:id/usage` · **ใช้** `getUser()`, `getBusiness()`, `model.createRealtimeSession()` (core ออก client secret อายุสั้นของ `OPENAI_REALTIME_MODEL` = `gpt-realtime-2.1`, เสียง `OPENAI_REALTIME_VOICE`, ถอดคำพูดลูกค้าด้วย `OPENAI_REALTIME_TRANSCRIBE_MODEL`) และ `model.recordRealtimeUsage()` ซึ่งบันทึก `model_usage` · flow ทั้งหมดอยู่ใน [docs/openai-api.md](../openai-api.md) §10

## Papi files to read (in order)
1. `Backend/services/VoiceGateway/src/papi-call-loop.mjs` (header: VAD → STT → turn เดียวกับแชท → TTS · พิมพ์ = turn เดิมข้าม STT) อ่านเจตนาเท่านั้น ห้าม port STT/TTS provider
2. `Backend/services/VoiceGateway/src/session-limits.mjs` + `session-idle.mjs` (เพดานเวลาและ idle ฝั่ง server)
3. `Backend/services/VoiceGateway/src/voice-metering.mjs` (คิด wall clock, ปัดขึ้น, ไม่คิดซ้ำ)
4. `Backend/services/VoiceGateway/src/auth.mjs` + `business-context.mjs` (ตัวตนจาก token, business เป็นแค่ selector)
5. `Backend/functions/Orchestrator/src/voice-output.mjs` (ข้อความที่พูดได้) + `spoken-price.mjs` ("งบ 5 ร้อย" → 500)
6. `Backend/services/VoiceGateway/src/pending-voice-review.mjs` (ยืนยันออเดอร์/นัดด้วยเสียงต้องมาจาก proposal ที่ server เก็บ)
7. `Database/voicesessions.sql` (status, end_reason) · `Backend/services/VoiceGateway/VOICE_FEATURE_FLAGS.md`
8. `Frontend/src/pages/DemoVoice.tsx`, `CustomerCall.tsx` · `Frontend/src/hooks/useVoiceCall.ts` · `Frontend/src/functions/voiceAudio.ts` · tests: `Backend/services/VoiceGateway/tests/client-vad.test.mjs`, `auth-business-context.test.mjs`, `Backend/tests/orchestrator-voice-response.test.mjs`

## Behaviors to keep
- **กติกาเดียวกับแชท**: `gpt-realtime-2.1` คุยแบบ speech-to-speech แต่ข้อเท็จจริงมาจาก tool ชุดเดียวกับ F10 (`search_knowledge`, `get_price`, `find_slots`, `create_booking` ที่ต้องให้ลูกค้ายืนยันก่อน) ซึ่งรันบน server ของเราผ่าน `/voice/sessions/:id/tools` · instructions เป็นภาษาไทย สั่งตอบไทยเท่านั้น ตอบสั้น และเรียก tool ก่อนพูดราคา/สต็อก/เวลาว่างทุกครั้ง · caption ของลูกค้า (`conversation.item.input_audio_transcription.completed`) และคำตอบ (`response.output_audio_transcript.done`) บันทึกลง inbox ด้วย `saveMessage()` (`triggerAi:false`) · พิมพ์ระหว่าง call (if time) ส่งเป็น `conversation.item.create` แบบ text
- ข้อความที่พูด: ไม่มี URL, markdown หรือ marker ภายใน · แปลงคำพูดตัวเลข ("งบ 5 ร้อย", "พันห้า") เป็นตัวเลขก่อนส่งให้ tool
- ตัวตนมาจาก session ฝั่ง server ไม่ใช่จาก body · `businessId` ใน request เป็นแค่ตัวเลือกแล้วตรวจสิทธิ์ซ้ำ · browser ได้แค่ client secret (`ek_…`) อายุสั้น (≤600 วินาที) ที่ core ออก + `voiceSessionId` ที่ server ผูก business / customer / conversation / เวลาหมดอายุ · ทุก tool call ต้องอ้าง `voiceSessionId` และ validate args ทุกครั้ง (client แก้ข้อมูลได้) · ห้ามส่ง API key หลักไป browser
- เพดานเวลาบังคับที่ server (Papi: 10 นาที + idle 1 นาที + เตือนก่อนหมด 60 วินาที) → ใหม่ใช้ `VOICE_MAX_SECONDS=120`, `VOICE_DAILY_SECONDS=900` (ครบแล้ว server ไม่ออก key ใหม่และสั่ง browser ปิด) · ปิดด้วย `end_reason` ∈ `user|idle_timeout|max_duration|disconnect|error|shutdown`
- metering (ดูต้นทุน ไม่ใช่โควตา): วัด wall clock (เปิดค้างไว้ก็เสียเงิน) · ช่วงเวลา 0 หรือติดลบไม่คิด · บันทึกครั้งเดียวต่อ session ลง `voice_usage` (unique `session_id`) · token จริงมาจาก `response.done.usage` (audio / text แยกอัตรา) ที่ browser ส่งกลับ → `model.recordRealtimeUsage()` → `model_usage` (purpose `voice.turn`, `voice.transcribe`) · ไม่มีนาทีตามแพ็กเกจหรือ credit ที่ซื้อ (ใช้ได้ไม่จำกัด)
- ขัดจังหวะ: `turn_detection` แบบ `server_vad` (`interrupt_response: true`) หยุดคำตอบเมื่อลูกค้าพูดทับ · ตัดเองด้วย `response.cancel` แล้ว `output_audio_buffer.clear` · เก็บ `interrupted` ไว้กับข้อความ · เสียงรบกวนสั้นๆ ไม่ตัดคำตอบ (`silence_duration_ms`, `noise_reduction: far_field`)
- ออเดอร์/นัดด้วยเสียง: อ่านสรุปจาก proposal ที่บันทึกแล้วให้ลูกค้ายืนยัน · transcript หรือข้อความของโมเดลสร้างการยืนยันเองไม่ได้
- ไม่มีโควตาก่อนเปิด session (เพดานมีแค่ `VOICE_MAX_SECONDS` / `VOICE_DAILY_SECONDS` ข้างบน) · หน้าจอบอก mode (`real` / `sandbox`) เสมอ

## Drop / replace
- EC2 VoiceGateway + provider หลายเจ้า (Grok, Gemini, Qwen, Muse STT, Cartesia TTS) → OpenAI Realtime `gpt-realtime-2.1` แบบ speech-to-speech ผ่าน **WebRTC** (browser ↔ OpenAI ด้วย client secret ที่ core ออก, data channel `oai-events`) + tool route บน server ของเรา · ไม่ใช้ TTS model แยก (deprecate แล้ว) และไม่ใช้ `gpt-live-1.1` · ใช้ชื่อ event แบบ GA เท่านั้น ([docs/openai-api.md](../openai-api.md) §10.5) · Lambda pg client และ active-session registry หลายเครื่อง → in-process
- LINE Login ของหน้า `/call` สาธารณะ, companion cards → OUT/if time · voice minutes / pack ที่ซื้อได้ → ตัดออกจาก scope

## Tables
- เป็นเจ้าของ (`-- dependsOn: core`): `voice_sessions` (business_id, conversation_id, user_id, mode, status `starting|active|ending|ended|failed`, end_reason, started_at, ended_at, seconds, model) · `voice_usage` (session_id unique, seconds)
- ข้อความเสียงอยู่ใน messages ผ่าน `saveMessage()` ของ F09 เท่านั้น

## Done when
- SPEC F30: คำพูดใหม่ทำให้ผลเปลี่ยนและตรวจ transcript ได้ · ขัดจังหวะแล้วเสียงหยุด · session ผูก tenant · วินาทีไม่คิดซ้ำ · prerecorded อย่างเดียวไม่ผ่าน live voice
- พูด "A-GAME-01 ราคาเท่าไหร่" ได้ยิน 1,490 บาท และ transcript + คำตอบอยู่ใน inbox · พูด "A-GAME-01 2 ชิ้นรวมเท่าไหร่" ได้ 2,980 บาท
- เกิน `VOICE_MAX_SECONDS` server ปิดเองด้วย `max_duration` · ปิด session ซ้ำไม่บันทึก usage ซ้ำ · user ของร้าน B เปิด session ของร้าน A ไม่ได้

## Status floor
**A** จนกว่าไมค์สด → realtime + tool → เสียงตอบภาษาไทยจะครบบนเครื่อง demo (HTTPS หรือ localhost; ภาษาไทยของ realtime ต้องทดสอบก่อน) · ครบแล้ว **R** · เสียงอัดล่วงหน้าหรือ typed-only = A
