import { describe, expect, it } from 'vitest';
import { decodeImportText, truncateCodePoints } from './decode';

describe('F06 import text decoding', () => {
  it('reads UTF-8, removes a BOM and NULs, normalizes line endings and NFC', () => {
    const bytes = Buffer.from('\uFEFFcafe\u0301\r\nภาษาไทย\0\rnext');
    expect(decodeImportText(bytes)).toBe('café\nภาษาไทย\nnext');
    expect(decodeImportText(Buffer.from('plain'))).toBe('plain');
  });

  it('accepts both UTF-16 byte orders when a BOM identifies the encoding', () => {
    const littleEndian = Buffer.from('\uFEFFสินค้า,ราคา', 'utf16le');
    expect(decodeImportText(littleEndian)).toBe('สินค้า,ราคา');
    expect(decodeImportText(Buffer.from(littleEndian).swap16())).toBe('สินค้า,ราคา');
  });

  it('reads Windows-874 Thai exported by Excel', () => {
    expect(decodeImportText(Uint8Array.of(0xe4, 0xb7, 0xc2, 44, 49))).toBe('ไทย,1');
  });

  it('rejects a truncated UTF-16 code unit and invalid legacy bytes', () => {
    for (const bytes of [Uint8Array.of(0xff, 0xfe, 0x41), Uint8Array.of(0x81)]) {
      expect(() => decodeImportText(bytes)).toThrow(expect.objectContaining({
        code: 'VALIDATION_ERROR', details: { reason: 'invalid_encoding' },
      }));
    }
  });

  it('truncates decoded text and cells by Unicode code point', () => {
    const sample = 'A🎲บ';
    expect(decodeImportText(Buffer.from(sample), 2)).toBe('A🎲');
    expect(truncateCodePoints(sample, 0)).toBe('');
    expect(truncateCodePoints(sample, 3)).toBe(sample);
  });
});
