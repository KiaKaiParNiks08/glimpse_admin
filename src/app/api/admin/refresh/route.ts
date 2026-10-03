import { ok, forbidden, serverError } from '@/lib/api-response';
import { createAdminJwtToken, verifyAdminJwtToken } from '@/lib/jwt';
import { isRequestHttps } from '@/lib/request-https';

const COOKIE_NAME = 'glimps_admin_session';

function getAdminJwtFromRequest(request: Request): string | null {
  const fromCookie = request.headers.get('cookie') ?? '';
  if (fromCookie) {
    const match = fromCookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    const cookieValue = match?.[1]?.trim();
    if (cookieValue) return decodeURIComponent(cookieValue);
  }

  const rawAuth = request.headers.get('authorization') ?? '';
  const bearer = rawAuth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

export async function POST(request: Request) {
  try {
    const existingToken = getAdminJwtFromRequest(request);
    if (!existingToken) return forbidden('Not authenticated');

    const admin = verifyAdminJwtToken(existingToken);
    if (!admin) return forbidden('Not authenticated');

    const token = createAdminJwtToken(admin);

    const res = ok({ token }, 'Success');
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isRequestHttps(request),
      path: '/',
    });

    return res;
  } catch (e) {
    console.error(e);
    return serverError('Refresh token failed');
  }
}

