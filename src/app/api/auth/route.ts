import { authRequestSchema, parseBody } from '@/lib/validations';
import { ok, serverError, notFound, forbidden, conflict } from '@/lib/api-response';
import {
  getRoleByName,
  getVenueContactForEvent,
  findOrCreateGuestUser,
  createOtpForUser,
  ensureEventGuest,
  upsertUserDevice,
} from '@/server';
import { isEventGuest } from '@/server/event-guests';
import { resolveAuthEvent } from '@/server/auth-login';

const USER_ROLE_NAME = 'user';

function mapChoice(event: {
  event_id: string;
  event_code: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
}) {
  return {
    event_id: event.event_id,
    event_code: event.event_code,
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    cover_image: event.cover_image,
  };
}

export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, authRequestSchema);
    if (err) return err;

    const { country_code, mobile_number, event_code, event_id, email, device_type, device_id } = body;

    const userRole = await getRoleByName(USER_ROLE_NAME);
    if (!userRole) {
      return serverError('User role not found in system');
    }

    const resolved = await resolveAuthEvent({
      event_code,
      event_id,
      email,
      mobile_number,
      user_role_id: userRole.id,
    });
    if (!resolved.ok) {
      if (resolved.status === 'choose') {
        const events = resolved.events.map(mapChoice);
        const isReturning = events.length > 0;
        return ok(
          {
            user_id: null,
            country_code: country_code ?? null,
            mobile_number: mobile_number ?? null,
            email: email ?? null,
            event_id: null,
            is_returning: isReturning,
            requires_event_selection: isReturning,
            allow_new_event_login: true,
            event_count: events.length,
            events,
          },
          isReturning
            ? 'Select a previous event or join a new one'
            : 'Enter an event code to join a new event'
        );
      }
      if (resolved.status === 'forbidden') return forbidden(resolved.message);
      return notFound(resolved.message);
    }

    const event = resolved.event;

    let userResult;
    try {
      userResult = await findOrCreateGuestUser({
        mobile_number,
        country_code,
        user_role_id: userRole.id,
        user_role_name: userRole.name,
        email: email ?? null,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'MOBILE_REGISTERED_DIFFERENT_ROLE') {
        return forbidden('Mobile number is registered with a different role');
      }
      if (e instanceof Error && e.message === 'EMAIL_IN_USE') {
        return conflict('This email is already used by another account');
      }
      throw e;
    }

    const { user_id, is_new_user } = userResult;

    const [otpResult] = await Promise.all([
      createOtpForUser({ user_id, expiry_minutes: 10 }),
      device_id && device_type
        ? upsertUserDevice({ user_id, device_type, device_id })
        : Promise.resolve(),
      (async () => {
        if (!is_new_user && (await isEventGuest(event.id, user_id))) return;
        const venue_contact_id = await getVenueContactForEvent(event.main_venue_id);
        await ensureEventGuest({ event_id: event.id, user_id, venue_contact_id });
      })(),
    ]);
    const { otp, expires_at } = otpResult;

    const message = is_new_user
      ? 'User created, OTP sent; verify to continue'
      : 'OTP sent; verify to continue';

    return ok(
      {
        user_id,
        country_code: country_code ?? null,
        mobile_number: mobile_number ?? null,
        email: email ?? null,
        event_id: event.id,
        event_code: event.event_code ?? event_code ?? null,
        requires_event_selection: false,
        event_count: 1,
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
