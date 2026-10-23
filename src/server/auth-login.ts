import { emailMatchesSuffix, isWeddingCategory } from '@/lib/event-categories';
import { getEventByCode, getEventForAuthById, listEventsByEmailSuffix } from '@/server/events';
import prisma from '@/server/prisma';

export type AuthCategoryFields = {
  event_category_id: string | null;
  event_category: string | null;
  event_type: string | null;
  show_wedding_side: boolean;
};

export type AuthEventChoice = {
  event_id: string;
  event_code: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
} & AuthCategoryFields;

type AuthEventListRow = AuthEventChoice & {
  main_venue_id: string | null;
};

type AuthEvent = {
  id: string;
  event_code?: string;
  main_venue_id: string | null;
  email_suffix?: string | null;
  event_categories?: { id: string; name: string; slug: string } | null;
};

export const EVENT_CODE_REQUIRED_MESSAGE = 'Enter an event code to continue';

export type ResolveAuthEventResult =
  | { ok: true; event: AuthEvent }
  | { ok: false; status: 'not_found'; message: string }
  | { ok: false; status: 'forbidden'; message: string }
  | { ok: false; status: 'needs_code'; message: string }
  | { ok: false; status: 'choose'; events: AuthEventChoice[] };

export function toAuthCategoryFields(
  category?: { id: string; name: string; slug: string } | null
): AuthCategoryFields {
  if (!category) {
    return {
      event_category_id: null,
      event_category: null,
      event_type: null,
      show_wedding_side: false,
    };
  }
  return {
    event_category_id: category.id,
    event_category: category.name,
    event_type: category.slug,
    show_wedding_side: isWeddingCategory(category),
  };
}

export function toPublicEventChoice(event: AuthEventChoice): AuthEventChoice {
  return {
    event_id: event.event_id,
    event_code: event.event_code,
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    cover_image: event.cover_image,
    event_category_id: event.event_category_id,
    event_category: event.event_category,
    event_type: event.event_type,
    show_wedding_side: event.show_wedding_side,
  };
}

function toChoice(event: {
  id: string;
  event_code: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
  main_venue_id: string | null;
  event_categories?: { id: string; name: string; slug: string } | null;
}): AuthEventListRow {
  return {
    event_id: event.id,
    event_code: event.event_code,
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    cover_image: event.cover_image,
    main_venue_id: event.main_venue_id,
    ...toAuthCategoryFields(event.event_categories),
  };
}

function mergeChoices(lists: AuthEventListRow[][]): AuthEventListRow[] {
  const seen = new Set<string>();
  const out: AuthEventListRow[] = [];
  for (const list of lists) {
    for (const event of list) {
      if (seen.has(event.event_id)) continue;
      seen.add(event.event_id);
      out.push(event);
    }
  }
  return out;
}

function toResolvedEvent(event: AuthEventListRow): AuthEvent {
  return {
    id: event.event_id,
    event_code: event.event_code,
    main_venue_id: event.main_venue_id,
    event_categories:
      event.event_category_id && event.event_category && event.event_type
        ? { id: event.event_category_id, name: event.event_category, slug: event.event_type }
        : null,
  };
}

async function isReturningGuest(input: {
  eventId: string;
  mobileNumber?: string | null;
  email?: string | null;
  roleId: number;
}): Promise<boolean> {
  const mobile = input.mobileNumber?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  if (!mobile && !email) return false;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT eg.id
    FROM users u
    JOIN event_guests eg ON eg.user_id = u.id AND eg.event_id = ${input.eventId}::uuid
    WHERE u.role_id = ${input.roleId}
      AND (
        (${mobile}::text IS NOT NULL AND u.mobile_number = ${mobile})
        OR (${email}::text IS NOT NULL AND lower(u.email) = ${email})
      )
    LIMIT 1
  `;
  return rows.length > 0;
}

async function listJoinedEventsByMobile(mobileNumber: string, roleId: number): Promise<AuthEventListRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      event_id: string;
      event_code: string;
      title: string;
      start_date: Date;
      end_date: Date;
      cover_image: string | null;
      main_venue_id: string | null;
      event_category_id: string | null;
      event_category: string | null;
      event_type: string | null;
    }>
  >`
    SELECT e.id AS event_id,
           e.event_code,
           e.title,
           e.start_date,
           e.end_date,
           e.cover_image,
           e.main_venue_id,
           ec.id AS event_category_id,
           ec.name AS event_category,
           ec.slug AS event_type
    FROM users u
    JOIN event_guests eg ON eg.user_id = u.id
    JOIN events e ON e.id = eg.event_id
    JOIN event_categories ec ON ec.id = e.category_id
    WHERE u.mobile_number = ${mobileNumber}
      AND u.role_id = ${roleId}
    ORDER BY eg.joined_at DESC NULLS LAST, e.start_date DESC
  `;
  return rows.map((row) => ({
    ...row,
    show_wedding_side: isWeddingCategory(
      row.event_type && row.event_category ? { slug: row.event_type, name: row.event_category } : null
    ),
  }));
}

async function listJoinedEventsByEmail(email: string, roleId: number): Promise<AuthEventListRow[]> {
  const normalized = email.trim().toLowerCase();
  const rows = await prisma.$queryRaw<
    Array<{
      event_id: string;
      event_code: string;
      title: string;
      start_date: Date;
      end_date: Date;
      cover_image: string | null;
      main_venue_id: string | null;
      event_category_id: string | null;
      event_category: string | null;
      event_type: string | null;
    }>
  >`
    SELECT e.id AS event_id,
           e.event_code,
           e.title,
           e.start_date,
           e.end_date,
           e.cover_image,
           e.main_venue_id,
           ec.id AS event_category_id,
           ec.name AS event_category,
           ec.slug AS event_type
    FROM users u
    JOIN event_guests eg ON eg.user_id = u.id
    JOIN events e ON e.id = eg.event_id
    JOIN event_categories ec ON ec.id = e.category_id
    WHERE lower(u.email) = ${normalized}
      AND u.role_id = ${roleId}
      AND u.email NOT LIKE '%@glimps.guest'
    ORDER BY eg.joined_at DESC NULLS LAST, e.start_date DESC
  `;
  return rows.map((row) => ({
    ...row,
    show_wedding_side: isWeddingCategory(
      row.event_type && row.event_category ? { slug: row.event_type, name: row.event_category } : null
    ),
  }));
}

function chooseOrLogin(events: AuthEventListRow[], hasJoinedBefore: boolean): ResolveAuthEventResult {
  if (!hasJoinedBefore) {
    return { ok: false, status: 'needs_code', message: EVENT_CODE_REQUIRED_MESSAGE };
  }
  if (events.length > 1) {
    return { ok: false, status: 'choose', events: events.map(toPublicEventChoice) };
  }
  if (events.length === 1) return { ok: true, event: toResolvedEvent(events[0]) };
  return { ok: false, status: 'needs_code', message: EVENT_CODE_REQUIRED_MESSAGE };
}

/**
 * event_code + mobile or email → that event.
 * A first mobile or email needs an event code.
 * A returning mobile or email can omit the code. Several matches return a list and no OTP.
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
    const returning = suffixOk
      ? true
      : await isReturningGuest({
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
    return chooseOrLogin(mergeChoices([joinedByEmail, corporate.map(toChoice)]), joinedByEmail.length > 0);
  }

  const joinedByMobile = input.mobile_number
    ? await listJoinedEventsByMobile(input.mobile_number, input.user_role_id)
    : [];
  return chooseOrLogin(joinedByMobile, joinedByMobile.length > 0);
}
