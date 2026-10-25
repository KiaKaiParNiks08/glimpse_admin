import prisma from '@/server/prisma';
import { deleteObjectByKey } from '@/lib/s3-presign';
import { decryptToken } from '@/lib/upload-token';
import { registerPhotographerGalleryItems } from '@/server/people-media/register';

export type EventDayMediaCreateInput = {
  event_day_id: string;
  event_session_id: string;
  media_key: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url?: string | null;
  thumbnail_key?: string | null;
  uploaded_by?: string | null;
  display_order?: number | null;
};

export const SESSION_MEDIA_PAGE_SIZE = 15;

function tryExtractKeyFromStoredUrl(url: string): string | null {
  if (!url?.trim()) return null;
  try {
    // Stored URL can be CloudFront/public URL OR proxy URL (/api/upload/signed?...).
    // If it's a proxy URL we can recover the key for backfill / legacy rows.
    if (url.startsWith('/api/upload/signed')) {
      const u = new URL(url, 'http://local');
      const token = u.searchParams.get('t');
      const keyParam = u.searchParams.get('key');
      if (token) return decryptToken(token);
      if (keyParam) return decodeURIComponent(keyParam);
    }
  } catch {
    // ignore
  }
  return null;
}

export async function createEventDayMedia(items: EventDayMediaCreateInput[]) {
  if (items.length === 0) return [];
  // createMany doesn't return rows; we need ids for UI.
  const created = await prisma.$transaction(
    items.map((item) =>
      prisma.event_day_media.create({
        data: {
          event_day_id: item.event_day_id,
          event_session_id: item.event_session_id,
          media_key: item.media_key,
          media_url: item.media_url,
          media_type: item.media_type,
          thumbnail_url: item.thumbnail_url ?? null,
          thumbnail_key: item.thumbnail_key ?? null,
          uploaded_by: item.uploaded_by ?? null,
          display_order: item.display_order ?? 0,
        },
        select: {
          id: true,
          event_day_id: true,
          event_session_id: true,
          media_key: true,
          media_url: true,
          media_type: true,
          thumbnail_url: true,
          thumbnail_key: true,
          display_order: true,
          created_at: true,
        },
      })
    )
  );
  await registerPhotographerGalleryItems(created);
  return created;
}

const eventDayMediaSelect = {
  id: true,
  event_day_id: true,
  event_session_id: true,
  media_key: true,
  media_url: true,
  media_type: true,
  thumbnail_url: true,
  display_order: true,
  created_at: true,
} as const;

export async function listSessionMediaPage(input: {
  eventId: string;
  eventSessionId?: string;
  page: number;
}) {
  const where = {
    event_days: { event_id: input.eventId },
    event_session_id: input.eventSessionId ?? { not: null },
  };
  const [total, rows] = await Promise.all([
    prisma.event_day_media.count({ where }),
    prisma.event_day_media.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * SESSION_MEDIA_PAGE_SIZE,
      take: SESSION_MEDIA_PAGE_SIZE,
      select: {
        ...eventDayMediaSelect,
        uploaded_by: true,
      },
    }),
  ]);
  return { total, rows };
}

export async function getEventDayMediaByEventDayId(eventDayId: string) {
  return prisma.event_day_media.findMany({
    where: { event_day_id: eventDayId },
    orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
    select: eventDayMediaSelect,
  });
}

export async function getEventDayMediaBySessionId(eventSessionId: string) {
  return prisma.event_day_media.findMany({
    where: { event_session_id: eventSessionId },
    orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
    select: eventDayMediaSelect,
  });
}

/** Every gallery media item of an event (all days and sessions), in day then upload order. */
export async function getEventDayMediaByEventId(eventId: string) {
  return prisma.event_day_media.findMany({
    where: { event_days: { event_id: eventId } },
    orderBy: [{ event_days: { date: 'asc' } }, { display_order: 'asc' }, { created_at: 'asc' }],
    select: eventDayMediaSelect,
  });
}

export async function deleteEventDayMediaById(mediaId: string): Promise<boolean> {
  const row = await prisma.event_day_media.findUnique({
    where: { id: mediaId },
    select: { id: true, media_key: true, media_url: true, thumbnail_key: true },
  });
  if (!row) return false;

  const key = row.media_key ?? (row.media_url ? tryExtractKeyFromStoredUrl(row.media_url) : null);
  try {
    if (row.thumbnail_key) await deleteObjectByKey(row.thumbnail_key);
    if (key) await deleteObjectByKey(key);
  } catch (e) {
    // If S3 deletion fails, do NOT remove DB row (keeps consistency).
    throw e;
  }

  await prisma.event_day_media.delete({ where: { id: mediaId } });
  return true;
}

