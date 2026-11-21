import { detectTextLanguage } from '@nless/shared/core/language';
import { AppError } from '../../core';

interface CustomerAnswerInput {
  answer: string;
  answerParts?: string[];
  customerReady?: boolean;
  privateRationale?: string | null;
}

export function ownerAnswerPrompts(question: string, explicit: readonly string[] = []): string[] {
  if (explicit.length) return [...explicit];
  const questions = (question.match(/[^?？]+[?？]/gu) ?? []).map((part) => part.trim());
  return questions.length > 1 ? questions : [question];
}

function isPlaceholder(value: string): boolean {
  const copy = value.toLowerCase().replace(/[.!?。！？]+$/u, '').replace(/’/g, "'").trim();
  return /^(?:please wait|not sure|i don't know|let me check(?: (?:this|that|on it))?|i(?:'ll| will| need to) (?:check|look into (?:it|this|that)))$/u.test(copy) ||
    /^(?:ขอ|เดี๋ยว|เดี๋ยวขอ)(?:เช็ก|เช็ค|ตรวจสอบ)(?:ข้อมูล)?(?:ให้)?(?:ก่อน)?(?:นะ)?(?:ครับ|ค่ะ|คะ)?$/u.test(copy.replace(/\s+/g, ''));
}

export function prepareCustomerAnswer(input: CustomerAnswerInput, count: number, language?: 'th' | 'en') {
  const answer = input.answer.trim();
  const parts = (input.answerParts ?? [answer]).map((text) => text.trim());
  if (!input.customerReady || parts.length !== count || answer !== parts.join('\n\n') ||
      parts.some((part) => !part || isPlaceholder(part))) {
    throw new AppError('VALIDATION_ERROR', 'A complete customer-facing reply is required', {
      details: { reason: 'incomplete_owner_answer' },
    });
  }
  const detected = detectTextLanguage(answer);
  if (language && detected && detected !== language) {
    throw new AppError('VALIDATION_ERROR', 'Use the original customer language', {
      details: { reason: 'owner_answer_language' },
    });
  }
  return { answer, privateRationale: input.privateRationale?.trim() || null };
}
