/**
 * Opaque tokens for image/view URLs so the client never sees S3 keys or path structure.
 * The token is an encrypted S3 key; only the server can decrypt it.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;

function getSecret(): Buffer | null {
  const secret = process.env.UPLOAD_TOKEN_SECRET;
  if (!secret || secret.length < 16) return null;
  return scryptSync(secret, 'upload-token-salt', KEY_LENGTH);
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  return Buffer.from(b64, 'base64');
}

/**
 * Encrypt the S3 key into an opaque token. Returns null if UPLOAD_TOKEN_SECRET is not set (min 16 chars).
 */
export function encryptKey(key: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, secret, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return base64UrlEncode(combined);
}

/**
 * Decrypt the token back to the S3 key. Returns null if invalid.
 */
export function decryptToken(token: string): string | null {
  try {
    const secret = getSecret();
    if (!secret) return null;
    const combined = base64UrlDecode(token);
    if (combined.length < IV_LENGTH + TAG_LENGTH) return null;
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, secret, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return null;
  }
}
