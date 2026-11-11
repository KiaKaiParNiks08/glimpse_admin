import { ok, forbidden } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { getAdminAccessContext, toClientAdminAccess } from '@/server/access';

export async function GET(request: Request) {
  const jwtUser = getAdminFromAuthorizationHeader(request);
  if (!jwtUser) return forbidden('Not authenticated');
  const ctx = await getAdminAccessContext(jwtUser.id);
  if (!ctx) return forbidden('Not authenticated');
  return ok({ user: toClientAdminAccess(ctx) }, 'Success');
}
