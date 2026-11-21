import { expect, test } from 'vitest';
import { redactObject, redactText } from './redact';

test.each([
  'Bearer synthetic-testing-token',
  'sk-proj-synthetic-fixture-00000000',
  'eyJsynthetic1.synthetic2.synthetic3',
  'postgres://demo_user:synthetic_password@db.example.test',
  'password=test-fixture-only',
  'a'.repeat(42),
  'fake@example.test',
  '081-234-5678',
  '0000000000000',
])('redacts sensitive fixture %s', (value) => {
  const sanitized = redactText(value);
  expect(sanitized).not.toContain(value);
});

test('redacts nested secrets without changing its input and limits depth and length', () => {
  const original = { authorization: 'synthetic fixture', nested: { slipImage: 'synthetic image', text: 'ordinary safe sentence' }, list: Array<number>(80).fill(1) };
  const safe = redactObject(original, { maxStringLen: 10 });
  expect(safe).toEqual({ authorization: '[REDACTED]', nested: { slipImage: '[REDACTED]', text: 'ordinary …' }, list: Array<number>(50).fill(1) });
  expect(original.nested.slipImage).toBe('synthetic image');
  const cycle: Record<string, unknown> = {};
  cycle.back = cycle;
  expect(() => JSON.stringify(redactObject(cycle))).not.toThrow();
  expect(redactText('ordinary message')).toBe('ordinary message');
});
