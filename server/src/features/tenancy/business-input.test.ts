import { describe, expect, it } from 'vitest';
import { CreateBusinessBody, DeleteBusinessQuery } from './business-input';

describe('tenancy business input', () => {
  it('trims names and applies the default language and timezone', () => {
    expect(CreateBusinessBody.parse({ name: '  Demo shop  ' })).toEqual({
      name: 'Demo shop', language: 'th', timezone: 'Asia/Bangkok',
    });
  });

  it('validates shop names and IANA timezones', () => {
    expect(CreateBusinessBody.safeParse({ name: 'a' }).success).toBe(false);
    expect(CreateBusinessBody.safeParse({ name: 'Shop', timezone: 'Unknown/Zone' }).success).toBe(false);
    expect(CreateBusinessBody.safeParse({ name: 'Shop', timezone: 'Europe/London', language: 'en' }).success).toBe(true);
  });

  it('preserves the exact deletion confirmation string', () => {
    expect(DeleteBusinessQuery.parse({ confirmName: ' Shop ' }).confirmName).toBe(' Shop ');
  });
});
