import { parseBody } from '@/lib/validations';
import { adminLoginRequestSchema } from '@/lib/validations/auth';
import { ok, forbidden, serverError } from '@/lib/api-response';
import {
  findUserByEmailAndVerifyPassword,
  ADMIN_ROLE_NAMES,
} from '@/server/users';
// Legacy HMAC session token helper is no longer used (we now store JWT in cookie).
import { createAdminJwtToken, getAdminJwtTtlSeconds } from '@/lib/jwt';
import { isRequestHttps } from '@/lib/request-https';

const COOKIE_NAME = 'glimps_admin_session';

export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, adminLoginRequestSchema);
    if (err) return err;

    const { email, password } = body;

    const user = await findUserByEmailAndVerifyPassword(email, password);
    if (!user) {
      return forbidden('Invalid email or password');
    }

    const allowedRoles = new Set(ADMIN_ROLE_NAMES);
    if (!allowedRoles.has(user.role_name as (typeof ADMIN_ROLE_NAMES)[number])) {
      return forbidden(
        'Access denied. Only SuperAdmin and Event Admin can sign in here.'
      );
    }

    const jwtToken = createAdminJwtToken({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role_name: user.role_name as 'super_admin' | 'event_admin',
    });

    const res = ok(
      {
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role_name: user.role_name,
        },
        token: jwtToken,
      },
      'Success'
    );

    // Store the JWT in the admin cookie so server-side middleware can validate it too.
    // (We still return the JWT in the response body for browser-side Bearer usage.)
    res.cookies.set(COOKIE_NAME, jwtToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isRequestHttps(request),
      path: '/',
      // Expire together with the JWT inside it.
      maxAge: getAdminJwtTtlSeconds(),
    });

    return res;
  } catch (e) {
    console.error(e);
    return serverError('Login failed');
  }
}
