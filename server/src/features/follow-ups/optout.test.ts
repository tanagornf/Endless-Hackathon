import { expect, it } from 'vitest';
import { isOptOutMessage } from './optout';

it.each([
  'ไม่ต้องทักมานะคะ', 'หยุดส่งข้อความ', 'อย่าส่งโปรมา', 'หยุด', 'stop', 'ＳＴＯＰ！', 'unsubscribe',
  'Don’t   message me', 'stop sending', 'stop sending me messages', 'stop sending me promotions',
])('detects the opt-out %s', (message) => {
  expect(isOptOutMessage(message)).toBe(true);
});

it.each([
  'ไม่ต้องห่อของขวัญ', 'ไม่ต้องส่งของ', 'ขอหยุดดูก่อนนะ', 'stop by tomorrow', 'stop sending the package',
])('keeps unrelated text %s', (message) => {
  expect(isOptOutMessage(message)).toBe(false);
});
