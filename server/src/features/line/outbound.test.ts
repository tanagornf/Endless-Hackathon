import { describe, expect, it } from 'vitest';
import { splitLineText } from './outbound';

describe('LINE outbound text', () => {
  it('keeps emoji-heavy messages within the provider UTF-16 limit without breaking surrogate pairs', () => {
    const original = '🎲'.repeat(5_000);
    const chunks = splitLineText(original);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((part) => part.length <= 4_800)).toBe(true);
    expect(chunks.every((part) => !/[\uD800-\uDBFF]$/.test(part) && !/^[\uDC00-\uDFFF]/.test(part))).toBe(true);
    expect(chunks.join('')).toBe(original);
  });
});
