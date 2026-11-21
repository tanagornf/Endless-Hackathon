const mask = '[REDACTED]';
const secretKey = /authorization|cookie|password|secret|token|api[_-]?key|slip|image|dataurl|file_data/i;

export function redactText(input: string, maxLen = 500): string {
  const text = input
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, mask)
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, mask)
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, mask)
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, '$1[REDACTED]@')
    .replace(/\b(authorization|set-cookie|cookie|password|passwd|secret|access[_-]?token|refresh[_-]?token|token|api[_-]?key|client[_-]?secret|code|verifier|invite)\s*([:=])\s*(?:"[^"]*"|'[^']*'|\S+)/gi,
      (_match, key: string, separator: string) => key + separator + mask)
    .replace(/[A-Za-z0-9+/_-]{40,}={0,2}/g, mask)
    .replace(/\b[0-9a-f]{32,}\b/gi, mask)
    .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, '[email]')
    .replace(/\b0[689]\d[- ]?\d{3}[- ]?\d{4}\b/g, '[phone]')
    .replace(/\b\d{13}\b/g, '[id]')
    .replace(/(?<!\d)(?:\d[ -]?){12,18}\d(?![ -]?\d)/g, '[card]');
  const limit = Number.isFinite(maxLen) ? Math.max(0, Math.floor(maxLen)) : 500;
  return text.length <= limit ? text : limit ? text.slice(0, limit - 1) + '…' : '';
}

export function redactObject<T>(input: T, opts?: { maxStringLen?: number }): T {
  function visit(value: unknown, depth: number): unknown {
    if (typeof value === 'string') return redactText(value, opts?.maxStringLen ?? 300);
    if (value === null || typeof value !== 'object') return value;
    if (depth >= 6 || ArrayBuffer.isView(value)) return mask;
    if (Array.isArray(value)) return value.slice(0, 50).map((child) => visit(child, depth + 1));
    if (value instanceof Date) return new Date(value.valueOf());
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key, secretKey.test(key) ? mask : visit(child, depth + 1),
    ]));
  }
  try { return visit(input, 0) as T; }
  catch { return mask as T; }
}
