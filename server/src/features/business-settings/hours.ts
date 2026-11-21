import { BUSINESS_WEEKDAYS } from '@nless/shared/features/business-settings/types';
import type { BusinessClosure, BusinessOpenState } from '@nless/shared/features/business-settings/types';
import type { Weekday, WeeklyHours } from '@nless/shared/core/types';

const millisecondsPerMinute = 60_000;
const millisecondsPerDay = 86_400_000;
const lookaheadDays = 31;
const utcWeekdays: readonly Weekday[] = ['sun', ...BUSINESS_WEEKDAYS.slice(0, 6)];

export function validateWeeklyHours(hours: WeeklyHours) {
  const issues: { path: string; code: string; message: string }[] = [];
  for (const weekday of BUSINESS_WEEKDAYS) {
    for (const [index, interval] of hours[weekday].entries()) {
      const path = 'hours.' + weekday + '.' + index;
      const previous = hours[weekday][index - 1];
      if (interval.close <= interval.open) {
        issues.push({ path, code: 'close_before_open', message: 'Closing time must be after opening time' });
      } else if (previous && interval.open <= previous.close) {
        issues.push({ path, code: 'overlap_or_touching', message: 'Opening intervals cannot overlap or touch' });
      }
    }
  }
  return issues;
}

export function isValidTimeZone(zone: string): boolean {
  if (zone !== 'UTC' && !zone.includes('/')) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function isRealDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const instant = new Date(date + 'T00:00:00Z');
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === date;
}

function zoneFormatter(timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
}

function formatLocal(instant: Date, formatter: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  return {
    date: [parts.year!.padStart(4, '0'), parts.month, parts.day].join('-'),
    time: [parts.hour, parts.minute].join(':'),
    weekday: parts.weekday!.toLowerCase() as Weekday,
  };
}

export function localParts(instant: Date, timezone: string) {
  return formatLocal(instant, zoneFormatter(timezone));
}

export function localToUtc(date: string, time: string, timezone: string): Date {
  const formatter = zoneFormatter(timezone);
  const guess = Date.parse(date + 'T' + time + ':00Z');
  const offsetAt = (instant: number) => {
    const parts = formatLocal(new Date(instant), formatter);
    return Date.parse(parts.date + 'T' + parts.time + ':00Z') - Math.floor(instant / millisecondsPerMinute) * millisecondsPerMinute;
  };
  const candidates = [
    guess - offsetAt(guess - millisecondsPerDay),
    guess - offsetAt(guess + millisecondsPerDay),
  ].sort((a, b) => a - b);
  for (const candidate of candidates) {
    const parts = formatLocal(new Date(candidate), formatter);
    if (parts.date === date && parts.time === time) return new Date(candidate);
  }
  // During a daylight-saving gap, move forward by the change in offset.
  return new Date(candidates[1]!);
}

export function localDateDuration(startDate: string, endDate: string): number {
  return (Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / millisecondsPerDay;
}

function covers(closure: BusinessClosure, date: string): boolean {
  return closure.startDate <= date && closure.endDate >= date;
}

function nextOpening(hours: WeeklyHours, timezone: string, closures: readonly BusinessClosure[], date: string, time: string) {
  const firstDay = Date.parse(date + 'T00:00:00Z');
  for (let offset = 0; offset <= lookaheadDays; offset++) {
    const day = new Date(firstDay + offset * millisecondsPerDay);
    const dayDate = day.toISOString().slice(0, 10);
    if (closures.some((closure) => covers(closure, dayDate))) continue;
    const weekday = utcWeekdays[day.getUTCDay()]!;
    const next = (hours[weekday] ?? []).find(({ open }) => offset > 0 || open > time);
    if (next) return localToUtc(dayDate, next.open, timezone).toISOString();
  }
  return null;
}

export function calculateOpenState(
  hours: WeeklyHours, timezone: string, closures: readonly BusinessClosure[], at: Date,
): BusinessOpenState {
  const { date, time, weekday } = localParts(at, timezone);
  const closure = closures.find((value) => covers(value, date)) ?? null;
  const intervals = hours[weekday] ?? [];
  const open = !closure && intervals.some((interval) => interval.open <= time && time < interval.close);
  const reason = closure ? 'closure' : open ? 'open' : intervals.length ? 'outside_hours' : 'closed_day';
  return {
    open, reason, localDate: date, localTime: time, timezone,
    nextOpenAt: open ? null : nextOpening(hours, timezone, closures, date, time),
    closure,
  };
}
