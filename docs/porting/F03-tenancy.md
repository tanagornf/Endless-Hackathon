# F03 tenancy — บัญชี ธุรกิจ สมาชิก และสิทธิ์

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F03-tenancy.md](../specs/F03-tenancy.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · core loop · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C3 ลำดับ 2/4 (หลัง F04 ต่อด้วย F02) · **คน** C · **พึ่ง** F01 (ใช้ dev login ของ setup จน F02 เสร็จ) · **เป้า** R (golden path) · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** API + หน้าจัดการ business, สมาชิก, invitation, role, status และสิทธิ์รายคน; `getBusiness()` / `requirePermission()` ของ core (F01) อ่าน `memberships` ที่ F03 เขียนทุก request · **ใช้** `audit()`, `notify()` (F31 ใน lane เดียวกัน ใช้ fake จน F31 เสร็จ: type `invitation`) · ไม่จำกัดจำนวน business (ไม่มีแพ็กเกจ)

## Papi files to read (in order)
1. `Backend/layers/nodejs-utils/nodejs/permissions.mjs` (เหตุผลของ bucket on/off/never) ส่วน catalog 26 keys อยู่ใน `PERMISSIONS` ของ contracts.ts แล้ว ห้ามเพิ่ม key
2. `Backend/layers/nodejs-utils/nodejs/business-scope.mjs` (`resolveBusinessScope`, `businessGateBody`, `lockoutBody`)
3. `Database/users.sql`, `accounts.sql`, `businesses.sql`, `userbusinessaccess.sql`, `invitations.sql` (ข้าม `accountmembers.sql` ซึ่งเลิกใช้แล้ว)
4. `Backend/functions/InviteUser/src/invite.mjs`, `invitations.mjs`, `members.mjs`, `member-permissions.mjs`
5. `Backend/functions/UpdateUserRole/src/handler.mjs`, `UpdateUserStatus/src/index.mjs`, `UpdateBusinessStatus/src/index.mjs`, `CreateBusiness/src/index.mjs`, `GetMyBusinesses/src/index.mjs`
6. `Backend/layers/nodejs-utils/nodejs/account-cascade.mjs`, `channel-teardown.mjs`
7. หน้า: `Frontend/src/pages/Member.tsx`, `MemberList.tsx`, `Business.tsx`, `BusinessList.tsx`, `FirstStep.tsx`, `AccountDisabled.tsx`, `BusinessSuspended.tsx`, `NoBusinessAccess.tsx`, `Unauthorized.tsx`; `Frontend/src/functions/permissions.ts`

## Behaviors to keep
- ขอบเขต business มาจากแถว membership ที่ active เสมอ แม้ owner ก็ต้องมีแถว (Papi: role บอกว่าทำอะไรได้ grant บอกว่าเข้า business ไหนได้); revoke = `memberships.status = 'revoked'` มีผล request ถัดไป
- ไม่มี key = ไม่มีสิทธิ์; key ที่ไม่รู้จักถูกทิ้ง (fail closed); ตอนบันทึกสิทธิ์ key ที่ไม่รู้จักหรือเป็น `never` ได้ `VALIDATION_ERROR` พร้อมรายการ ไม่ทิ้งเงียบ; owner มีทุก key โดยไม่อ่าน array; staff ใหม่ได้ `STAFF_DEFAULT_PERMISSIONS`
- `never` (`account.members`, `account.businesses`) ให้ staff ไม่ได้เพราะเป็นระดับ account และยกระดับสิทธิ์ตัวเองได้; หน้าแก้สิทธิ์ต้องแสดง key เหล่านี้แบบล็อกไว้ ไม่ซ่อน
- ต่างจาก Papi: platform admin ไม่ได้ merchant key อัตโนมัติ (privacy ตาม contract) ใช้ได้แค่ guard `requirePlatformAdmin()` ของ core (เช่น ops tools ของ F35) ไม่มีหน้า admin
- business status ของเรามี `active` / `suspended` / `deleted` และ core ตอบ `BUSINESS_INACTIVE` ทุก request (Papi มี `inactive` ที่ยังอ่านได้ แต่ contract ไม่มี ถ้าต้องการต้องโพสต์ `CHANGE TO:C1`); `deleted` ไม่แสดงใน switcher; status ต้องตอบก่อน permission
- request ที่ไม่ระบุ business: ใช้ business แรกที่มี membership และไม่ deleted แบบ deterministic (Papi เรียงตาม id)
- invite: อายุ 7 วัน, ≤ 50 business ต่อครั้ง, คนที่อยู่ account อื่นได้ 409, invite ห้ามเปลี่ยน role ของสมาชิกเดิม (409), มี invite ค้างซ้ำได้ 409, ยกเลิก invite ที่รับแล้วได้ 409, ยกเลิกซ้ำถือว่าสำเร็จ (ใช้ UPDATE แบบมีเงื่อนไขกัน race กับ signup)
- role / status: ห้ามเปลี่ยน role ตัวเอง; account ต้องเหลือ owner อย่างน้อยหนึ่งคน (409 ภายใต้ lock ต่อ account); ปิด user มีผลทุก business ของ account และไม่ลบ membership (เปิดกลับไม่ต้องเชิญใหม่)
- business: owner ลบได้เฉพาะตอน active; การกู้คืนและการตั้ง `suspended` ใน Papi เป็นงานของ platform staff / billing ซึ่งตัดออกจาก scope จึงไม่ทำ (owner ทำเองไม่ได้); ระงับหรือลบ business ต้องตัดทุก channel และตอนกู้คืนไม่ต่อ channel กลับให้เอง

## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- รายชื่อสมาชิกกรอง role/สถานะ และเรียงได้ 6 แบบ ฝั่ง client (`3230fdb2`)
- ค้นหาในหน้าต่างสิทธิ์ (`f4d1e93e`)
- ทุกหน้าให้สิทธิ์รายคนได้ (`c64de354`)
- Orders มีระดับ Read & write = `orders.read` + `orders.write` (`5b59a8cb`)
- สิทธิ์ใหม่ `chat.templates`, `comments.read`, `comments.write`
- ไฟล์ใหม่ใน map: `Frontend/src/components/member/PermissionSearch.tsx`, `Frontend/src/functions/permissionSearch.ts`, `Frontend/src/functions/memberListView.ts`

## Drop / replace
- lookup ด้วย Cognito sub → user จาก session; Lambda push lockout → `publish()` แบบ best effort (ความถูกต้องมาจาก 403 ของ request ถัดไป); `account_members`, `organization_id` ไม่ port

## Tables
- ใช้ของ core: `accounts`, `users`, `businesses`, `memberships` (role `owner` / `staff`, `permissions text[]`, status `active` / `revoked`)
- เป็นเจ้าของ: `invitations` (token_hash, business_id, role, permissions, status pending/accepted/revoked/expired/declined, expires_at)

## Done when
- ผู้ใช้ร้าน A อ่าน/เขียนทรัพยากรของร้าน B ไม่ได้ (404); staff ที่ไม่มี key เขียนได้ `PERMISSION_DENIED`; revoke membership มีผลกับ request ถัดไป; สลับ business แล้ว scope ถูก
- ลด owner คนสุดท้ายได้ 409; ทุกการเปลี่ยน role / สิทธิ์ / status มีแถว `audit_events`
- seed SPEC §5 (owner.a, staff.a, owner.b, staff.b, platform admin) ยังใช้ได้ทั้ง dev login และ password login

## Status floor
R
