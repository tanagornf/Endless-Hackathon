import type { Channel, KnowledgeIndexState, KnowledgeStatus, MarketingConsent, MessageAuthor, ShippingRule, WeeklyHours } from '@nless/shared/core/types';
import { STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import type { MembershipRole, PermissionKey } from '@nless/shared/core/permissions';

/** Deterministic clock for unit/integration tests (10:00 Bangkok). Interactive app uses the real clock. */
export const CLOCK_FIXTURE = '2026-11-21T03:00:00Z';

export interface SeedData {
  users: { alias: string; id: string; email: string; displayName: string; isPlatformAdmin: boolean }[];
  accounts: { alias: string; id: string; name: string; ownerAlias: string }[];
  businesses: {
    alias: string; id: string; accountAlias: string; name: string; timezone: 'Asia/Bangkok'; language: 'th';
    marker: string; shipping: ShippingRule; settings: BusinessSettingsFixture;
  }[];
  memberships: { businessAlias: string; userAlias: string; role: MembershipRole; permissions: readonly PermissionKey[] }[];
  customers: { alias: string; id: string; businessAlias: string; channel: Channel; externalId: string; displayName: string; consent: MarketingConsent }[];
  conversations: {
    alias: string; id: string; businessAlias: string; customerAlias: string; channel: Channel;
    handler: 'ai' | 'human'; assigneeAlias: string | null;
    messages: { author: MessageAuthor; authorAlias?: string; text: string }[];
  }[];
  catalog: {
    alias: string; id: string; businessAlias: string; sku: string; kind: 'product' | 'service';
    name: string; nameEn: string; priceMinor: number; currency: 'THB'; stock: number | null; shippable: boolean;
    durationMinutes: number | null; resourceAlias: string | null;
    variants: { alias: string; id: string; name: string }[];
    version: number;
  }[];
  knowledgeFolders: { alias: string; id: string; businessAlias: string; name: string }[];
  knowledge: {
    alias: string; id: string; businessAlias: string; folderAlias: string | null; title: string; body: string;
    status: KnowledgeStatus; indexState: KnowledgeIndexState; revision: number;
  }[];
  templates: { alias: string; id: string; businessAlias: string; name: string; text: string }[];
  tags: { alias: string; id: string; businessAlias: string; name: string; customerAliases: string[] }[];
  resources: { alias: string; id: string; businessAlias: string; name: string; capacity: number }[];
  slots: { alias: string; businessAlias: string; serviceAlias: string; resourceAlias: string; startAt: string; endAt: string; capacity: number }[];
}

export interface BusinessSettingsFixture {
  aiEnabled: boolean;
  language: 'th' | 'en';
  hours: WeeklyHours;
}

const HOURS_A_DAILY_10_20: WeeklyHours = {
  mon: [{ open: '10:00', close: '20:00' }], tue: [{ open: '10:00', close: '20:00' }],
  wed: [{ open: '10:00', close: '20:00' }], thu: [{ open: '10:00', close: '20:00' }],
  fri: [{ open: '10:00', close: '20:00' }], sat: [{ open: '10:00', close: '20:00' }],
  sun: [{ open: '10:00', close: '20:00' }],
};
const HOURS_B_MON_SAT_09_18: WeeklyHours = {
  mon: [{ open: '09:00', close: '18:00' }], tue: [{ open: '09:00', close: '18:00' }],
  wed: [{ open: '09:00', close: '18:00' }], thu: [{ open: '09:00', close: '18:00' }],
  fri: [{ open: '09:00', close: '18:00' }], sat: [{ open: '09:00', close: '18:00' }],
  sun: [],
};

export const SEED: SeedData = {
  users: [
    { alias: 'owner_a', id: '00000000-0000-4000-8000-0000000a0001', email: 'owner.a@example.test', displayName: 'Owner A', isPlatformAdmin: false },
    { alias: 'staff_a', id: '00000000-0000-4000-8000-0000000a0002', email: 'staff.a@example.test', displayName: 'Staff A', isPlatformAdmin: false },
    { alias: 'owner_b', id: '00000000-0000-4000-8000-0000000b0001', email: 'owner.b@example.test', displayName: 'Owner B', isPlatformAdmin: false },
    { alias: 'staff_b', id: '00000000-0000-4000-8000-0000000b0002', email: 'staff.b@example.test', displayName: 'Staff B', isPlatformAdmin: false },
    { alias: 'platform_admin', id: '00000000-0000-4000-8000-00000000ad01', email: 'admin@example.test', displayName: 'Platform Admin', isPlatformAdmin: true },
  ],
  accounts: [
    { alias: 'account_demo_a', id: '00000000-0000-4000-8000-0000000a1000', name: 'Demo Account A', ownerAlias: 'owner_a' },
    { alias: 'account_demo_b', id: '00000000-0000-4000-8000-0000000b1000', name: 'Demo Account B', ownerAlias: 'owner_b' },
  ],
  businesses: [
    {
      alias: 'biz_demo_a', id: '00000000-0000-4000-8000-0000000a2000', accountAlias: 'account_demo_a',
      name: 'Demo Boardgame Shop', timezone: 'Asia/Bangkok', language: 'th', marker: 'TENANT_A_ONLY_FOX_731',
      shipping: { kind: 'threshold', feeMinor: 10000, freeFromSubtotalMinor: 200000 },
      settings: { aiEnabled: true, language: 'th', hours: HOURS_A_DAILY_10_20 },
    },
    {
      alias: 'biz_demo_b', id: '00000000-0000-4000-8000-0000000b2000', accountAlias: 'account_demo_b',
      name: 'Demo Repair Studio', timezone: 'Asia/Bangkok', language: 'th', marker: 'TENANT_B_ONLY_OWL_482',
      shipping: { kind: 'flat', feeMinor: 5000 },
      settings: { aiEnabled: true, language: 'th', hours: HOURS_B_MON_SAT_09_18 },
    },
  ],
  memberships: [
    { businessAlias: 'biz_demo_a', userAlias: 'owner_a', role: 'owner', permissions: [] },
    { businessAlias: 'biz_demo_a', userAlias: 'staff_a', role: 'staff', permissions: STAFF_DEFAULT_PERMISSIONS },
    { businessAlias: 'biz_demo_b', userAlias: 'owner_b', role: 'owner', permissions: [] },
    { businessAlias: 'biz_demo_b', userAlias: 'staff_b', role: 'staff', permissions: STAFF_DEFAULT_PERMISSIONS },
  ],
  customers: [
    { alias: 'cust_a1', id: '00000000-0000-4000-8000-0000000a3001', businessAlias: 'biz_demo_a', channel: 'line', externalId: 'Udemo-a-customer-one', displayName: 'A Customer One', consent: 'granted' },
    { alias: 'cust_a2', id: '00000000-0000-4000-8000-0000000a3002', businessAlias: 'biz_demo_a', channel: 'facebook', externalId: 'psid-demo-a-customer-two', displayName: 'A Customer Two', consent: 'revoked' },
    { alias: 'cust_b1', id: '00000000-0000-4000-8000-0000000b3001', businessAlias: 'biz_demo_b', channel: 'line', externalId: 'Udemo-b-customer-one', displayName: 'B Customer One', consent: 'granted' },
    { alias: 'cust_b2', id: '00000000-0000-4000-8000-0000000b3002', businessAlias: 'biz_demo_b', channel: 'instagram', externalId: 'igsid-demo-b-customer-two', displayName: 'B Customer Two', consent: 'unknown' },
  ],
  conversations: [
    {
      alias: 'conv_a_ai', id: '00000000-0000-4000-8000-0000000a4001', businessAlias: 'biz_demo_a', customerAlias: 'cust_a1',
      channel: 'line', handler: 'ai', assigneeAlias: null,
      messages: [{ author: 'customer', text: 'Hi, do you ship on weekends? A-CARD-01 มีไหมครับ' }],
    },
    {
      alias: 'conv_a_staff', id: '00000000-0000-4000-8000-0000000a4002', businessAlias: 'biz_demo_a', customerAlias: 'cust_a2',
      channel: 'facebook', handler: 'human', assigneeAlias: 'staff_a',
      messages: [
        { author: 'customer', text: 'ขอคุยกับพนักงานค่ะ' },
        { author: 'staff', authorAlias: 'staff_a', text: 'สวัสดีค่ะ ยินดีให้บริการค่ะ' },
      ],
    },
    {
      alias: 'conv_b_ai', id: '00000000-0000-4000-8000-0000000b4001', businessAlias: 'biz_demo_b', customerAlias: 'cust_b1',
      channel: 'line', handler: 'ai', assigneeAlias: null,
      messages: [{ author: 'customer', text: 'B-KIT-01 ราคาเท่าไหร่ครับ' }],
    },
    {
      alias: 'conv_b_staff', id: '00000000-0000-4000-8000-0000000b4002', businessAlias: 'biz_demo_b', customerAlias: 'cust_b2',
      channel: 'instagram', handler: 'human', assigneeAlias: 'staff_b',
      messages: [
        { author: 'customer', text: 'Can I book device setup on Saturday?' },
        { author: 'staff', authorAlias: 'staff_b', text: 'ได้ครับ เดี๋ยวส่งเวลาที่ว่างให้นะครับ' },
      ],
    },
  ],
  catalog: [
    { alias: 'item_a_game', id: '00000000-0000-4000-8000-0000000a5001', businessAlias: 'biz_demo_a', sku: 'A-GAME-01', kind: 'product', name: 'เกมตัวอย่าง Demo Quest', nameEn: 'Demo Quest board game', priceMinor: 149000, currency: 'THB', stock: 5, shippable: true, durationMinutes: null, resourceAlias: null, variants: [{ alias: 'var_a_game_std', id: '00000000-0000-4000-8000-0000000a5101', name: 'Standard' }], version: 1 },
    { alias: 'item_a_card', id: '00000000-0000-4000-8000-0000000a5002', businessAlias: 'biz_demo_a', sku: 'A-CARD-01', kind: 'product', name: 'ชุดการ์ดตัวอย่าง Demo Cards', nameEn: 'Demo Cards card set', priceMinor: 9900, currency: 'THB', stock: 8, shippable: true, durationMinutes: null, resourceAlias: null, variants: [], version: 1 },
    { alias: 'item_a_sold', id: '00000000-0000-4000-8000-0000000a5003', businessAlias: 'biz_demo_a', sku: 'A-SOLD-01', kind: 'product', name: 'เกมหมดสต็อก Demo Sold Out', nameEn: 'Demo Sold Out game', priceMinor: 50000, currency: 'THB', stock: 0, shippable: true, durationMinutes: null, resourceAlias: null, variants: [], version: 1 },
    { alias: 'item_a_service', id: '00000000-0000-4000-8000-0000000a5004', businessAlias: 'biz_demo_a', sku: 'A-SERVICE-01', kind: 'service', name: 'สอนเล่นเกม 30 นาที', nameEn: 'Game teaching 30 min', priceMinor: 50000, currency: 'THB', stock: null, shippable: false, durationMinutes: 30, resourceAlias: 'res_a1', variants: [], version: 1 },
    { alias: 'item_b_kit', id: '00000000-0000-4000-8000-0000000b5001', businessAlias: 'biz_demo_b', sku: 'B-KIT-01', kind: 'product', name: 'Repair kit ตัวอย่าง', nameEn: 'Demo repair kit', priceMinor: 39000, currency: 'THB', stock: 2, shippable: true, durationMinutes: null, resourceAlias: null, variants: [], version: 1 },
    { alias: 'item_b_service', id: '00000000-0000-4000-8000-0000000b5002', businessAlias: 'biz_demo_b', sku: 'B-SERVICE-01', kind: 'service', name: 'บริการตั้งค่าอุปกรณ์ 30 นาที', nameEn: 'Device setup 30 min', priceMinor: 60000, currency: 'THB', stock: null, shippable: false, durationMinutes: 30, resourceAlias: 'res_b1', variants: [], version: 1 },
  ],
  knowledgeFolders: [
    { alias: 'folder_a_general', id: '00000000-0000-4000-8000-0000000a6101', businessAlias: 'biz_demo_a', name: 'คำถามทั่วไป' },
    { alias: 'folder_a_policy', id: '00000000-0000-4000-8000-0000000a6102', businessAlias: 'biz_demo_a', name: 'นโยบาย' },
    { alias: 'folder_b_general', id: '00000000-0000-4000-8000-0000000b6101', businessAlias: 'biz_demo_b', name: 'คำถามทั่วไป' },
    { alias: 'folder_b_policy', id: '00000000-0000-4000-8000-0000000b6102', businessAlias: 'biz_demo_b', name: 'นโยบาย' },
  ],
  knowledge: [
    { alias: 'kn_a_faq', id: '00000000-0000-4000-8000-0000000a6001', businessAlias: 'biz_demo_a', folderAlias: 'folder_a_general', title: 'เวลาเปิดร้านและบริการ', body: 'Demo Boardgame Shop เปิดทุกวัน 10:00–20:00 น. (Asia/Bangkok) มีบริการสอนเล่นเกม 30 นาที (A-SERVICE-01) Open daily 10:00-20:00. Marker TENANT_A_ONLY_FOX_731', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_a_return', id: '00000000-0000-4000-8000-0000000a6002', businessAlias: 'biz_demo_a', folderAlias: 'folder_a_policy', title: 'นโยบายรับคืนสินค้า', body: 'รับคืนสินค้าที่ยังไม่แกะภายใน 7 วัน Unopened items can be returned within 7 days.', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_a_shipping', id: '00000000-0000-4000-8000-0000000a6003', businessAlias: 'biz_demo_a', folderAlias: 'folder_a_policy', title: 'ค่าจัดส่ง', body: 'ค่าส่ง 100 บาท เมื่อยอดสินค้าต่ำกว่า 2,000 บาท ยอดตั้งแต่ 2,000 บาทขึ้นไปส่งฟรี Shipping 100 THB under 2,000 THB, free from 2,000 THB.', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_a_draft', id: '00000000-0000-4000-8000-0000000a6004', businessAlias: 'biz_demo_a', folderAlias: 'folder_a_general', title: 'โปรโมชันร่าง', body: 'DRAFT ลด 50% ทุกเกม (ร่าง ห้ามใช้ตอบลูกค้า)', status: 'draft', indexState: 'not_started', revision: 1 },
    { alias: 'kn_a_deleted', id: '00000000-0000-4000-8000-0000000a6005', businessAlias: 'biz_demo_a', folderAlias: null, title: 'ราคาเก่า', body: 'DELETED ราคาเก่า A-GAME-01 990 บาท (ลบแล้ว ห้ามใช้ตอบลูกค้า)', status: 'deleted', indexState: 'ready', revision: 2 },
    { alias: 'kn_b_faq', id: '00000000-0000-4000-8000-0000000b6001', businessAlias: 'biz_demo_b', folderAlias: 'folder_b_general', title: 'เวลาเปิดร้านและบริการ', body: 'Demo Repair Studio เปิดจันทร์–เสาร์ 09:00–18:00 น. (Asia/Bangkok) รับบริการตั้งค่าอุปกรณ์ 30 นาที (B-SERVICE-01) Open Mon-Sat 09:00-18:00. Marker TENANT_B_ONLY_OWL_482', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_b_return', id: '00000000-0000-4000-8000-0000000b6002', businessAlias: 'biz_demo_b', folderAlias: 'folder_b_policy', title: 'นโยบายรับคืน kit', body: 'รับคืน kit ที่ยังไม่แกะภายใน 14 วัน Unopened kits can be returned within 14 days.', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_b_shipping', id: '00000000-0000-4000-8000-0000000b6003', businessAlias: 'biz_demo_b', folderAlias: 'folder_b_policy', title: 'ค่าจัดส่ง', body: 'ค่าส่งเหมา 50 บาท เฉพาะสินค้าที่จัดส่ง Flat 50 THB shipping for shipped items.', status: 'active', indexState: 'ready', revision: 1 },
    { alias: 'kn_b_draft', id: '00000000-0000-4000-8000-0000000b6004', businessAlias: 'biz_demo_b', folderAlias: 'folder_b_general', title: 'บริการใหม่ร่าง', body: 'DRAFT บริการซ่อมด่วนภายใน 1 ชั่วโมง (ร่าง ห้ามใช้ตอบลูกค้า)', status: 'draft', indexState: 'not_started', revision: 1 },
    { alias: 'kn_b_inactive', id: '00000000-0000-4000-8000-0000000b6005', businessAlias: 'biz_demo_b', folderAlias: null, title: 'บริการที่ปิดแล้ว', body: 'INACTIVE บริการรับส่งถึงบ้าน (ปิดแล้ว ห้ามใช้ตอบลูกค้า)', status: 'inactive', indexState: 'ready', revision: 1 },
  ],
  templates: [
    { alias: 'tpl_welcome_a', id: '00000000-0000-4000-8000-0000000a7001', businessAlias: 'biz_demo_a', name: 'ทักทาย', text: 'สวัสดีค่ะ คุณ{{customerName}} ขอบคุณที่ทัก Demo Boardgame Shop ค่ะ' },
    { alias: 'tpl_welcome_b', id: '00000000-0000-4000-8000-0000000b7001', businessAlias: 'biz_demo_b', name: 'ทักทาย', text: 'สวัสดีครับ คุณ{{customerName}} Demo Repair Studio ยินดีให้บริการครับ' },
  ],
  tags: [
    { alias: 'tag_vip_a', id: '00000000-0000-4000-8000-0000000a8001', businessAlias: 'biz_demo_a', name: 'VIP', customerAliases: ['cust_a1', 'cust_a2'] },
    { alias: 'tag_vip_b', id: '00000000-0000-4000-8000-0000000b8001', businessAlias: 'biz_demo_b', name: 'VIP', customerAliases: ['cust_b1'] },
  ],
  resources: [
    { alias: 'res_a1', id: '00000000-0000-4000-8000-0000000a9001', businessAlias: 'biz_demo_a', name: 'A1', capacity: 1 },
    { alias: 'res_b1', id: '00000000-0000-4000-8000-0000000b9001', businessAlias: 'biz_demo_b', name: 'B1', capacity: 1 },
  ],
  slots: [
    { alias: 'slot_a_1122_1000', businessAlias: 'biz_demo_a', serviceAlias: 'item_a_service', resourceAlias: 'res_a1', startAt: '2026-11-22T03:00:00Z', endAt: '2026-11-22T03:30:00Z', capacity: 1 },
    // Shop B is closed on Sundays (HOURS_B_MON_SAT_09_18), so its test slot is Monday 23 Nov 10:00 Bangkok (v3 fix; was 22 Nov).
    { alias: 'slot_b_1123_1000', businessAlias: 'biz_demo_b', serviceAlias: 'item_b_service', resourceAlias: 'res_b1', startAt: '2026-11-23T03:00:00Z', endAt: '2026-11-23T03:30:00Z', capacity: 1 },
  ],
};

/**
 * SPEC §5 numbers every lane asserts. Shipping: A = 10000 below subtotal 200000, free from 200000;
 * B = flat 5000 for shippable items.
 */
export const SEED_CHECKS = [
  { business: 'biz_demo_a', sku: 'A-GAME-01', quantity: 2, subtotalMinor: 298000, deliveryFeeMinor: 0, totalMinor: 298000 },
  { business: 'biz_demo_a', sku: 'A-CARD-01', quantity: 2, subtotalMinor: 19800, deliveryFeeMinor: 10000, totalMinor: 29800 },
  { business: 'biz_demo_b', sku: 'B-KIT-01', quantity: 1, subtotalMinor: 39000, deliveryFeeMinor: 5000, totalMinor: 44000 },
] as const;
