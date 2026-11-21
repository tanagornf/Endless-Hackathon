import { z } from 'zod';
export const TagColor = z.enum(['grey', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple']);
const TagName = z.string().trim().min(1).max(128); // นับ grapheme ≤ 32 ในโค้ด (VALIDATION_ERROR issue `name_too_long`)
export const ListCustomersQuery = z.object({
  q: z.string().trim().max(100).optional(),                        // ชื่อ (ILIKE) หรือตัวเลขเบอร์ (prefix ของ phone_norm) หรืออีเมล
  tagId: z.union([z.string().uuid(), z.array(z.string().uuid()).max(10)]).optional().transform(v => v === undefined ? [] : Array.isArray(v) ? v : [v]), // ANY
  consent: z.enum(['granted', 'revoked', 'unknown']).optional(),
  channel: z.enum(['web', 'line', 'facebook', 'instagram']).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const UpdateProfileBody = z.object({
  expectedVersion: z.number().int().min(1),                         // profile.version ที่ UI เห็น (ยังไม่มีแถว = 1)
  phone: z.string().trim().max(32).refine(v => v === '' || /^[0-9+()\-\s.]{6,32}$/.test(v) && v.replace(/\D/g, '').length >= 8 && v.replace(/\D/g, '').length <= 15).optional(),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(254)]).optional(),
  address: z.string().trim().max(500).optional(),
  note: z.string().trim().max(2000).optional(),
}).strict();                                                         // ฟิลด์ที่ไม่ส่ง = ไม่แก้ · '' = ล้างค่า
export const AssignTagBody = z.union([
  z.object({ tagId: z.string().uuid() }).strict(),
  z.object({ name: TagName, color: TagColor.optional() }).strict(),   // สร้างถ้าไม่มี (idempotent ด้วย name_key) แล้วติด
]);
export const SetConsentBody = z.object({
  status: z.enum(['granted', 'revoked', 'unknown']),
  reason: z.string().trim().max(300).default(''),
  attestation: z.boolean().default(false),                          // status 'granted' ต้องเป็น true (ร้านยืนยันว่าลูกค้ายินยอมแล้ว)
}).strict();
export const MergeBody = z.object({ sourceCustomerId: z.string().uuid() }).strict();
export const CreateTagBody = z.object({ name: TagName, description: z.string().trim().max(200).default(''), color: TagColor.default('grey') }).strict();
export const UpdateTagBody = z.object({ expectedVersion: z.number().int().min(1), name: TagName.optional(), description: z.string().trim().max(200).optional(), color: TagColor.optional() }).strict();
