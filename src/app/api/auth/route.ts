import { authRequestSchema, parseBody } from '@/lib/validations';
import { ok, serverError, notFound, forbidden, conflict } from '@/lib/api-response';
import {
  getRoleByName,
  getEventByCode,
  getVenueContactForEvent,
  findOrCreateGuestUser,
  createOtpForUser,
  ensureEventGuest,
  upsertUserDevice,
} from '@/server';

const USER_ROLE_NAME = 'user';

export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, authRequestSchema);
    if (err) return err;

    const { country_code, mobile_number, event_code, device_type, device_id } = body;

    const userRole = await getRoleByName(USER_ROLE_NAME);
    if (!userRole) {
      return serverError('User role not found in system');
    }

    const event = await getEventByCode(event_code);
    if (!event) {
      return notFound('Invalid or unknown event code');
    }

    const venue_contact_id = await getVenueContactForEvent(event.main_venue_id);

    let userResult;
    try {
      userResult = await findOrCreateGuestUser({
        mobile_number,
        country_code,
        user_role_id: userRole.id,
        user_role_name: userRole.name,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'MOBILE_REGISTERED_DIFFERENT_ROLE') {
        return forbidden('Mobile number is registered with a different role');
      }
      throw e;
    }

    const { user_id, is_new_user } = userResult;

    await upsertUserDevice({
      user_id,
      device_type,
      device_id,
    });

    const { otp, expires_at } = await createOtpForUser({
      user_id,
      expiry_minutes: 10,
    });

    await ensureEventGuest({
      event_id: event.id,
      user_id,
      venue_contact_id,
    });

    const message = is_new_user
      ? 'User created, OTP sent; verify to continue'
      : 'OTP sent; verify to continue';

    return ok(
      {
        user_id,
        country_code,
        mobile_number,
        event_id: event.id,
        otp,
        otp_expires_at: expires_at.toISOString(),
      },
      message
    );
  } catch (e: unknown) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return conflict('User or event guest record already exists');
    }
    console.error(e);
    return serverError('Authentication request failed');
  }
}
