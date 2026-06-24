import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const SCHEME = 's1';

/** Returns a hashed string in the form `s1:<saltHex>:<keyHex>`. */
export async function hashOperatorPassword(plaintext: string): Promise<string> {
  if (plaintext.length < 6) {
    throw new Error('Operator password must be at least 6 characters');
  }
  const salt = randomBytes(16).toString('hex');
  const key = (await scryptAsync(plaintext, salt, KEYLEN)) as Buffer;
  return `${SCHEME}:${salt}:${key.toString('hex')}`;
}

export async function verifyOperatorPassword(stored: string, candidate: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== SCHEME) return false;
  const [, salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const cand = (await scryptAsync(candidate, salt, KEYLEN)) as Buffer;
  return keyBuf.length === cand.length && timingSafeEqual(keyBuf, cand);
}
