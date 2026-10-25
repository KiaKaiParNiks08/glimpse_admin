import { extractJoinEventCode } from '@/lib/app-share';
import { createUserJwtToken } from '@/lib/jwt';
import { toAuthCategoryFields } from '@/server/auth-login';
import { ensureEventGuest, isEventGuest } from '@/server/event-guests';
import prisma from '@/server/prisma';
import { upsertUserDevice } from '@/server/user-devices';
import { getVenueContactForEvent } from '@/server/venues';

const joinEventSelect = {
  id: true,
  event_code: true,
  status: true,
  main_venue_id: true,
  event_categories: { select: { id: true, name: true, slug: true } },
  app_themes: {
    select: {
      primary_color: true,
      secondary_color: true,
      button_primary_color: true,
      button_secondary_color: true,
    },
  },
} as const;

type JoinEventRow = {
  id: string;
  event_code: string;
  status: string;
  main_venue_id: string | null;
  event_categories: { id: string; name: string; slug: string } | null;
  app_themes: {
    primary_color: string;
    secondary_color: string;
    button_primary_color: string;
    button_secondary_color: string;
  } | null;
};

export type JoinEventResult =
  | {
      ok: true;
      data: {
        user_id: string;
        event_id: string;
        token: string;
        expires_at: string;
        event_type: string | null;
        show_wedding_side: boolean;
        primary_color: string | null;
        secondary_color: string | null;
        button_primary_color: string | null;
        button_secondary_color: string | null;
      };
    }
  | { ok: false; status: 400 | 404 | 409; message: string };

function closedStatus(status: string): boolean {
  return status === 'cancelled' || status === 'archived';
}

function hiddenStatus(status: string): boolean {
  return status === 'draft';
}

async function findEventByCode(code: string): Promise<JoinEventRow | null> {
  return prisma.events.findFirst({
    where: { event_code: { equals: code, mode: 'insensitive' } },
    select: joinEventSelect,
  });
}

async function findEventById(eventId: string): Promise<JoinEventRow | null> {
  return prisma.events.findUnique({
    where: { id: eventId },
    select: joinEventSelect,
  });
}

export async function resolveJoinEvent(input: {
  event_code?: string;
  event_id?: string;
}): Promise<{ ok: true; event: JoinEventRow } | { ok: false; status: 400 | 404 | 409; message: string }> {
  const extracted = input.event_code ? extractJoinEventCode(input.event_code) : {};
  const eventCode = extracted.event_code;
  const eventId = input.event_id ?? extracted.event_id;

  if (!eventCode && !eventId) {
    return { ok: false, status: 400, message: 'Send an event code or event id' };
  }

  let event: JoinEventRow | null = null;
  if (eventId) {
    event = await findEventById(eventId);
    if (event && eventCode && event.event_code.toLowerCase() !== eventCode.toLowerCase()) {
      return { ok: false, status: 404, message: 'Event not found' };
    }
  } else if (eventCode) {
    event = await findEventByCode(eventCode);
  }

  if (!event || hiddenStatus(event.status)) {
    return { ok: false, status: 404, message: 'Event not found' };
  }
  if (closedStatus(event.status)) {
    return { ok: false, status: 409, message: 'This event is closed' };
  }
  return { ok: true, event };
}

export async function joinAuthenticatedUserToEvent(input: {
  userId: string;
  event_code?: string;
  event_id?: string;
  device_type?: 'android' | 'ios' | 'web';
  device_id?: string;
}): Promise<JoinEventResult> {
  const resolved = await resolveJoinEvent({
    event_code: input.event_code,
    event_id: input.event_id,
  });
  if (!resolved.ok) return resolved;

  const event = resolved.event;
  const alreadyMember = await isEventGuest(event.id, input.userId);
  if (!alreadyMember) {
    const venue_contact_id = await getVenueContactForEvent(event.main_venue_id);
    await ensureEventGuest({
      event_id: event.id,
      user_id: input.userId,
      venue_contact_id,
    });
  }

  if (input.device_id && input.device_type) {
    await upsertUserDevice({
      user_id: input.userId,
      device_type: input.device_type,
      device_id: input.device_id,
    });
  }

  const issued = createUserJwtToken({ user_id: input.userId, event_id: event.id });
  const category = toAuthCategoryFields(event.event_categories);
  const theme = event.app_themes;
  return {
    ok: true,
    data: {
      user_id: input.userId,
      event_id: event.id,
      token: issued.token,
      expires_at: issued.expires_at,
      event_type: category.event_type,
      show_wedding_side: category.show_wedding_side,
      primary_color: theme?.primary_color ?? null,
      secondary_color: theme?.secondary_color ?? null,
      button_primary_color: theme?.button_primary_color ?? null,
      button_secondary_color: theme?.button_secondary_color ?? null,
    },
  };
}
