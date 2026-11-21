import { describe, expect, it, vi } from 'vitest';
import { ownerAnswerPrompts, prepareCustomerAnswer } from './owner-consult-customer-answer';

vi.mock('../../core', () => ({
  AppError: class extends Error { constructor(readonly code: string, message: string) { super(message); } },
}));

const cases = [
  {
    language: 'en' as const, prompts: ['Can I exchange the missing part?', 'Who pays for shipping?'],
    replies: ['We can replace the missing part.', 'We cover shipping.'],
    privateRationale: 'One-time exception. Keep this private.', placeholder: 'Let me check.',
  },
  {
    language: 'th' as const, prompts: ['เปลี่ยนอะไหล่ได้ไหม?', 'ใครออกค่าส่ง?'],
    replies: ['ร้านเปลี่ยนอะไหล่ให้ได้ค่ะ', 'ทางร้านออกค่าส่งให้ค่ะ'],
    privateRationale: 'ยกเว้นเฉพาะเคสนี้ เก็บเป็นข้อมูลภายใน', placeholder: 'ขอเช็กก่อนนะคะ',
  },
];

describe('reviewed owner reply', () => {
  it.each(cases)('keeps $language reviewed copy separate from private rationale', ({ replies, privateRationale, language }) => {
    const answer = replies[0]!;
    expect(prepareCustomerAnswer({ answer, privateRationale, customerReady: true }, 1, language))
      .toEqual({ answer, privateRationale });
  });

  it.each(cases)('leaves a $language placeholder pending', ({ placeholder, language }) => {
    expect(() => prepareCustomerAnswer({ answer: placeholder, customerReady: true }, 1, language)).toThrow();
  });

  it.each(cases)('requires all parts of a $language question', ({ prompts, replies, language }) => {
    const partial = replies[0]!;
    expect(ownerAnswerPrompts(prompts.join(' '))).toEqual(prompts);
    expect(() => prepareCustomerAnswer({ answer: partial, answerParts: [partial], customerReady: true }, prompts.length, language)).toThrow();
    const answer = replies.join('\n\n');
    expect(prepareCustomerAnswer({ answer, answerParts: replies, customerReady: true }, prompts.length, language).answer).toBe(answer);
  });

  it('requires explicit review and the customer language', () => {
    const answer = 'We can replace this.';
    expect(() => prepareCustomerAnswer({ answer, customerReady: false }, 1, 'en')).toThrow();
    expect(() => prepareCustomerAnswer({ answer, customerReady: true }, 1, 'th')).toThrow();
  });
});
