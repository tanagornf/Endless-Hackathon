import { expect, test } from 'vitest';
import { loadConfig } from './config';
import { decryptSecret, encryptSecret } from './crypto';

test('encryption authenticates its ciphertext', () => {
  const text = 'synthetic provider credential';
  const ciphertext = encryptSecret(text);
  expect(ciphertext).not.toContain(text);
  expect(decryptSecret(ciphertext)).toBe(text);
  const chunks = ciphertext.split(':');
  const tag = Buffer.from(chunks[3], 'base64url');
  tag[0] ^= 1;
  chunks[3] = tag.toString('base64url');
  expect(() => decryptSecret(chunks.join(':'))).toThrow(/encrypted value/);
});
test('production requires a 32-byte encryption key', () => {
  expect(() => loadConfig({ NODE_ENV: 'production', TOKEN_ENCRYPTION_KEY: 'invalid' })).toThrow(/TOKEN_ENCRYPTION_KEY/);
});
