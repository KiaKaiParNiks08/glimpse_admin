import { ADMIN_SESSION_KEY } from '@/lib/admin-auth';

/**
 * JWT token stored in sessionStorage by the admin login flow.
 * Used by the browser to call protected `/api/*` endpoints.
 */
export function getAdminJwtFromSessionStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setAdminJwtInSessionStorage(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAdminJwtFromSessionStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function adminBearerAuthHeader(): Record<string, string> {
  const token = getAdminJwtFromSessionStorage();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

