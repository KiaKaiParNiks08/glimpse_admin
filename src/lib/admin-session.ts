import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { verifyAdminJwtToken } from '@/lib/jwt';

export type AdminRoleName = 'super_admin' | 'event_admin';

export type AdminSessionUser = {
  id: string;
  full_name: string;
  email: string;
  role_name: AdminRoleName;
};

const COOKIE_NAME = 'glimps_admin_session';

function base64urlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecodeToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

function getSecret(): string {
  // Required in production; fallback helps local dev.
  return process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'dev-only-secret-change-me';
}

function sign(data: string): string {
  return base64urlEncode(createHmac('sha256', getSecret()).update(data).digest());
}

export function createAdminSessionToken(user: AdminSessionUser): string {
  const payload = JSON.stringify({
    ...user,
    iat: Date.now(),
  });
  const payloadB64 = base64urlEncode(payload);
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionUser | null {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);

  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    const payloadRaw = base64urlDecodeToBuffer(payloadB64).toString('utf8');
    const parsed = JSON.parse(payloadRaw) as AdminSessionUser & { iat?: number };
    if (!parsed?.id || !parsed?.email || !parsed?.role_name) return null;
    if (parsed.role_name !== 'super_admin' && parsed.role_name !== 'event_admin') return null;
    return {
      id: parsed.id,
      full_name: parsed.full_name,
      email: parsed.email,
      role_name: parsed.role_name,
    };
  } catch {
    return null;
  }
}

export async function getAdminSessionFromCookies(): Promise<AdminSessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  // Backward compatible: support legacy cookie token and the new JWT cookie.
  return verifyAdminSessionToken(token) ?? verifyAdminJwtToken(token);
}

/** The admin JWT from the session cookie, or null if missing / legacy / invalid. */
export async function getAdminJwtFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !verifyAdminJwtToken(token)) return null;
  return token;
}

/** Only callable from server actions / route handlers. */
export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

