import { detectTextLanguage } from '@nless/shared/core/language';
import type { CustomerLanguage } from '@nless/shared/core/language';

export const fallbacks = {
  greeting: {
    th: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ',
    en: 'Hello! How can I help?',
  },
  goodbye: {
    th: 'ยินดีค่ะ ขอบคุณที่ทักมานะคะ',
    en: "You're welcome. Thanks for stopping by!",
  },
  no_answer: {
    th: 'ขอตรวจสอบข้อมูลกับร้านก่อนนะคะ',
    en: 'Let me check with the shop first.',
  },
  ai_failed: {
    th: 'ขออภัยค่ะ ตอนนี้ระบบตอบอัตโนมัติขัดข้องชั่วคราว แจ้งเจ้าหน้าที่ให้มาตอบในแชตนี้แล้วนะคะ',
    en: "Sorry, our automatic assistant is having a temporary problem. I've asked our staff to reply here.",
  },
  ai_failed_retry: {
    th: 'ขออภัยค่ะ ตอนนี้ระบบขัดข้องชั่วคราว รบกวนลองส่งข้อความอีกครั้งในอีกสักครู่นะคะ',
    en: 'Sorry, something went wrong on our side. Please send your message again in a moment.',
  },
  escalation_ack: {
    th: 'รับทราบค่ะ กำลังแจ้งเจ้าหน้าที่ให้มาตอบคุณลูกค้านะคะ ระหว่างนี้พิมพ์ข้อมูลเพิ่มเติมทิ้งไว้ได้เลยค่ะ',
    en: "Got it. I'm letting our staff know and they'll reply here. Feel free to add more details in the meantime.",
  },
  escalation_ack_closed: {
    th: 'รับทราบค่ะ ตอนนี้อยู่นอกเวลาทำการของร้าน แจ้งเจ้าหน้าที่ไว้ให้แล้วนะคะ เจ้าหน้าที่จะตอบกลับเมื่อร้านเปิดค่ะ พิมพ์ข้อมูลเพิ่มเติมทิ้งไว้ได้เลยค่ะ',
    en: "Got it. The shop is closed right now. I've left a note for our staff and they'll reply here when the shop opens. Feel free to add more details in the meantime.",
  },
  image_only: {
    th: 'ได้รับรูปแล้วค่ะ ตอนนี้ผู้ช่วยอ่านได้เฉพาะข้อความ ถ้าเป็นสลิปโอนเงิน ส่งผ่านปุ่มชำระเงินในแชตนี้ได้เลยนะคะ หรือพิมพ์บอกได้ว่าต้องการให้ช่วยเรื่องอะไรค่ะ',
    en: 'Thanks, I got your picture. I can only read text for now. If it is a payment slip, please send it with the payment button in this chat, or tell me in words how I can help.',
  },
  price_hidden: {
    th: 'สอบถามราคากับร้านโดยตรงนะคะ',
    en: 'Please ask the shop directly for the price.',
  },
  product_not_found: {
    th: 'ยังไม่พบสินค้านี้ในรายการสินค้าของร้านค่ะ',
    en: "I couldn't find that product in this shop's catalog.",
  },
  contact_hidden: {
    th: 'สอบถามร้านโดยตรงนะคะ',
    en: 'Please contact the shop directly.',
  },
  budget_handoff: {
    th: 'ขออภัยค่ะ ยังไม่มีข้อมูลเรื่องนี้ เดี๋ยวให้พนักงานช่วยตอบนะคะ',
    en: "Sorry, I don't have that information yet. Our staff will help shortly.",
  },
  handoff_offer: {
    th: 'ต้องการให้เจ้าหน้าที่ช่วยต่อไหมคะ',
    en: 'Would you like me to bring in our staff?',
  },
  text_only: {
    th: 'ขอโทษค่ะ ตอนนี้ดูได้เฉพาะข้อความตัวอักษรนะคะ',
    en: 'Sorry, I can only read text messages for now.',
  },
};

export function detectReplyLanguage(
  unanswered: readonly string[],
  priorCustomerText: readonly string[],
  defaultLanguage: CustomerLanguage,
): CustomerLanguage {
  const latest = detectTextLanguage(unanswered.at(-1) ?? '');
  if (latest) return latest;
  const previous = [...priorCustomerText, ...unanswered.slice(0, -1)];
  for (const text of previous.slice(-6).reverse()) {
    const detected = detectTextLanguage(text);
    if (detected) return detected;
  }
  return defaultLanguage;
}
