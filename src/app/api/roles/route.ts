import { ok, serverError } from '@/lib/api-response';
import { listRoles } from '@/server/roles';

/**
 * GET /api/roles
 * Returns all roles (id + name) from the roles table.
 */
export async function GET() {
  try {
    const roles = await listRoles();
    return ok({ data: roles });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch roles');
  }
}

