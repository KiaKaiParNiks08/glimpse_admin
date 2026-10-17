import { authSwitchEventRequestSchema, parseBody } from '@/lib/validations';
import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { createUserJwtToken, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { isEventGuest } from '@/server/event-guests';

/**
 * POST /api/auth/switch-event
 * Body: { event_id }. Requires a valid user JWT. Issues a new token for that event
 * if the user is already a guest. No OTP.
 */
export async function POST(request: Request) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    if (!user) return forbidden('Not authenticated');

    const [body, err] = await parseBody(request, authSwitchEventRequestSchema);
    if (err) return err;

    const allowed = await isEventGuest(body.event_id, user.id);
    if (!allowed) return notFound('You have not joined this event');

    const issued = createUserJwtToken({ user_id: user.id, event_id: body.event_id });
    return ok(
      {
        user_id: user.id,
        event_id: body.event_id,
        token: issued.token,
        expires_at: issued.expires_at,
      },
      'Event switched'
    );
  } catch (error) {
    console.error('POST /api/auth/switch-event', error);
    return serverError('Unable to switch event');
  }
}
