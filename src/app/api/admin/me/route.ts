import { ok, forbidden } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';

export async function GET(request: Request) {
  const user = getAdminFromAuthorizationHeader(request);
  if (!user) return forbidden('Not authenticated');
  return ok({ user }, 'Success');
}

