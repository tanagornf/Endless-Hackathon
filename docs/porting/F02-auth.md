# F02 auth — ตัวตนและ session

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F02-auth.md](../specs/F02-auth.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P1** · C3 ทำต่อจาก F03 ได้เลย ไม่ต้องรอ `LEAD: OPEN P1` (F03 ใช้ dev login ไปก่อนจน F02 เสร็จ) · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C3 ลำดับ 3/4 (หลัง F04, F03 ต่อด้วย F31) · **คน** C · **พึ่ง** F01, F03 (invitation) · **เป้า** auth R, email S · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** สมัคร / login (session kind `password`) / logout / verify email / reset password และ provisioning ตอน signup; `getUser()` ของ core อ่าน session ของ F02 แบบเดียวกับ dev login จึงไม่ต้องเปลี่ยน signature · **ใช้** `db`, `jobs.enqueue()` (อีเมล sandbox), `audit()`, service ของ F03 (รับ invitation, lane เดียวกัน) · signup ไม่มีแพ็กเกจเริ่มต้น (ใช้ได้ไม่จำกัด)

## Papi files to read (in order)
1. `Backend/layers/nodejs-utils/nodejs/provisioning.mjs` (ทำให้ identity ที่ยืนยันแล้วเป็น user ได้ครั้งเดียว)
2. `Backend/functions/Registration/src/start.mjs`, `complete.mjs`, `invitation-response.mjs` + `Backend/functions/TriggerPostUserSignup/src/index.mjs`
3. `Backend/layers/nodejs-utils/nodejs/registration-intents.mjs` + `Database/registrationintents.sql` (ผูกลิงก์ invite ที่กดกับ signup อย่างไร)
4. `Database/users.sql`, `Database/invitations.sql`
5. `Backend/functions/GetUserInfo`, `GetUserProfile`, `UpdateUserInfo` (profile อ่าน/แก้)
6. `Backend/layers/nodejs-utils/nodejs/log-redaction.mjs` (ห้าม log อะไรบ้าง)
7. ดูแค่ว่าต้องแทนอะไร: `Backend/functions/AuthorizeToken`, `ExchangeAuthToken`, `RevokeAuthToken`
8. หน้า (port layout + ข้อความ ส่วนการเรียก Amplify/Cognito เขียนใหม่): `Frontend/src/pages/Login.tsx`, `Signup.tsx`, `Confirm.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `Invite.tsx`, `Welcome.tsx`, `Profile.tsx`

## Behaviors to keep
- provisioning ปลอดภัยเมื่อรันซ้ำ: advisory xact lock ต่อ email ที่ normalize แล้ว; มี user อยู่แล้ว = คืนแถวเดิม ไม่สร้างซ้ำ; email ซ้ำกับ identity อื่น = `identity-conflict` ห้ามผูกหรือทับ (email เท่ากันไม่ใช่หลักฐานตัวตน)
- signup ไม่มี invite: สร้าง user + account (`owner_user_id`) + business แรก + membership role `owner` ใน transaction เดียว; ล้มกลางทางต้อง rollback ทั้งหมด (บั๊กเดิมของ Papi: user ไม่มี business แล้วเจอ 404 ตอนโหลด profile)
- signup ผ่าน invite: ใช้เฉพาะ batch ที่ token hash ตรงกับลิงก์ที่กด ไม่ match ด้วย email; ความหมดอายุดูจาก `expires_at` ไม่เชื่อ status; ไม่รับ invite ของ business ที่ถูกระงับหรือลบ; role และ permissions คัดจากแถว invitation
- Papi ให้ user อยู่ได้ account เดียว: รับ invite แล้ว invite อื่นที่ค้างของ email นี้เป็น `revoked` (คง rule นี้ เว้นแต่ทีมตัดสินใจเป็นอื่น)
- invite token เก็บเป็น SHA-256 hash เท่านั้น (Papi ไม่เก็บ raw แม้ใน notification) ใช้หลักเดียวกันกับ reset และ verify token; ความถูกต้องดูจาก `expires_at`
- ปฏิเสธ invite ทำได้โดยไม่ต้องสร้างบัญชี; รับ invite ของคนที่มีบัญชีแล้วต้อง login และ email ต้องตรง
- user ที่ `disabled` ทุก request ได้ `ACCOUNT_DISABLED` (Papi แยก inactive / blocked แต่หน้าจอเดียวกัน); `is_platform_admin` แยกจาก role
- ห้าม log Authorization, cookie, code, verifier, รหัสผ่าน หรือ invite / reset URL

## Drop / replace
- Cognito hosted UI, Amplify, PKCE, JWT authorizer, Cognito triggers, `cognito_sub`, `registration_intents` → อีเมล + รหัสผ่าน (scrypt ลง `users.password_hash` ของ core), cookie `nless_session`, token ใน `sessions` เป็น HMAC ตาม contract และส่ง invite token มากับ signup ตรง ๆ
- Google sign-in (`AuthCallback.tsx`, `federatedAuth.ts`, ปุ่มใน `SocialAuthButtons.tsx`) = OUT; SES → email outbox แบบ sandbox ผ่าน job

## Tables
- ใช้ของ core: `users` (`password_hash`, `email_verified_at` ที่ F02 เขียน), `sessions`, `accounts`, `businesses`, `memberships`
- เป็นเจ้าของ: `password_resets`, `email_verifications` (token_hash, expires_at, used_at), `email_outbox` (sandbox) · `invitations` เป็นของ F03

## Done when
- สมัครแล้ว login ได้; logout หรือ session หมดอายุแล้ว cookie เดิมได้ 401; session ของ user อื่นทำงานแทนไม่ได้ (403/404)
- reset / verify token ที่หมดอายุหรือใช้แล้วถูกปฏิเสธ; อีเมลทุกฉบับอยู่ใน sandbox outbox พร้อมป้าย S
- ยิง signup เดิมซ้ำไม่เกิด account ที่สอง; invite ที่หมดอายุหรือของ business ที่ถูกระงับไม่ให้สิทธิ์; dev login ปิดได้ด้วย config ใน build ที่ใช้ demo

## Status floor
auth R · email S (sandbox outbox) จนกว่าจะมี delivery receipt
