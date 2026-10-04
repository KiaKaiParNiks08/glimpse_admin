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
  uploaded_by?: string | null;
  display_order?: number | null;
};

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
  display_order: true,
  created_at: true,
} as const;

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
    select: { id: true, media_key: true, media_url: true },
  });
  if (!row) return false;

  const key = row.media_key ?? (row.media_url ? tryExtractKeyFromStoredUrl(row.media_url) : null);
  if (key) {
    try {
      await deleteObjectByKey(key);
    } catch (e) {
      // If S3 deletion fails, do NOT remove DB row (keeps consistency).
      throw e;
    }
  }

  await prisma.event_day_media.delete({ where: { id: mediaId } });
  return true;
}

