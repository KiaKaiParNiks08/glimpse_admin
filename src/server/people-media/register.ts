import { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { isEventGuest } from '@/server/event-guests';
import { scheduleFaceProcessing } from './schedule';
import { sha256Hex, storageKeyFromMediaUrl } from './storage';

export type MediaAssetSource = 'photographer' | 'user_post';

export type RegisterMediaInput = {
  eventId: string;
  source: MediaAssetSource;
  mediaType: 'image' | 'video';
  storageKey: string;
  mediaUrl: string;
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
  const existing = await findExisting(input);
  if (existing) {
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
        content_sha256: sha256Hex(input.storageKey),
        idempotency_key: input.idempotencyKey?.trim() || null,
        event_day_media_id: input.eventDayMediaId ?? null,
        post_media_id: input.postMediaId ?? null,
        uploaded_by: input.uploadedBy ?? null,
        processing_status: 'pending',
      },
      select: assetSelect,
    });
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
        idempotencyKey: `day-media:${item.id}`,
        eventDayMediaId: item.id,
        uploadedBy: ownerById.get(item.id) ?? null,
      });
    }
    scheduleFaceProcessing();
  } catch (error) {
    console.error('[people-media] gallery registration failed', error);
  }
}

type FeedMediaRow = {
  id: string;
  media_type: string;
  media_url: string;
  storageKey: string | null;
};

/** Register media from POST /api/feed. Failures are logged and do not fail post creation. */
export async function registerFeedPostMedia(input: {
  eventId: string;
  userId: string;
  items: FeedMediaRow[];
}): Promise<void> {
  if (input.items.length === 0) return;
  try {
    if (!(await isEventGuest(input.eventId, input.userId))) return;
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
        idempotencyKey: `post-media:${item.id}`,
        postMediaId: item.id,
        uploadedBy: input.userId,
      });
    }
    scheduleFaceProcessing();
  } catch (error) {
    console.error('[people-media] feed registration failed', error);
  }
}
