import type { NextResponse } from 'next/server';
import { forbidden } from '@/lib/api-response';
import { requireAdminContextFromCookies, canContextAccessEvent } from '@/server/access';
import type { PermissionKey } from '@/lib/rbac';

export type EventViewerSession = {
  role_name: string;
  id: string;
};

/**
 * Ensures the caller is authenticated with an active admin/sub-user account,
 * holds any optional required permission (and underlying purchased feature),
 * and has tenant/assignment access to the specific event.
 *
 * @returns a NextResponse when access is denied; otherwise `null`.
 */
export async function requireEventViewer(
  eventId: string,
  requiredPerm?: PermissionKey
): Promise<NextResponse | null> {
  const auth = await requireAdminContextFromCookies();
  if (!auth.ok) return forbidden(auth.error);

  if (requiredPerm && !auth.ctx.hasPermission(requiredPerm)) {
    return forbidden('Forbidden');
  }

  const allowed = await canContextAccessEvent(auth.ctx, eventId);
  if (!allowed) return forbidden('Forbidden');

  return null;
}
