const thaiOptOut = /(?:ไม่ต้อง|อย่า|เลิก|หยุด|ไม่อยาก|ไม่ประสงค์)\s*(?:ทัก|ติดต่อมา|ส่งข้อความ|แจ้งมา|ตามมา|ส่งโปร|รับข้อความ)|ยกเลิกรับข้อความ|ไม่รับข่าวสาร|ปิดการแจ้งเตือน|อย่ารบกวน/u;
const englishOptOut = /\b(?:stop (?:messaging|texting|contacting|sending (?:me )?messages)|unsubscribe|opt[ -]?out|(?:do not|don't) (?:message|contact|text) me|leave me alone|no more messages)\b/u;

export function isOptOutMessage(text: string): boolean {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/gu, ' ').trim();
  return /^(?:stop|หยุด)[.!?]*$/u.test(normalized) || thaiOptOut.test(normalized) || englishOptOut.test(normalized);
}
