import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;
const FORMAT = /^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/;

function derive(plain: string, salt: Buffer, params: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain.normalize('NFKC'), salt, KEY_LENGTH, { ...params, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function parse(stored: string) {
  const match = FORMAT.exec(stored);
  if (!match || match[0] !== stored) return null;
  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  if (N < 2 || N > 32768 || (N & (N - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 4) return null;
  if (128 * N * r > MAX_MEMORY - 1024 * 1024) return null;
  const salt = Buffer.from(match[4], 'base64url');
  const key = Buffer.from(match[5], 'base64url');
  if (salt.toString('base64url') !== match[4] || key.toString('base64url') !== match[5]) return null;
  return { params: { N, r, p }, salt, key };
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(plain, salt, SCRYPT);
  return `scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  try {
    return timingSafeEqual(await derive(plain, parsed.salt, parsed.params), parsed.key);
  } catch {
    return false;
  }
}

export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return parsed === null || parsed.params.N !== SCRYPT.N || parsed.params.r !== SCRYPT.r || parsed.params.p !== SCRYPT.p;
}

export function passwordCharacterCount(plain: string): number {
  return [...plain.normalize('NFKC')].length;
}

export function validatePassword(plain: string) {
  const length = passwordCharacterCount(plain);
  if (length < PASSWORD_MIN) return 'too_short';
  if (length > PASSWORD_MAX) return 'too_long';
  return null;
}
