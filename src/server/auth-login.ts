import { emailMatchesSuffix } from '@/lib/event-categories';
import { getEventByCode, getEventForAuthById, listEventsByEmailSuffix } from '@/server/events';
import prisma from '@/server/prisma';

export type AuthEventChoice = {
  event_id: string;
  event_code: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
};

type AuthEvent = {
  id: string;
  event_code?: string;
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
  event_code: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
}): AuthEventChoice {
  return {
    event_id: event.id,
    event_code: event.event_code,
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    cover_image: event.cover_image,
  };
}

function mergeChoices(lists: AuthEventChoice[][]): AuthEventChoice[] {
  const seen = new Set<string>();
  const out: AuthEventChoice[] = [];
  for (const list of lists) {
    for (const event of list) {
      if (seen.has(event.event_id)) continue;
      seen.add(event.event_id);
      out.push(event);
    }
  }
  return out;
}

async function isReturningGuest(input: {
  eventId: string;
  mobileNumber?: string | null;
  email?: string | null;
  roleId: number;
}): Promise<boolean> {
  const user = input.mobileNumber
    ? await prisma.users.findFirst({
        where: { mobile_number: input.mobileNumber, role_id: input.roleId },
        select: { id: true },
      })
    : input.email
      ? await prisma.users.findFirst({
          where: { email: input.email.trim().toLowerCase(), role_id: input.roleId },
          select: { id: true },
        })
      : null;
  if (!user) return false;
  const guest = await prisma.event_guests.findUnique({
    where: { event_id_user_id: { event_id: input.eventId, user_id: user.id } },
    select: { id: true },
  });
  return guest != null;
}

async function listJoinedEventsByMobile(mobileNumber: string, roleId: number): Promise<AuthEventChoice[]> {
  return prisma.$queryRaw<AuthEventChoice[]>`
    SELECT e.id AS event_id,
           e.event_code,
           e.title,
           e.start_date,
           e.end_date,
           e.cover_image
    FROM users u
    JOIN event_guests eg ON eg.user_id = u.id
    JOIN events e ON e.id = eg.event_id
    WHERE u.mobile_number = ${mobileNumber}
      AND u.role_id = ${roleId}
    ORDER BY eg.joined_at DESC NULLS LAST, e.start_date DESC
  `;
}

async function listJoinedEventsByEmail(email: string, roleId: number): Promise<AuthEventChoice[]> {
  const normalized = email.trim().toLowerCase();
  return prisma.$queryRaw<AuthEventChoice[]>`
    SELECT e.id AS event_id,
           e.event_code,
           e.title,
           e.start_date,
           e.end_date,
           e.cover_image
    FROM users u
    JOIN event_guests eg ON eg.user_id = u.id
    JOIN events e ON e.id = eg.event_id
    WHERE lower(u.email) = ${normalized}
      AND u.role_id = ${roleId}
      AND u.email NOT LIKE '%@glimps.guest'
    ORDER BY eg.joined_at DESC NULLS LAST, e.start_date DESC
  `;
}

/**
 * event_code + mobile or email → that event.
 * Mobile only or email only → previous / corporate events for the bottom sheet.
 */
export async function resolveAuthEvent(input: {
  event_code?: string;
  event_id?: string;
  email?: string;
  mobile_number?: string | null;
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
    const returning = await isReturningGuest({
      eventId: event.id,
      mobileNumber: input.mobile_number,
      email: input.email,
      roleId: input.user_role_id,
    });
    if (!suffixOk && !returning) {
      return {
        ok: false,
        status: 'forbidden',
        message: 'Event code or a matching corporate email is required',
      };
    }
    return { ok: true, event };
  }

  if (input.email) {
    const [joinedByEmail, corporate] = await Promise.all([
      listJoinedEventsByEmail(input.email, input.user_role_id),
      listEventsByEmailSuffix(input.email),
    ]);
    const events = mergeChoices([joinedByEmail, corporate.map(toChoice)]);
    if (events.length === 1) {
      const event = await getEventForAuthById(events[0].event_id);
      if (event) return { ok: true, event };
    }
    return { ok: false, status: 'choose', events };
  }

  return {
    ok: false,
    status: 'choose',
    events: input.mobile_number
      ? await listJoinedEventsByMobile(input.mobile_number, input.user_role_id)
      : [],
  };
}
