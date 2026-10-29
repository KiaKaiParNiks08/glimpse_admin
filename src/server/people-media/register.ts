import { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { ensurePeopleMediaSchema } from './ensure-schema';
import { scheduleFaceProcessing } from './schedule';
import { reopenCompleteScansForEvent } from './scans';
import { sha256Hex, storageKeyFromMediaUrl } from './storage';

export type MediaAssetSource = 'photographer' | 'user_post';

export type RegisterMediaInput = {
  eventId: string;
  source: MediaAssetSource;
  mediaType: 'image' | 'video';
  storageKey: string;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  thumbnailStorageKey?: string | null;
  idempotencyKey?: string | null;
  eventDayMediaId?: string | null;
  postMediaId?: string | null;
  uploadedBy?: string | null;
};

export type RegisteredMediaAsset = {
  id: string;
  processing_status: string;
  created: boolean;
};

const assetSelect = {
  id: true,
  processing_status: true,
  thumbnail_storage_key: true,
  media_type: true,
  match_complete: true,
} as const;

async function findExisting(input: RegisterMediaInput) {
  if (input.eventDayMediaId) {
    const byDay = await prisma.media_assets.findUnique({
      where: { event_day_media_id: input.eventDayMediaId },
      select: assetSelect,
    });
    if (byDay) return byDay;
  }
  if (input.postMediaId) {
    const byPost = await prisma.media_assets.findUnique({
      where: { post_media_id: input.postMediaId },
      select: assetSelect,
    });
    if (byPost) return byPost;
  }
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const byKey = await prisma.media_assets.findUnique({
      where: {
        event_id_idempotency_key: { event_id: input.eventId, idempotency_key: idempotencyKey },
      },
      select: assetSelect,
    });
    if (byKey) return byKey;
  }
  const contentSha = sha256Hex(input.storageKey);
  return prisma.media_assets.findUnique({
    where: { event_id_content_sha256: { event_id: input.eventId, content_sha256: contentSha } },
    select: assetSelect,
  });
}

export async function registerMediaAsset(input: RegisterMediaInput): Promise<RegisteredMediaAsset> {
  await ensurePeopleMediaSchema();
  const existing = await findExisting(input);
  if (existing) {
    const thumbnailStorageKey = input.thumbnailStorageKey ?? null;
    if (
      existing.media_type === 'video' &&
      thumbnailStorageKey &&
      !existing.thumbnail_storage_key
    ) {
      await prisma.media_assets.update({
        where: { id: existing.id },
        data: {
          thumbnail_url: input.thumbnailUrl ?? null,
          thumbnail_storage_key: thumbnailStorageKey,
          processing_status: 'pending',
          match_complete: false,
          guest_scan_cursor: null,
          last_error: null,
        },
      });
      await reopenCompleteScansForEvent(input.eventId);
      return { id: existing.id, processing_status: 'pending', created: false };
    }
    return { id: existing.id, processing_status: existing.processing_status, created: false };
  }

  try {
    const created = await prisma.media_assets.create({
      data: {
        event_id: input.eventId,
        source: input.source,
        media_type: input.mediaType,
        storage_key: input.storageKey,
        media_url: input.mediaUrl,
        thumbnail_url: input.thumbnailUrl ?? null,
        thumbnail_storage_key: input.thumbnailStorageKey ?? null,
        content_sha256: sha256Hex(input.storageKey),
        idempotency_key: input.idempotencyKey?.trim() || null,
        event_day_media_id: input.eventDayMediaId ?? null,
        post_media_id: input.postMediaId ?? null,
        uploaded_by: input.uploadedBy ?? null,
        processing_status: 'pending',
        match_complete: false,
      },
      select: assetSelect,
    });
    await reopenCompleteScansForEvent(input.eventId);
    return { id: created.id, processing_status: created.processing_status, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await findExisting(input);
      if (raced) return { id: raced.id, processing_status: raced.processing_status, created: false };
    }
    throw error;
  }
}

type GalleryRow = {
  id: string;
  event_day_id: string;
  media_key: string | null;
  media_url: string;
  media_type: string;
  thumbnail_url?: string | null;
  thumbnail_key?: string | null;
};

/** Register photographer gallery rows as pending assets. Failures are logged and do not fail the upload. */
export async function registerPhotographerGalleryItems(items: GalleryRow[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const days = await prisma.event_days.findMany({
      where: { id: { in: [...new Set(items.map((item) => item.event_day_id))] } },
      select: { id: true, event_id: true },
    });
    const eventByDay = new Map(days.map((day) => [day.id, day.event_id]));
    const owners = await prisma.event_day_media.findMany({
      where: { id: { in: items.map((item) => item.id) } },
      select: { id: true, uploaded_by: true },
    });
    const ownerById = new Map(owners.map((row) => [row.id, row.uploaded_by]));

    for (const item of items) {
      const eventId = eventByDay.get(item.event_day_id);
      if (!eventId) continue;
      if (item.media_type !== 'image' && item.media_type !== 'video') continue;
      const storageKey = storageKeyFromMediaUrl(item.media_url, item.media_key);
      if (!storageKey) continue;
      await registerMediaAsset({
        eventId,
        source: 'photographer',
        mediaType: item.media_type,
        storageKey,
        mediaUrl: item.media_url,
        thumbnailUrl: item.thumbnail_url ?? null,
        thumbnailStorageKey: storageKeyFromMediaUrl(item.thumbnail_url, item.thumbnail_key),
        idempotencyKey: `day-media:${item.id}`,
        eventDayMediaId: item.id,
        uploadedBy: ownerById.get(item.id) ?? null,
      });
    }
    await scheduleFaceProcessing();
  } catch (error) {
    console.error('[people-media] gallery registration failed', error);
  }
}

