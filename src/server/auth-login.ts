import { emailMatchesSuffix } from '@/lib/event-categories';
import { getEventByCode, getEventForAuthById, listEventsByEmailSuffix } from '@/server/events';
import prisma from '@/server/prisma';

export type AuthEventChoice = {
  event_id: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
};

type AuthEvent = {
  id: string;
  main_venue_id: string | null;
  email_suffix?: string | null;
};

export type ResolveAuthEventResult =
  | { ok: true; event: AuthEvent }
  | { ok: false; status: 'not_found'; message: string }
  | { ok: false; status: 'forbidden'; message: string }
  | { ok: false; status: 'choose'; events: AuthEventChoice[] };

function toChoice(event: {
  id: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
}): AuthEventChoice {
  return {
    event_id: event.id,
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    cover_image: event.cover_image,
  };
}

async function isExistingGuest(eventId: string, mobileNumber: string, roleId: number): Promise<boolean> {
  const user = await prisma.users.findFirst({
    where: { mobile_number: mobileNumber, role_id: roleId },
    select: { id: true },
  });
  if (!user) return false;
  const guest = await prisma.event_guests.findUnique({
    where: { event_id_user_id: { event_id: eventId, user_id: user.id } },
    select: { id: true },
  });
  return guest != null;
}

/**
 * Resolve which event a login request is for.
 * event_code wins; otherwise event_id (returning user or suffix pick); otherwise corporate email suffix.
 */
export async function resolveAuthEvent(input: {
  event_code?: string;
  event_id?: string;
  email?: string;
  mobile_number: string;
  user_role_id: number;
}): Promise<ResolveAuthEventResult> {
  if (input.event_code) {
    const event = await getEventByCode(input.event_code);
    if (!event) return { ok: false, status: 'not_found', message: 'Invalid or unknown event code' };
    return { ok: true, event };
  }

  if (input.event_id) {
    const event = await getEventForAuthById(input.event_id);
    if (!event) return { ok: false, status: 'not_found', message: 'Event not found' };
    const suffixOk = input.email ? emailMatchesSuffix(input.email, event.email_suffix) : false;
    const returning = await isExistingGuest(event.id, input.mobile_number, input.user_role_id);
    if (!suffixOk && !returning) {
      return {
        ok: false,
        status: 'forbidden',
        message: 'Event code or a matching corporate email is required',
      };
    }
    return { ok: true, event };
  }

  if (!input.email) {
    const previous = await prisma.$queryRaw<AuthEventChoice[]>`
      SELECT e.id AS event_id,
             e.title,
             e.start_date,
             e.end_date,
             e.cover_image
      FROM users u
      JOIN event_guests eg ON eg.user_id = u.id
      JOIN events e ON e.id = eg.event_id
      WHERE u.mobile_number = ${input.mobile_number}
        AND u.role_id = ${input.user_role_id}
      ORDER BY eg.joined_at DESC NULLS LAST, e.start_date DESC
    `;
    return { ok: false, status: 'choose', events: previous };
  }

  const matches = await listEventsByEmailSuffix(input.email);
  if (matches.length === 0) {
    return {
      ok: false,
      status: 'not_found',
      message: 'No event matches this email. Enter an event code.',
    };
  }
  if (matches.length > 1) {
    return { ok: false, status: 'choose', events: matches.map(toChoice) };
  }
  return { ok: true, event: matches[0] };
}
