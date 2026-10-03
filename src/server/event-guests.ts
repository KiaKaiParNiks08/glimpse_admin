import prisma from '@/server/prisma';
import type { EnsureEventGuestParams } from '@/types';

export type { EnsureEventGuestParams } from '@/types';

export const WEDDING_EVENT_CATEGORY_SLUG = 'wedding';

export type WeddingSide = 'groom' | 'bride';

/**
 * Ensure an event_guest record exists for the given event and user.
 * If it already exists, does nothing. Otherwise creates one with optional venue_contact_id.
 */
export async function ensureEventGuest(params: EnsureEventGuestParams): Promise<void> {
  const { event_id, user_id, venue_contact_id = null } = params;

  const existing = await prisma.event_guests.findUnique({
    where: {
      event_id_user_id: { event_id, user_id },
    },
  });

  if (!existing) {
    await prisma.event_guests.create({
      data: {
        event_id,
        user_id,
        venue_contact_id,
        rsvp_status: 'pending',
      },
    });
  }
}

export async function isEventGuest(event_id: string, user_id: string): Promise<boolean> {
  const row = await prisma.event_guests.findUnique({
    where: { event_id_user_id: { event_id, user_id } },
    select: { id: true },
  });
  return row != null;
}

export type UpdateGuestWeddingSideResult =
  | { ok: true }
  | { ok: false; reason: 'not_guest' | 'not_wedding_event' };

/**
 * Set or clear wedding_side on event_guests. Only when the event's category slug is `wedding`
 * and a guest row exists for (event_id, user_id).
 */
export async function updateGuestWeddingSide(params: {
  event_id: string;
  user_id: string;
  wedding_side: WeddingSide | null;
}): Promise<UpdateGuestWeddingSideResult> {
  const { event_id, user_id, wedding_side } = params;

  const [guest, eventRow] = await Promise.all([
    prisma.event_guests.findUnique({
      where: { event_id_user_id: { event_id, user_id } },
      select: { id: true },
    }),
    prisma.events.findUnique({
      where: { id: event_id },
      select: { event_categories: { select: { slug: true } } },
    }),
  ]);

  if (!guest) return { ok: false, reason: 'not_guest' };
  if (eventRow?.event_categories.slug !== WEDDING_EVENT_CATEGORY_SLUG) {
    return { ok: false, reason: 'not_wedding_event' };
  }

  await prisma.event_guests.update({
    where: { event_id_user_id: { event_id, user_id } },
    data: { wedding_side },
  });

  return { ok: true };
}

export type EventGuestExportRow = {
  full_name: string;
  mobile: string;
  instagram_id: string;
  /** Matches GET /api/users/[user_id]: non-expired OTP row with is_verified */
  is_verified: string;
  is_active: string;
  /** Human label when event is wedding; empty string otherwise or if unset */
  wedding_side: string;
};

export type EventGuestExportBundle = {
  event_code: string;
  is_wedding: boolean;
  rows: EventGuestExportRow[];
};

/**
 * Guests with app user role only, ordered by join time. Used for super_admin CSV export.
 */
export async function listEventGuestsForExport(
  eventId: string
): Promise<EventGuestExportBundle | null> {
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      event_code: true,
      event_categories: { select: { slug: true } },
    },
  });
  if (!event) return null;

  const isWedding = event.event_categories.slug === WEDDING_EVENT_CATEGORY_SLUG;

  const guests = await prisma.event_guests.findMany({
    where: {
      event_id: eventId,
      users_event_guests_user_idTousers: { roles: { name: 'user' } },
    },
    select: {
      wedding_side: true,
      joined_at: true,
      users_event_guests_user_idTousers: {
        select: {
          id: true,
          full_name: true,
          mobile_number: true,
          country_code: true,
          instagram_id: true,
          is_active: true,
        },
      },
    },
    orderBy: [{ joined_at: 'asc' }, { id: 'asc' }],
  });

  const userIds = [...new Set(guests.map((g) => g.users_event_guests_user_idTousers.id))];
  const verifiedOtps =
    userIds.length === 0
      ? []
      : await prisma.user_otps.findMany({
          where: {
            user_id: { in: userIds },
            is_verified: true,
            expires_at: { gt: new Date() },
          },
          select: { user_id: true },
        });
  const verifiedUserIds = new Set(verifiedOtps.map((r) => r.user_id));

  const rows: EventGuestExportRow[] = guests.map((g) => {
    const u = g.users_event_guests_user_idTousers;
    const mobile = [u.country_code, u.mobile_number].filter(Boolean).join(' ').trim();
    let wedding_side = '';
    if (isWedding) {
      if (g.wedding_side === 'groom') wedding_side = 'Groom side';
      else if (g.wedding_side === 'bride') wedding_side = 'Bride side';
    }
    return {
      full_name: u.full_name,
      mobile,
      instagram_id: u.instagram_id?.trim() ?? '',
      is_verified: verifiedUserIds.has(u.id) ? 'Yes' : 'No',
      is_active: u.is_active === false ? 'No' : 'Yes',
      wedding_side,
    };
  });

  return { event_code: event.event_code, is_wedding: isWedding, rows };
}
