type Language = 'th' | 'en';

export function nudgeTemplate(language: Language, product: string): string {
  if (language === 'th') {
    return 'สวัสดีค่ะ ยังสนใจ' + (product || 'สินค้าที่สอบถาม') + 'อยู่ไหมคะ ถ้ามีคำถามหรืออยากสั่งซื้อ พิมพ์ทักมาได้เลยนะคะ';
  }
  return 'Hi! Are you still interested in ' + (product || 'the product you asked about') + '? Message us any time if you have questions or want to order.';
}
