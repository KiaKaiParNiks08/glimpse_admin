import { parseBody } from '@/lib/validations';
import { adminLoginRequestSchema } from '@/lib/validations/auth';
import { ok, forbidden, serverError } from '@/lib/api-response';
import { isAdminRole } from '@/lib/rbac';
import { findUserByEmailAndVerifyPassword } from '@/server/users';
import { getAdminAccessContext, toClientAdminAccess } from '@/server/access';
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

    if (!isAdminRole(user.role_name)) {
      return forbidden('Access denied. Guest accounts cannot sign in to the admin portal.');
    }

    const accessCtx = await getAdminAccessContext(user.id);
    if (!accessCtx) {
      return forbidden('Account is inactive or not permitted.');
    }

    const jwtToken = createAdminJwtToken({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role_name: user.role_name,
    });

    const res = ok(
      {
        user: toClientAdminAccess(accessCtx),
        token: jwtToken,
      },
      'Success'
    );

    res.cookies.set(COOKIE_NAME, jwtToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isRequestHttps(request),
      path: '/',
      maxAge: getAdminJwtTtlSeconds(),
    });

    return res;
  } catch (e) {
    console.error(e);
    return serverError('Login failed');
  }
}
