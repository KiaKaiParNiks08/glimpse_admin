import prisma from '@/server/prisma';
import type { EventDetailsDay } from '@/types';
import type { ListEventDaysQuery } from '@/lib/validations/events';

export type { EventDetailsDay } from '@/types';

/** Optional date filter for event days */
export type EventDaysDateFilter = Pick<
  ListEventDaysQuery,
  'date' | 'start_date' | 'end_date'
>;

/**
 * Get event days for the given event_id, ordered by date.
 * Optionally filter by date (exact), or by start_date/end_date range.
 * Includes event_day_media and event_sessions (with venues).
 */
function toDate(s: string | undefined): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? undefined : d;
}

export async function getEventDaysByEventId(
  event_id: string,
  dateFilter?: EventDaysDateFilter
): Promise<EventDetailsDay[]> {
  const where: { event_id: string; date?: Date | { gte?: Date; lte?: Date } } = {
    event_id,
  };

  if (dateFilter?.date) {
    const d = toDate(dateFilter.date);
    if (d) where.date = d;
  } else if (dateFilter?.start_date || dateFilter?.end_date) {
    const gte = toDate(dateFilter.start_date);
    const lte = toDate(dateFilter.end_date);
    if (gte || lte) {
      where.date = {};
      if (gte) where.date.gte = gte;
      if (lte) where.date.lte = lte;
    }
  }

  const daySelectBase = {
    id: true,
    event_id: true,
    title: true,
    date: true,
    event_day_media: {
      orderBy: { display_order: 'asc' as const },
      select: {
        id: true,
        event_session_id: true,
        media_key: true,
        media_url: true,
        media_type: true,
        display_order: true,
      },
    },
  } as const;

  const eventSessionsSelectWithSubvenue = {
    id: true,
    event_day_id: true,
    title: true,
    description: true,
    event_organizer_id: true,
    session_theme: true,
    start_time: true,
    end_time: true,
    venue_id: true,
    venue_subvenue_id: true,
    status: true,
    event_session_bg_url: true,
    event_organizers: {
      select: { id: true, name: true },
    },
    event_session_offerings: {
      select: { offering_master_id: true },
    },
    venues: {
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        city: true,
        state_name: true,
        country: true,
      },
    },
    venue_subvenues: {
      select: { id: true, title: true },
    },
  } as const;

  const eventSessionsSelectLegacy = {
    id: true,
    event_day_id: true,
    title: true,
    description: true,
    event_organizer_id: true,
    session_theme: true,
    start_time: true,
    end_time: true,
    venue_id: true,
    status: true,
    event_session_bg_url: true,
    event_organizers: {
      select: { id: true, name: true },
    },
    event_session_offerings: {
      select: { offering_master_id: true },
    },
    venues: {
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        city: true,
        state_name: true,
        country: true,
      },
    },
  } as const;

  try {
    const days = await prisma.event_days.findMany({
      where,
      orderBy: { date: 'asc' },
      select: {
        ...daySelectBase,
        event_sessions: { select: eventSessionsSelectWithSubvenue },
      },
    });
    return days as EventDetailsDay[];
  } catch (e) {
    console.warn(
      '[getEventDaysByEventId] Full select failed (schema may lack venue_subvenue_id); retrying without sub-venue fields.',
      e
    );
    const days = await prisma.event_days.findMany({
      where,
      orderBy: { date: 'asc' },
      select: {
        ...daySelectBase,
        event_sessions: { select: eventSessionsSelectLegacy },
      },
    });
    const normalized = days.map((day) => ({
      ...day,
      event_sessions: day.event_sessions.map((s) => ({
        ...s,
        venue_subvenue_id: null as string | null,
        venue_subvenues: null as EventDetailsDay['event_sessions'][number]['venue_subvenues'],
        event_organizer_id: (s as { event_organizer_id?: string | null }).event_organizer_id ?? null,
        session_theme: (s as { session_theme?: string | null }).session_theme ?? null,
        event_organizers:
          (s as { event_organizers?: { id: string; name: string } | null }).event_organizers ?? null,
        event_session_offerings:
          (s as { event_session_offerings?: { offering_master_id: string }[] }).event_session_offerings ??
          [],
      })),
    }));
    return normalized as EventDetailsDay[];
  }
}
