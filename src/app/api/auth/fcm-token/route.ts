import { NextRequest } from 'next/server';
import { fcmTokenRequestSchema, parseBody } from '@/lib/validations';
import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import prisma from '@/server/prisma';
import { upsertUserDevice } from '@/server/user-devices';
import { ensureEventGuest, isEventGuest } from '@/server/event-guests';
import { getVenueContactForEvent } from '@/server/venues';

/**
 * POST /api/auth/fcm-token
 * Dedicated FCM token registration / refresh endpoint used by the mobile app.
 * Body: { user_id, event_id?, device_id, device_type, fcm_token }
 */
export async function POST(request: NextRequest) {
  try {
    const [body, err] = await parseBody(request, fcmTokenRequestSchema);
    if (err) return err;

    const jwtUser = getUserFromAuthorizationHeader(request);
    if (jwtUser && jwtUser.id !== body.user_id) {
      return forbidden('Authenticated user does not match user_id');
    }

    const user = await prisma.users.findUnique({
      where: { id: body.user_id },
      select: { id: true },
    });
    if (!user) {
      return notFound('User not found');
    }

    await upsertUserDevice({
      user_id: body.user_id,
      device_type: body.device_type,
      device_id: body.device_id,
      fcm_token: body.fcm_token,
    });

    if (body.event_id) {
      try {
        const alreadyGuest = await isEventGuest(body.event_id, body.user_id);
        if (!alreadyGuest) {
          const event = await prisma.events.findUnique({
            where: { id: body.event_id },
            select: { id: true, status: true, main_venue_id: true },
          });
          if (event && event.status !== 'cancelled' && event.status !== 'archived' && event.status !== 'draft') {
            const venue_contact_id = await getVenueContactForEvent(event.main_venue_id);
            await ensureEventGuest({
              event_id: event.id,
              user_id: body.user_id,
              venue_contact_id,
            });
          }
        }
      } catch (guestErr) {
        console.warn('[fcm-token] Unable to ensure event guest association:', guestErr);
      }
    }

    return ok({ success: true, needs_fcm_token_sync: false }, 'FCM token updated');
  } catch (error) {
    console.error('POST /api/auth/fcm-token error:', error);
    return serverError('Unable to update FCM token');
  }
}
