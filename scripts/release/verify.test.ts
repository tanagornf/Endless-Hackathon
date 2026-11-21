import { expect, it } from 'vitest';
import { productionResult, requireSameServingBuild } from './verify';
import { parseReleaseFlags } from './status';

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

it('rejects changing build identity or provider mode before recording last-green', () => {
  const initial = { sha: 'abcdef1', modelMode: 'openai', schema: 'core/001_core.sql' };
  expect(() => requireSameServingBuild(initial, initial.sha)).not.toThrow();
  expect(() => requireSameServingBuild({ ...initial, sha: 'abcdef2' }, initial.sha)).toThrow(/changed/);
  expect(() => requireSameServingBuild({ ...initial, modelMode: 'fake' }, initial.sha)).toThrow(/changed/);
});

it('accepts the authenticated feature envelope and rejects duplicate flags', () => {
  const feature = { featureId: 'F21', visible: false, placeholder: true };
  expect(parseReleaseFlags({ data: { items: [feature] } }).get('F21')).toEqual({ id: 'F21', visible: false, placeholder: true });
  expect(() => parseReleaseFlags({ data: { items: [feature, feature] } })).toThrow(/duplicate/);
});
