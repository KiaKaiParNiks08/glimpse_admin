import { authJoinEventRequestSchema, parseBody } from '@/lib/validations';
import { badRequest, conflict, notFound, ok, serverError, unauthorized } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { joinAuthenticatedUserToEvent } from '@/server/auth-join';

/**
 * POST /api/auth/join-event
 * Logged-in guest joins (or switches to) an event from the in-app sheet or QR. No OTP.
 */
export async function POST(request: Request) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    if (!user) return unauthorized('Not authenticated');

    const [body, err] = await parseBody(request, authJoinEventRequestSchema);
    if (err) return err;

    const result = await joinAuthenticatedUserToEvent({
      userId: user.id,
      event_code: body.event_code,
      event_id: body.event_id,
      device_type: body.device_type,
      device_id: body.device_id,
    });
    if (!result.ok) {
      if (result.status === 400) return badRequest(result.message);
      if (result.status === 409) return conflict(result.message);
      return notFound(result.message);
    }

    return ok(result.data, 'Joined event');
  } catch (error) {
    console.error('POST /api/auth/join-event', error);
    return serverError('Unable to join event');
  }
}
