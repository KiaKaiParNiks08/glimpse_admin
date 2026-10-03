import { createHmac, timingSafeEqual } from 'crypto';
import type { AdminRoleName, AdminSessionUser } from '@/lib/admin-session';

/** Shared HS256 encode/sign/verify (admin + app-user tokens). */

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

function buildSignedJwt(secret: string, payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${base64urlEncode(sig)}`;
}

function verifyJwtSignature(token: string, secret: string): { payloadB64: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret).update(signingInput).digest();
  const expectedSigB64 = base64urlEncode(expectedSig);
  try {
    const a = base64urlDecodeToBuffer(sigB64);
    const b = base64urlDecodeToBuffer(expectedSigB64);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { payloadB64 };
}

function parsePayloadJson<T>(payloadB64: string): T | null {
  try {
    return JSON.parse(base64urlDecodeToBuffer(payloadB64).toString('utf8')) as T;
  } catch {
    return null;
  }
}

function isExpired(expSec: number | undefined): boolean {
  if (!expSec || expSec <= Math.floor(Date.now() / 1000)) return true;
  return false;
}

/** Dashboard admin JWT (`Bearer` on `/api/*`). */

type AdminJwtClaims = AdminSessionUser & {
  iat: number;
  exp: number;
};

function getAdminJwtSecret(): string {
  return (
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'dev-only-secret-change-me'
  );
}

export function getAdminJwtTtlSeconds(): number {
  const raw = process.env.ADMIN_JWT_TTL_SECONDS;
  if (!raw) return 60 * 60 * 24 * 7;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 24 * 7;
}

export function createAdminJwtToken(user: AdminSessionUser): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: AdminJwtClaims = {
    ...user,
    iat: nowSec,
    exp: nowSec + getAdminJwtTtlSeconds(),
  };
  return buildSignedJwt(getAdminJwtSecret(), payload as unknown as Record<string, unknown>);
}

export function verifyAdminJwtToken(token: string): AdminSessionUser | null {
  if (!token) return null;
  const verified = verifyJwtSignature(token, getAdminJwtSecret());
  if (!verified) return null;
  const parsed = parsePayloadJson<Partial<AdminJwtClaims>>(verified.payloadB64);
  if (!parsed) return null;

  const role = parsed.role_name as AdminRoleName | undefined;
  if (
    typeof parsed.id !== 'string' ||
    typeof parsed.email !== 'string' ||
    typeof parsed.full_name !== 'string' ||
    (role !== 'super_admin' && role !== 'event_admin')
  ) {
    return null;
  }
  if (isExpired(parsed.exp)) return null;

  return {
    id: parsed.id,
    full_name: parsed.full_name,
    email: parsed.email,
    role_name: role,
  };
}

export function getAdminFromAuthorizationHeader(request: {
  headers: { get(name: string): string | null };
}): AdminSessionUser | null {
  const raw = request.headers.get('authorization') ?? '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tok = match[1]?.trim();
  if (!tok) return null;
  return verifyAdminJwtToken(tok);
}

/** Mobile / event-scoped user JWT from `/api/auth/verify`. */

export type UserRoleName = 'user';

export type UserJwtUser = {
  id: string;
  event_id: string;
  role_name: UserRoleName;
};

type UserJwtClaims = UserJwtUser & {
  iat: number;
  exp: number;
};

function getUserJwtSecret(): string {
  return (
    process.env.USER_JWT_SECRET ||
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'dev-only-secret-change-me'
  );
}

function getUserJwtTtlSeconds(): number {
  const raw = process.env.USER_JWT_TTL_SECONDS ?? process.env.ADMIN_JWT_TTL_SECONDS;
  if (!raw) return 60 * 60 * 24 * 7;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 24 * 7;
}

export function createUserJwtToken(input: { user_id: string; event_id: string }): {
  token: string;
  /** When the JWT expires (ISO 8601), aligned with the token’s `exp` claim */
  expires_at: string;
} {
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = getUserJwtTtlSeconds();
  const expSec = nowSec + ttlSec;
  const payload: UserJwtClaims = {
    id: input.user_id,
    event_id: input.event_id,
    role_name: 'user',
    iat: nowSec,
    exp: expSec,
  };
  const token = buildSignedJwt(getUserJwtSecret(), payload as unknown as Record<string, unknown>);
  return {
    token,
    expires_at: new Date(expSec * 1000).toISOString(),
  };
}

export function verifyUserJwtToken(token: string): UserJwtUser | null {
  if (!token) return null;
  const verified = verifyJwtSignature(token, getUserJwtSecret());
  if (!verified) return null;
  const parsed = parsePayloadJson<Partial<UserJwtClaims>>(verified.payloadB64);
  if (!parsed || parsed.role_name !== 'user') return null;
  if (typeof parsed.id !== 'string' || typeof parsed.event_id !== 'string') return null;
  if (isExpired(parsed.exp)) return null;

  return {
    id: parsed.id,
    event_id: parsed.event_id,
    role_name: 'user',
  };
}

export function getUserFromAuthorizationHeader(request: {
  headers: { get(name: string): string | null };
}): UserJwtUser | null {
  const raw = request.headers.get('authorization') ?? '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tok = match[1]?.trim();
  if (!tok) return null;
  return verifyUserJwtToken(tok);
}