type FeedMediaRow = {
  id: string;
  media_type: string;
  media_url: string;
  storageKey: string | null;
  thumbnailUrl?: string | null;
  thumbnailStorageKey?: string | null;
};

/** Register media from POST /api/feed. Failures are logged and do not fail post creation. */
export async function registerFeedPostMedia(input: {
  eventId: string;
  userId: string;
  items: FeedMediaRow[];
}): Promise<void> {
  if (input.items.length === 0) return;
  try {
    for (const item of input.items) {
      if (item.media_type !== 'image' && item.media_type !== 'video') continue;
      const storageKey = item.storageKey ?? storageKeyFromMediaUrl(item.media_url);
      if (!storageKey) continue;
      await registerMediaAsset({
        eventId: input.eventId,
        source: 'user_post',
        mediaType: item.media_type,
        storageKey,
        mediaUrl: item.media_url,
        thumbnailUrl: item.thumbnailUrl ?? null,
        thumbnailStorageKey: item.thumbnailStorageKey ?? storageKeyFromMediaUrl(item.thumbnailUrl),
        idempotencyKey: `post-media:${item.id}`,
        postMediaId: item.id,
        uploadedBy: input.userId,
      });
    }
    await scheduleFaceProcessing();
  } catch (error) {
    console.error('[people-media] feed registration failed', error);
  }
}

/** Register feed and gallery images that were uploaded before people-in-media existed. */
export async function backfillEventMedia(eventId: string): Promise<number> {
  await ensurePeopleMediaSchema();
  let created = 0;

  const posts = await prisma.$queryRaw<
    {
      id: string;
      media_type: string;
      media_url: string;
      thumbnail_url: string | null;
      user_id: string;
    }[]
  >`
    SELECT pm.id, pm.media_type::text AS media_type, pm.media_url, pm.thumbnail_url, p.user_id
    FROM post_media pm
    JOIN posts p ON p.id = pm.post_id
    LEFT JOIN media_assets ma ON ma.post_media_id = pm.id
    WHERE p.event_id = ${eventId}::uuid
      AND p.status = 'active'
      AND pm.media_type IN ('image', 'video')
      AND ma.id IS NULL
  `;
  for (const item of posts) {
    const storageKey = storageKeyFromMediaUrl(item.media_url);
    if (!storageKey) {
      console.error('[people-media] backfill skipped post_media with no storage key', item.id);
      continue;
    }
    const mediaType = item.media_type === 'video' ? 'video' : 'image';
    const result = await registerMediaAsset({
      eventId,
      source: 'user_post',
      mediaType,
      storageKey,
      mediaUrl: item.media_url,
      thumbnailUrl: item.thumbnail_url,
      thumbnailStorageKey: storageKeyFromMediaUrl(item.thumbnail_url),
      idempotencyKey: `post-media:${item.id}`,
      postMediaId: item.id,
      uploadedBy: item.user_id,
    });
    if (result.created) created += 1;
  }

  const gallery = await prisma.$queryRaw<
    {
      id: string;
      media_type: string;
      media_url: string;
      media_key: string | null;
      thumbnail_url: string | null;
      thumbnail_key: string | null;
      uploaded_by: string | null;
    }[]
  >`
    SELECT edm.id, edm.media_type, edm.media_url, edm.media_key,
           edm.thumbnail_url, edm.thumbnail_key, edm.uploaded_by
    FROM event_day_media edm
    JOIN event_days ed ON ed.id = edm.event_day_id
    LEFT JOIN media_assets ma ON ma.event_day_media_id = edm.id
    WHERE ed.event_id = ${eventId}::uuid
      AND edm.media_type IN ('image', 'video')
      AND ma.id IS NULL
  `;
  for (const item of gallery) {
    const storageKey = storageKeyFromMediaUrl(item.media_url, item.media_key);
    if (!storageKey) {
      console.error('[people-media] backfill skipped gallery item with no storage key', item.id);
      continue;
    }
    const mediaType = item.media_type === 'video' ? 'video' : 'image';
    const result = await registerMediaAsset({
      eventId,
      source: 'photographer',
      mediaType,
      storageKey,
      mediaUrl: item.media_url,
      thumbnailUrl: item.thumbnail_url,
      thumbnailStorageKey: storageKeyFromMediaUrl(item.thumbnail_url, item.thumbnail_key),
      idempotencyKey: `day-media:${item.id}`,
      eventDayMediaId: item.id,
      uploadedBy: item.uploaded_by,
    });
    if (result.created) created += 1;
  }

  return created;
}

export async function backfillUserEventMedia(userId: string): Promise<number> {
  const events = await prisma.$queryRaw<{ event_id: string }[]>`
    SELECT event_id FROM event_guests WHERE user_id = ${userId}::uuid
    UNION
    SELECT event_id FROM posts WHERE user_id = ${userId}::uuid AND event_id IS NOT NULL
  `;
  let created = 0;
  for (const row of events) {
    created += await backfillEventMedia(row.event_id);
  }
  return created;
}
