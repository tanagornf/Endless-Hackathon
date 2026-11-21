const minuteMs = 60_000;

export function nextAllowedTime(from: Date, timezone: string, quietStart: string, quietEnd: string): Date {
  if (quietStart === quietEnd) return from;
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const isQuiet = (date: Date) => {
    const local = clock.format(date);
    return quietStart < quietEnd ? quietStart <= local && local < quietEnd : local >= quietStart || local < quietEnd;
  };
  if (!isQuiet(from)) return from;

  // Walk real instants to handle offset changes and take the first allowed local minute.
  const limit = from.getTime() + 24 * 60 * minuteMs;
  for (let next = (Math.floor(from.getTime() / minuteMs) + 1) * minuteMs; next <= limit; next += minuteMs) {
    const date = new Date(next);
    if (!isQuiet(date)) return date;
  }
  return new Date(limit);
}
