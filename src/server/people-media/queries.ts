import prisma from '@/server/prisma';
import { isEventAdminAssigned } from '@/server/events';
import { isEventGuest } from '@/server/event-guests';
import type { AdminSessionUser } from '@/lib/admin-session';

export async function adminCanManageEvent(admin: AdminSessionUser, eventId: string): Promise<boolean> {
  if (admin.role_name === 'super_admin') return true;
  return isEventAdminAssigned(eventId, admin.id);
}

export async function listMyMedia(input: { userId: string; eventId: string; page: number; limit: number }) {
  const guest = await isEventGuest(input.eventId, input.userId);
  if (!guest) return null;

  const offset = (input.page - 1) * input.limit;
  const [countRows, items] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT ma.id)::int AS total
      FROM media_matches mm
      JOIN media_assets ma ON ma.id = mm.media_asset_id
      WHERE mm.user_id = ${input.userId}::uuid
        AND ma.event_id = ${input.eventId}::uuid
        AND ma.processing_status = 'ready'
    `,
    prisma.$queryRaw<
      {
        media_asset_id: string;
        source: string;
        media_type: string;
        media_url: string;
        created_at: Date | null;
        event_day_media_id: string | null;
        post_id: string | null;
        caption: string | null;
        similarity: number;
      }[]
    >`
      SELECT ma.id AS media_asset_id,
             ma.source,
             ma.media_type::text AS media_type,
             ma.media_url,
             ma.created_at,
             ma.event_day_media_id,
             pm.post_id,
             p.caption,
             MAX(mm.similarity) AS similarity
      FROM media_matches mm
      JOIN media_assets ma ON ma.id = mm.media_asset_id
      LEFT JOIN post_media pm ON pm.id = ma.post_media_id
      LEFT JOIN posts p ON p.id = pm.post_id
      WHERE mm.user_id = ${input.userId}::uuid
        AND ma.event_id = ${input.eventId}::uuid
        AND ma.processing_status = 'ready'
      GROUP BY ma.id, ma.source, ma.media_type, ma.media_url, ma.created_at, ma.event_day_media_id, pm.post_id, p.caption
      ORDER BY ma.created_at DESC
      LIMIT ${input.limit} OFFSET ${offset}
    `,
  ]);

  const total = countRows[0]?.total ?? 0;
  return {
    items: items.map((item) => ({
      media_asset_id: item.media_asset_id,
      source: item.source,
      media_type: item.media_type,
      media_url: item.media_url,
      created_at: item.created_at,
      event_day_media_id: item.event_day_media_id,
      post_id: item.post_id,
      caption: item.caption,
      similarity: item.similarity,
    })),
    total,
  };
}

const statusSelect = {
  id: true,
  event_id: true,
  source: true,
  media_type: true,
  media_url: true,
  processing_status: true,
  face_count: true,
  attempt_count: true,
  last_error: true,
  processed_at: true,
  created_at: true,
  uploaded_by: true,
} as const;

export async function getMediaStatusForViewer(assetId: string, viewerUserId: string) {
  const asset = await prisma.media_assets.findUnique({ where: { id: assetId }, select: statusSelect });
  if (!asset) return null;
  if (asset.uploaded_by === viewerUserId) {
    const { uploaded_by: _uploadedBy, ...status } = asset;
    return status;
  }
  const match = await prisma.media_matches.findFirst({
    where: { media_asset_id: assetId, user_id: viewerUserId },
    select: { id: true },
  });
  if (!match) return null;
  const { uploaded_by: _uploadedBy, ...status } = asset;
  return status;
}

export async function getMediaStatusForAdmin(assetId: string, eventId: string) {
  const asset = await prisma.media_assets.findFirst({
    where: { id: assetId, event_id: eventId },
    select: statusSelect,
  });
  if (!asset) return null;
  const { uploaded_by: _uploadedBy, ...status } = asset;
  return status;
}

export async function getSecureMediaUrl(assetId: string, userId: string) {
  const asset = await prisma.media_assets.findUnique({
    where: { id: assetId },
    select: { id: true, event_id: true, media_url: true, media_type: true, uploaded_by: true, processing_status: true },
  });
  if (!asset) return null;
  const allowed =
    asset.uploaded_by === userId ||
    (await prisma.media_matches.findFirst({
      where: { media_asset_id: assetId, user_id: userId },
      select: { id: true },
    })) != null;
  if (!allowed) return null;
  if (!(await isEventGuest(asset.event_id, userId)) && asset.uploaded_by !== userId) return null;
  return {
    media_asset_id: asset.id,
    media_type: asset.media_type,
    media_url: asset.media_url,
    processing_status: asset.processing_status,
  };
}

export async function listAssetMatches(eventId: string, assetId: string) {
  return prisma.$queryRaw<
    { user_id: string; full_name: string; similarity: number; face_index: number }[]
  >`
    SELECT mm.user_id, u.full_name, mm.similarity, mf.face_index
    FROM media_matches mm
    JOIN media_assets ma ON ma.id = mm.media_asset_id
    JOIN users u ON u.id = mm.user_id
    JOIN media_faces mf ON mf.id = mm.media_face_id
    WHERE ma.event_id = ${eventId}::uuid
      AND ma.id = ${assetId}::uuid
    ORDER BY mm.similarity DESC, mf.face_index ASC
  `;
}

export async function requeueMediaAsset(eventId: string, assetId: string): Promise<boolean> {
  const result = await prisma.media_assets.updateMany({
    where: { id: assetId, event_id: eventId },
    data: {
      processing_status: 'pending',
      attempt_count: 0,
      last_error: null,
      next_retry_at: null,
    },
  });
  return result.count > 0;
}

export async function requeueFaceReference(eventId: string, userId: string): Promise<boolean> {
  const guest = await isEventGuest(eventId, userId);
  if (!guest) return false;
  const result = await prisma.user_face_references.updateMany({
    where: { user_id: userId, consent: true, revoked_at: null },
    data: { processing_status: 'pending', attempt_count: 0, last_error: null, next_retry_at: null },
  });
  return result.count > 0;
}

export async function listEventPeopleMedia(input: {
  eventId: string;
  page: number;
  limit: number;
  status?: string | null;
}) {
  const offset = (input.page - 1) * input.limit;
  const status = input.status?.trim() || null;
  const [countRows, statusRows, items, references] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM media_assets
      WHERE event_id = ${input.eventId}::uuid
        AND (${status}::text IS NULL OR processing_status = ${status})
    `,
    prisma.$queryRaw<{ processing_status: string; count: number }[]>`
      SELECT processing_status, COUNT(*)::int AS count
      FROM media_assets
      WHERE event_id = ${input.eventId}::uuid
      GROUP BY processing_status
    `,
    prisma.$queryRaw<
      {
        id: string;
        source: string;
        media_type: string;
        media_url: string;
        processing_status: string;
        face_count: number;
        match_count: number;
        attempt_count: number;
        last_error: string | null;
        created_at: Date | null;
        processed_at: Date | null;
      }[]
    >`
      SELECT ma.id,
             ma.source,
             ma.media_type::text AS media_type,
             ma.media_url,
             ma.processing_status,
             ma.face_count,
             ma.attempt_count,
             ma.last_error,
             ma.created_at,
             ma.processed_at,
             (SELECT COUNT(*)::int FROM media_matches mm WHERE mm.media_asset_id = ma.id) AS match_count
      FROM media_assets ma
      WHERE ma.event_id = ${input.eventId}::uuid
        AND (${status}::text IS NULL OR ma.processing_status = ${status})
      ORDER BY ma.created_at DESC
      LIMIT ${input.limit} OFFSET ${offset}
    `,
    prisma.$queryRaw<
      {
        user_id: string;
        full_name: string;
        consent: boolean;
        processing_status: string;
        attempt_count: number;
        last_error: string | null;
        updated_at: Date | null;
        has_embedding: boolean;
      }[]
    >`
      SELECT ufr.user_id,
             u.full_name,
             ufr.consent,
             ufr.processing_status,
             ufr.attempt_count,
             ufr.last_error,
             ufr.updated_at,
             (ufr.embedding IS NOT NULL) AS has_embedding
      FROM user_face_references ufr
      JOIN users u ON u.id = ufr.user_id
      JOIN event_guests eg ON eg.user_id = ufr.user_id AND eg.event_id = ${input.eventId}::uuid
      ORDER BY ufr.updated_at DESC
      LIMIT 100
    `,
  ]);

  const counts = { pending: 0, processing: 0, ready: 0, failed: 0 };
  for (const row of statusRows) {
    if (row.processing_status in counts) {
      counts[row.processing_status as keyof typeof counts] = row.count;
    }
  }

  return {
    items,
    total: countRows[0]?.total ?? 0,
    counts,
    face_references: references,
  };
}
