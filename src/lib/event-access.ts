import type { NextResponse } from 'next/server';
import { forbidden } from '@/lib/api-response';
import { getAdminSessionFromCookies } from '@/lib/admin-session';
import { isEventAdminAssigned } from '@/server/events';

export type EventViewerSession = {
  role_name: string;
  id: string;
};

/**
 * Ensures the caller is authenticated and, when the caller is `event_admin`,
 * that they are assigned to the specific event.
 *
 * @returns a NextResponse when access is denied; otherwise `null`.
 */
export async function requireEventViewer(eventId: string): Promise<NextResponse | null> {
  const session = await getAdminSessionFromCookies();
  if (!session) return forbidden('Not authenticated');

  if (session.role_name === 'event_admin') {
    const allowed = await isEventAdminAssigned(eventId, session.id);
    if (!allowed) return forbidden('Forbidden');
  }

  return null;
}

