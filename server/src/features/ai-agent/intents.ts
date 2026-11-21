const explicitThai = /(ขอ|อยาก|ต้องการ|ช่วย|ให้|ขอร้อง)?(คุย|พูด|ติดต่อ|ต่อสาย|โอนสาย|โอน|ส่งต่อ|เรียก|ขอสาย)\s*(กับ|ไป|หา|ให้)?\s*(พนักงาน|แอดมิน|admin|เจ้าหน้าที่|คนจริง|ผู้ดูแล|เจ้าของร้าน|เจ้าของ|คน)/iu;
const rejectBot = /(ไม่เอา|ไม่คุยกับ|ไม่อยากคุยกับ)\s*(บอท|bot|เอไอ|ai|หุ่นยนต์)/iu;
const explicitEnglish = /\b(?:talk|speak|chat|connect|transfer)\s*(?:me\s*)?(?:to|with)?\s*(?:an?\s*)?(?:real\s*)?(?:human|person|agent|staff|someone|operator|representative)\b|\b(?:live agent|human agent|real person)\b/iu;
const exclusion = /(แอดมิน|admin)\s*(คืออะไร|คือ|หมายถึง)|what is (?:an? )?admin|ราคา.*(แอดมิน|admin)|(โปรแกรม|แพ็กเกจ).*(แอดมิน|admin)/iu;
const negation = /ไม่ต้อง\s*(?:คุย|พูด|ติดต่อ|ต่อสาย|โอน|ส่งต่อ|เรียก)|ไม่ได้\s*(?:ขอ|อยาก|ต้องการ)\s*(?:คุย|พูด|ติดต่อ)|\b(?:don't|do not|no need to|not asking to|not want to)\b.{0,24}\b(?:talk|speak|chat|connect|transfer|human|person|staff|agent)\b/iu;

export function explicitlyRequestsStaff(text: string): boolean {
  const normalized = text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replaceAll('’', "'");
  return !exclusion.test(normalized) && !negation.test(normalized) &&
    (explicitThai.test(normalized) || rejectBot.test(normalized) || explicitEnglish.test(normalized));
}
