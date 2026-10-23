import { authRequestSchema, parseBody } from '@/lib/validations';
import { ok, serverError, notFound, forbidden, conflict, badRequest } from '@/lib/api-response';
import {
  getRoleByName,
  getVenueContactForEvent,
  findOrCreateGuestUser,
  createOtpForUser,
  ensureEventGuest,
  upsertUserDevice,
} from '@/server';
import { getEventByCode } from '@/server/events';
import { resolveAuthEvent, toAuthCategoryFields, toPublicEventChoice } from '@/server/auth-login';

const USER_ROLE_NAME = 'user';

export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, authRequestSchema);
    if (err) return err;

    const { country_code, mobile_number, event_code, event_id, email, device_type, device_id } = body;

    const rolePromise = getRoleByName(USER_ROLE_NAME);

    const [userRole, eventByCode] = await Promise.all([
      rolePromise,
      event_code ? getEventByCode(event_code) : Promise.resolve(null),
    ]);
    if (!userRole) {
      return serverError('User role not found in system');
    }

    if (event_code && !mobile_number && !email) {
      if (!eventByCode) return notFound('Invalid or unknown event code');
      return ok(
        {
          user_id: null,
          country_code: null,
          mobile_number: null,
          email: null,
          event_id: eventByCode.id,
          event_code: eventByCode.event_code,
          requires_event_selection: false,
          event_count: 1,
          ...toAuthCategoryFields(eventByCode.event_categories),
        },
        'Event code is valid'
      );
    }

    const resolved = event_code
      ? eventByCode
        ? ({ ok: true as const, event: eventByCode })
        : ({ ok: false as const, status: 'not_found' as const, message: 'Invalid or unknown event code' })
      : await resolveAuthEvent({
          event_code,
          event_id,
          email,
          mobile_number,
          user_role_id: userRole.id,
        });

    if (!resolved.ok) {
      if (resolved.status === 'needs_code') return badRequest(resolved.message);
      if (resolved.status === 'choose') {
        const events = resolved.events.map(toPublicEventChoice);
        return ok(
          {
            user_id: null,
            country_code: country_code ?? null,
            mobile_number: mobile_number ?? null,
            email: email ?? null,
            event_id: null,
            is_returning: true,
            requires_event_selection: true,
            allow_new_event_login: true,
            event_count: events.length,
            events,
          },
          'Select an event to continue'
        );
      }
      if (resolved.status === 'forbidden') return forbidden(resolved.message);
      return notFound(resolved.message);
    }

    const event = resolved.event;
    const category = toAuthCategoryFields(event.event_categories);

    try {
      const [createdUser, venue_contact_id] = await Promise.all([
        findOrCreateGuestUser({
          mobile_number,
          country_code,
          user_role_id: userRole.id,
          user_role_name: userRole.name,
          email: email ?? null,
        }),
        getVenueContactForEvent(event.main_venue_id),
      ]);

      const [otpResult] = await Promise.all([
        createOtpForUser({ user_id: createdUser.user_id, expiry_minutes: 10 }),
        device_id && device_type
          ? upsertUserDevice({ user_id: createdUser.user_id, device_type, device_id })
          : Promise.resolve(),
        ensureEventGuest({
          event_id: event.id,
          user_id: createdUser.user_id,
          venue_contact_id,
        }),
      ]);

      return ok(
        {
          user_id: createdUser.user_id,
          country_code: country_code ?? null,
          mobile_number: mobile_number ?? null,
          email: email ?? null,
          event_id: event.id,
          event_code: event.event_code ?? event_code ?? null,
          requires_event_selection: false,
          event_count: 1,
          otp: otpResult.otp,
          otp_expires_at: otpResult.expires_at.toISOString(),
          ...category,
        },
        createdUser.is_new_user
          ? 'User created, OTP sent; verify to continue'
          : 'OTP sent; verify to continue'
      );
    } catch (e) {
      if (e instanceof Error && e.message === 'MOBILE_REGISTERED_DIFFERENT_ROLE') {
        return forbidden('Mobile number is registered with a different role');
      }
      if (e instanceof Error && e.message === 'EMAIL_IN_USE') {
        return conflict('This email is already used by another account');
      }
      throw e;
    }
  } catch (e: unknown) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return conflict('User or event guest record already exists');
    }
    console.error(e);
    return serverError('Authentication request failed');
  }
}
