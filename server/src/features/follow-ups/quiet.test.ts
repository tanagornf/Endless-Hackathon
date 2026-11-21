import { expect, it } from 'vitest';
import { nextAllowedTime } from './quiet';

it.each([
  ['2026-11-21T18:30:00.000Z', '2026-11-22T01:00:00.000Z'],
  ['2026-11-21T03:00:00.000Z', '2026-11-21T03:00:00.000Z'],
  ['2026-11-21T14:00:00.000Z', '2026-11-22T01:00:00.000Z'],
  ['2026-11-21T00:59:00.000Z', '2026-11-21T01:00:00.000Z'],
  ['2026-11-21T00:59:59.000Z', '2026-11-21T01:00:00.000Z'],
  ['2026-11-21T01:00:03.000Z', '2026-11-21T01:00:03.000Z'],
])('finds the next allowed Bangkok time for %s', (time, expected) => {
  expect(nextAllowedTime(new Date(time), 'Asia/Bangkok', '21:00', '08:00').toISOString()).toBe(expected);
});

it('honors same-day, disabled and non-Bangkok quiet hours', () => {
  const from = new Date('2026-11-21T06:15:00.000Z');
  expect(nextAllowedTime(from, 'Asia/Bangkok', '13:00', '15:00').toISOString()).toBe('2026-11-21T08:00:00.000Z');
  expect(nextAllowedTime(from, 'Asia/Bangkok', '13:00', '13:00')).toBe(from);
  expect(nextAllowedTime(from, 'Asia/Tokyo', '13:00', '15:00')).toBe(from);
});

it('finds the first allowed instant when daylight saving time skips the quiet end', () => {
  const from = new Date('2026-03-08T06:55:00.000Z');
  expect(nextAllowedTime(from, 'America/New_York', '00:00', '02:30').toISOString()).toBe('2026-03-08T07:00:00.000Z');
});
