import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from './config';
import { AppError } from './errors';

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.TOKEN_ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['enc', 'v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptSecret(token: string): string {
  try {
    const [kind, version, iv, tag, body, ...rest] = token.split(':');
    if (kind !== 'enc' || version !== 'v1' || !iv || !tag || body === undefined || rest.length) throw new Error('Invalid format');
    const ivBytes = Buffer.from(iv, 'base64url');
    const tagBytes = Buffer.from(tag, 'base64url');
    if (ivBytes.length !== 12 || tagBytes.length !== 16) throw new Error('Invalid length');
    const decipher = createDecipheriv('aes-256-gcm', config.TOKEN_ENCRYPTION_KEY, ivBytes);
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new AppError('INTERNAL', 'Unable to read an encrypted value');
  }
}
