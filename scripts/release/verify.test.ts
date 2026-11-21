import { expect, it } from 'vitest';
import { productionResult } from './verify';

it('records a green golden path only at nine passed and twelve accounted checks', () => {
  const stats = { expected: 9, unexpected: 0, skipped: 3, flaky: 0 };
  expect(productionResult({ stats }, 0)).toEqual({ passed: 9, failed: 0, skipped: 3, green: true });
  expect(productionResult({ stats: { ...stats, expected: 8, skipped: 4 } }, 0).green).toBe(false);
  expect(productionResult({ stats: { ...stats, skipped: 0 } }, 0).green).toBe(false);
  expect(productionResult({ stats: { ...stats, unexpected: 1, skipped: 2 } }, 0).green).toBe(false);
  expect(productionResult({ stats: { ...stats, flaky: 1, skipped: 2 } }, 0).green).toBe(false);
  expect(productionResult({ stats }, 1).green).toBe(false);
  expect(() => productionResult({ stats: { ...stats, expected: -1 } }, 0)).toThrow();
});
