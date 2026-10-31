import crypto from 'node:crypto';
import { env } from '../config/env.js';

function key() {
  // Accept hex, base64 or any string; derive a 32-byte key deterministically.
  return crypto.createHash('sha256').update(String(env.DATA_ENCRYPTION_KEY)).digest();
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain) {
  if (plain === undefined || plain === null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(payload) {
  if (!payload) return '';
  const [v, iv, tag, ct] = String(payload).split('.');
  if (v !== 'v1') throw new Error('Unsupported ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

export const hmac = (value) => crypto.createHmac('sha256', String(env.HMAC_SECRET)).update(String(value)).digest('hex');
export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Signed, expiring token for links that work without a session (e.g. unsubscribe). */
export function signPayload(obj, ttlSeconds = 60 * 60 * 24 * 365) {
  const body = Buffer.from(JSON.stringify({ ...obj, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${hmac('sig:' + body)}`;
}

export function verifyPayload(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !safeEqual(sig, hmac('sig:' + body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}
