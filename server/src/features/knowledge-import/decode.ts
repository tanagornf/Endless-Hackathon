import { AppError } from '../../core/errors';

export function truncateCodePoints(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = 0;
  let count = 0;
  for (const character of text) {
    if (count >= maxChars) break;
    end += character.length;
    count++;
  }
  return text.slice(0, end);
}

function unsupportedEncoding(): AppError {
  return new AppError('VALIDATION_ERROR', 'Unsupported import text encoding', {
    details: { reason: 'invalid_encoding' },
  });
}

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    const littleEndian = bytes[0] === 0xff && bytes[1] === 0xfe;
    const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
    if (littleEndian || bigEndian) {
      try {
        return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be', { fatal: true }).decode(bytes);
      } catch {
        throw unsupportedEncoding();
      }
    }
  }
  let legacy: string;
  try {
    legacy = new TextDecoder('windows-874', { fatal: true }).decode(bytes);
  } catch {
    throw unsupportedEncoding();
  }
  const hasThai = /\p{Script=Thai}/u.test(legacy);
  const latinText = !/[^\p{Script=Latin}\p{M}\p{N}\p{P}\p{S}\s\u0000]/u.test(legacy);
  if ((!hasThai && !latinText) || /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffd]/u.test(legacy)) {
    throw unsupportedEncoding();
  }
  return legacy;
}

export function decodeImportText(bytes: Uint8Array, maxChars?: number): string {
  const text = decodeBytes(bytes).replace(/^\uFEFF/u, '').replace(/\r\n?/g, '\n').replaceAll('\0', '').normalize('NFC');
  return maxChars === undefined ? text : truncateCodePoints(text, maxChars);
}
