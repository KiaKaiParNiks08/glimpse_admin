import { ok, forbidden, serverError } from '@/lib/api-response';
import { createUserJwtToken, verifyUserJwtToken } from '@/lib/jwt';

function getBearerToken(request: Request): string | null {
  const raw = request.headers.get('authorization') ?? '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) return forbidden('Not authenticated');

    const user = verifyUserJwtToken(token);
    if (!user) return forbidden('Not authenticated');

    const refreshed = createUserJwtToken({ user_id: user.id, event_id: user.event_id });

    return ok(
      {
        user_id: user.id,
        event_id: user.event_id,
        token: refreshed.token,
        expires_at: refreshed.expires_at,
      },
      'Success'
    );
  } catch (e) {
    console.error(e);
    return serverError('Refresh token failed');
  }
}

