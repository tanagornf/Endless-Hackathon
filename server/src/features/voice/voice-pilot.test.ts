import { describe, expect, it } from 'vitest';
import { matchesVoicePilot } from './pilot';

const sender = {
  businessId: 'a1234567-1234-4234-8234-1234567890ab',
  lineBot: 'U' + 'a'.repeat(32),
  lineUser: 'U' + 'b'.repeat(32),
};
const rule = [sender.businessId, sender.lineBot, sender.lineUser].join(':');

describe('F30 pilot authorization', () => {
  it('denies absent, malformed or multiple-actor configuration', () => {
    for (const value of [undefined, '', '*', rule + ',*', rule + '\n', rule + '\n' + rule]) {
      expect(matchesVoicePilot(value, sender)).toBe(false);
    }
  });

  it('matches exactly one signed shop, OA and LINE subject', () => {
    expect(matchesVoicePilot(rule, sender)).toBe(true);
    expect(matchesVoicePilot(rule, { ...sender, businessId: 'different' })).toBe(false);
    expect(matchesVoicePilot(rule, { ...sender, lineBot: sender.lineUser })).toBe(false);
    expect(matchesVoicePilot(rule, { ...sender, lineUser: sender.lineBot })).toBe(false);
  });
});
