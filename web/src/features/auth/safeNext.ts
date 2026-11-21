export function safeNext(next: string | null): string {
  if (!next?.startsWith('/') || next.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(next)) return '/';
  return next;
}
