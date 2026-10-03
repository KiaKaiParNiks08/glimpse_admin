import { clearAdminSessionAction } from '@/app/actions/profile';
import { clearAdminJwtFromSessionStorage } from '@/lib/admin-jwt-client';

type Navigator = { replace(href: string): void; refresh?(): void };

/**
 * The only way client code may send an admin to /login. The /login layout redirects to
 * /dashboard while the session cookie exists, so both the cookie and the tab token must go,
 * otherwise /login and /dashboard redirect to each other forever.
 */
export async function signOutToLogin(nav: Navigator): Promise<void> {
  clearAdminJwtFromSessionStorage();
  try {
    await clearAdminSessionAction();
  } catch {
    // If the cookie survives, /login sends us back to /dashboard, whose layout restores the token.
  }
  nav.replace('/login');
  nav.refresh?.();
}
