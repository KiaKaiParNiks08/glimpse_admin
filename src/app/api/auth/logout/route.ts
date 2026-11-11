import { authLogoutRequestSchema, parseBody } from '@/lib/validations';
import { forbidden, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { deactivateUserDevice } from '@/server/user-devices';

/**
 * POST /api/auth/logout
 * Authenticated guest sign-out: deactivates the current (user_id, device_id) push registration
 * without disturbing active logins on other devices.
 */
export async function POST(request: Request) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    if (!user) return forbidden('Not authenticated');

    const [body, err] = await parseBody(request, authLogoutRequestSchema);
    if (err) return err;

    await deactivateUserDevice({
      user_id: user.id,
      device_id: body.device_id,
    });

    const res = ok({ success: true }, 'Logged out');
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (error) {
    console.error('POST /api/auth/logout error:', error);
    return serverError('Unable to log out');
  }
}
