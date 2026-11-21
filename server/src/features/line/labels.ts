export type LineLanguage = 'th' | 'en';

export const lineLabels = {
  th: {
    sticker: '[สติกเกอร์]', pictureAlt: 'รูปภาพจากลูกค้า', picture: '[รูปภาพ]',
    externalPicture: '[รูปภาพ (ลิงก์ภายนอก)]', voice: '[ข้อความเสียง]', video: '[วิดีโอ]', file: '[ไฟล์]',
    location: '[ตำแหน่ง]', tooLarge: '[ไฟล์ใหญ่เกินกำหนด ระบบไม่ได้บันทึก]', unavailable: '[ไฟล์จาก LINE ไม่พร้อมใช้งาน]',
    failed: '[ข้อความจาก LINE ที่ระบบรับไม่สำเร็จ]',
    audioNotice: 'ขออภัยค่ะ ตอนนี้ยังฟังข้อความเสียงไม่ได้ รบกวนพิมพ์ข้อความมาได้เลยนะคะ',
    action: {
      order: 'ออเดอร์', booking: 'นัดหมาย', confirm: 'ยืนยัน', cancel: 'ยกเลิก',
      expired: 'รายการนี้หมดอายุแล้วค่ะ พิมพ์สั่งใหม่ได้เลยนะคะ',
      replayed: 'รายการนี้ยืนยันไปแล้วค่ะ',
      cancelled: 'ยกเลิกรายการให้แล้วค่ะ ถ้าต้องการสั่งใหม่บอกได้เลยนะคะ',
      changed: 'ราคาหรือสต็อกมีการเปลี่ยนแปลงค่ะ ขอสรุปรายการใหม่ให้นะคะ',
      changedRequest: 'ขอสรุปรายการใหม่',
      soldOut: 'ขออภัยค่ะ รายการนี้ไม่ว่างแล้ว เดี๋ยวช่วยเสนอทางเลือกให้นะคะ',
      alternativesRequest: 'ขอทางเลือกอื่น',
      notReady: 'ระบบรับรายการยังไม่พร้อมใช้งานค่ะ รบกวนรอทีมงานติดต่อกลับนะคะ',
      failed: 'ขออภัยค่ะ เกิดข้อผิดพลาด รบกวนลองใหม่อีกครั้งนะคะ',
    },
  },
  en: {
    sticker: '[Sticker]', pictureAlt: 'Picture from customer', picture: '[Picture]',
    externalPicture: '[Picture (external link)]', voice: '[Voice message]', video: '[Video]', file: '[File]',
    location: '[Location]', tooLarge: '[File exceeds the upload limit and was not saved]', unavailable: '[LINE attachment unavailable]',
    failed: '[LINE message that could not be received]',
    audioNotice: 'Sorry, I cannot listen to voice messages yet. Please type your message.',
    action: {
      order: 'order', booking: 'booking', confirm: 'Confirm', cancel: 'Cancel',
      expired: 'This item has expired. Please type your order again.',
      replayed: 'This was already confirmed.',
      cancelled: 'Cancelled. Tell me if you would like to order again.',
      changed: 'The price or stock has changed. Let me prepare a new summary.',
      changedRequest: 'Please send a new summary',
      soldOut: 'Sorry, this is no longer available. Let me suggest other options.',
      alternativesRequest: 'Please suggest other options',
      notReady: 'This service is not available yet. Our team will get back to you.',
      failed: 'Sorry, something went wrong. Please try again.',
    },
  },
} as const;
