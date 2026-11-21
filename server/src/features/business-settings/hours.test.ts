import { SEED } from '@nless/shared/core/fixtures';
import type { WeeklyHours } from '@nless/shared/core/types';
import { describe, expect, it } from 'vitest';
import { calculateOpenState, isRealDate, isValidTimeZone, localParts, localToUtc, validateWeeklyHours } from './hours';
import { WeeklyHoursSchema } from './schemas';

const shopA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const shopB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const closed: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

describe('F04 business hours and local dates', () => {
  it('rejects reversed, overlapping and touching intervals and accepts a closed week', () => {
    expect(validateWeeklyHours({ ...closed, mon: [{ open: '14:00', close: '12:00' }] }))
      .toMatchObject([{ path: 'hours.mon.0', code: 'close_before_open' }]);
    for (const open of ['11:30', '12:00']) {
      expect(validateWeeklyHours({ ...closed, mon: [{ open: '10:00', close: '12:00' }, { open, close: '13:00' }] }))
        .toMatchObject([{ path: 'hours.mon.1', code: 'overlap_or_touching' }]);
    }
    expect(validateWeeklyHours(closed)).toEqual([]);
  });

  it('accepts four intervals and rejects five intervals or 24-hour overflow', () => {
    const intervals = [
      { open: '01:00', close: '02:00' }, { open: '03:00', close: '04:00' },
      { open: '05:00', close: '06:00' }, { open: '07:00', close: '08:00' },
    ];
    expect(WeeklyHoursSchema.safeParse({ ...closed, mon: intervals }).success).toBe(true);
    expect(WeeklyHoursSchema.safeParse({ ...closed, mon: [...intervals, { open: '09:00', close: '10:00' }] }).success).toBe(false);
    expect(WeeklyHoursSchema.safeParse({ ...closed, mon: [{ open: '21:00', close: '24:00' }] }).success).toBe(false);
  });

  it('accepts named IANA zones and actual dates', () => {
    expect(isValidTimeZone('Asia/Bangkok')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(isValidTimeZone('EST')).toBe(false);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-30')).toBe(false);
  });

  it('converts local times to UTC in Bangkok and across a New York DST transition', () => {
    expect(localToUtc('2026-11-21', '10:00', 'Asia/Bangkok').toISOString()).toBe('2026-11-21T03:00:00.000Z');
    expect(localParts(new Date('2026-11-21T03:00:00Z'), 'Asia/Bangkok'))
      .toEqual({ date: '2026-11-21', time: '10:00', weekday: 'sat' });
    expect(localToUtc('2026-03-07', '09:00', 'America/New_York').toISOString()).toBe('2026-03-07T14:00:00.000Z');
    expect(localToUtc('2026-03-08', '09:00', 'America/New_York').toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('checks open intervals, closed days, closures and the next shop opening', () => {
    const zone = 'Asia/Bangkok';
    const status = (hours: WeeklyHours, at: string) => calculateOpenState(hours, zone, [], new Date(at));
    expect(status(shopA.settings.hours, '2026-11-21T03:00:00Z')).toMatchObject({ open: true, reason: 'open', nextOpenAt: null });
    expect(status(shopA.settings.hours, '2026-11-21T14:00:00Z'))
      .toMatchObject({ open: false, reason: 'outside_hours', nextOpenAt: '2026-11-22T03:00:00.000Z' });
    expect(status(shopB.settings.hours, '2026-11-22T03:00:00Z'))
      .toMatchObject({ open: false, reason: 'closed_day', nextOpenAt: '2026-11-23T02:00:00.000Z' });
    const closure = { id: 'closure', startDate: '2026-11-22', endDate: '2026-11-23', reason: '' };
    expect(calculateOpenState(shopB.settings.hours, zone, [closure], new Date('2026-11-22T03:00:00Z')))
      .toMatchObject({ open: false, reason: 'closure', closure, nextOpenAt: '2026-11-24T02:00:00.000Z' });
    expect(status(closed, '2026-11-21T03:00:00Z')).toMatchObject({ open: false, reason: 'closed_day', nextOpenAt: null });
  });
});
