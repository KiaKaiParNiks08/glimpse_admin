import { ok } from '@/lib/api-response';
import { isRequestHttps } from '@/lib/request-https';

const COOKIE_NAME = 'glimps_admin_session';

export async function POST(request: Request) {
  const res = ok({}, 'Success');
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isRequestHttps(request),
    path: '/',
    maxAge: 0,
  });
  return res;
}

