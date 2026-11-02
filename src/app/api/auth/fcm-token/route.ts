import { NextRequest } from 'next/server';
import { fcmTokenRequestSchema, parseBody } from '@/lib/validations';
import { ok, serverError } from '@/lib/api-response';
import { upsertUserDevice } from '@/server/user-devices';
import { ensureEventGuest } from '@/server/event-guests';

/**
 * POST /api/auth/fcm-token
 * Dedicated FCM token registration / refresh endpoint used by the mobile app.
 * Body: { user_id, event_id?, device_id, device_type, fcm_token }
 */
export async function POST(request: NextRequest) {
  try {
    const [body, err] = await parseBody(request, fcmTokenRequestSchema);
    if (err) return err;

    await upsertUserDevice({
      user_id: body.user_id,
      device_type: body.device_type,
      device_id: body.device_id,
      fcm_token: body.fcm_token,
    });

    if (body.event_id) {
      try {
        await ensureEventGuest({
          event_id: body.event_id,
          user_id: body.user_id,
        });
      } catch (guestErr) {
        console.warn('[fcm-token] Unable to ensure event guest association:', guestErr);
      }
    }

    return ok({ success: true }, 'FCM token updated');
  } catch (error) {
    console.error('POST /api/auth/fcm-token error:', error);
    return serverError('Unable to update FCM token');
  }
}
