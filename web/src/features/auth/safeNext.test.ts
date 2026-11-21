import { expect, it } from 'vitest';
import { safeNext } from './safeNext';

it('allows only local destinations', () => {
  expect(safeNext('/chat?tab=mine#recent')).toBe('/chat?tab=mine#recent');
  for (const unsafe of [null, '//example.test', 'https://example.test', '/\\example.test', '/\t/example.test', 'javascript:']) {
    expect(safeNext(unsafe)).toBe('/');
  }
});
