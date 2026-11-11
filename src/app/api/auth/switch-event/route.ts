import { authSwitchEventRequestSchema, parseBody } from '@/lib/validations';
import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { createUserJwtToken, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { isEventGuest } from '@/server/event-guests';
import { getEventEffectiveFeatures } from '@/server/access';
import { needsFcmTokenSyncForUser, upsertUserDevice } from '@/server/user-devices';

/**
 * POST /api/auth/switch-event
 * Body: { event_id, device_type?, device_id?, fcm_token? }. Requires a valid user JWT. Issues a new token for that event
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

    let needs_fcm_token_sync: boolean;
    if (body.device_id) {
      const devStatus = await upsertUserDevice({
        user_id: user.id,
        device_type: body.device_type || 'android',
        device_id: body.device_id,
        fcm_token: body.fcm_token,
      });
      needs_fcm_token_sync = !devStatus.has_fcm_token;
    } else {
      needs_fcm_token_sync = await needsFcmTokenSyncForUser(user.id);
    }

    const issued = createUserJwtToken({ user_id: user.id, event_id: body.event_id });
    const enabled_features = await getEventEffectiveFeatures(body.event_id);
    const res = ok(
      {
        user_id: user.id,
        event_id: body.event_id,
        token: issued.token,
        expires_at: issued.expires_at,
        enabled_features,
        needs_fcm_token_sync,
      },
      'Event switched'
    );
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (error) {
    console.error('POST /api/auth/switch-event', error);
    return serverError('Unable to switch event');
  }
}
