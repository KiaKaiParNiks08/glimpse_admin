import prisma from '@/server/prisma';
import { isEventAdminAssigned } from '@/server/events';
import { isEventGuest } from '@/server/event-guests';
import { getFavoritedItemIds } from '@/server/favorites';
import { postSelect, type PostWithMedia } from '@/server/posts';
import type { AdminSessionUser } from '@/lib/admin-session';

export async function adminCanManageEvent(admin: AdminSessionUser, eventId: string): Promise<boolean> {
  if (admin.role_name === 'super_admin') return true;
  return isEventAdminAssigned(eventId, admin.id);
}

type MyMediaRow = {
  media_asset_id: string;
  source: string;
  media_type: string;
  media_url: string;
  thumbnail_url: string | null;
  created_at: Date | null;
  event_day_media_id: string | null;
  event_session_id: string | null;
  event_day_id: string | null;
  post_id: string | null;
  caption: string | null;
  similarity: number;
};

type FeedPost = PostWithMedia & { liked_by_viewer: boolean; is_favorite: boolean };

async function loadFeedPosts(
  postIds: string[],
  viewerUserId: string,
  eventId: string
): Promise<Map<string, FeedPost>> {
  if (postIds.length === 0) return new Map();
  const rows = await prisma.posts.findMany({
    where: { id: { in: postIds }, status: 'active' },
    select: {
      ...postSelect,
      post_likes: { where: { user_id: viewerUserId }, select: { id: true } },
    },
  });
  const favorited = await getFavoritedItemIds(
    viewerUserId,
    'post',
    rows.map((row) => row.id),
    eventId
  );
  const posts = new Map<string, FeedPost>();
  for (const row of rows) {
    const { post_likes, ...post } = row;
    const feedPost = post as PostWithMedia;
    posts.set(row.id, {
      ...feedPost,
      post_media: [...feedPost.post_media].sort((a, b) => (a.media_order ?? 0) - (b.media_order ?? 0)),
      liked_by_viewer: post_likes.length > 0,
      is_favorite: favorited.has(row.id),
    });
  }
  return posts;
}

function mergeMyMedia(rows: MyMediaRow[]): MyMediaRow[] {
  const byUrl = new Map<string, MyMediaRow>();
  for (const row of rows) {
    const key = row.media_url || row.media_asset_id;
    const existing = byUrl.get(key);
    if (!existing || (row.similarity ?? 0) > (existing.similarity ?? 0)) {
      byUrl.set(key, row);
    }
  }
  return [...byUrl.values()].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

export async function listMyMedia(input: { userId: string; eventId: string; page: number; limit: number }) {
  const offset = (input.page - 1) * input.limit;
  const rows: MyMediaRow[] = [];

  try {
    const matched = await prisma.$queryRaw<MyMediaRow[]>`
      SELECT ma.id AS media_asset_id,
             CASE WHEN pm.post_id IS NOT NULL THEN 'user_post' ELSE 'session_media' END AS source,
             ma.media_type::text AS media_type,
             ma.media_url,
             COALESCE(edm.thumbnail_url, pm.thumbnail_url) AS thumbnail_url,
             ma.created_at,
             ma.event_day_media_id,
             edm.event_session_id,
             edm.event_day_id,
             pm.post_id,
             p.caption,
             MAX(mm.similarity) AS similarity
      FROM media_matches mm
      JOIN media_assets ma ON ma.id = mm.media_asset_id
      LEFT JOIN event_day_media edm ON edm.id = ma.event_day_media_id
      LEFT JOIN post_media pm ON pm.id = ma.post_media_id
      LEFT JOIN posts p ON p.id = pm.post_id AND p.status = 'active'
      WHERE mm.user_id = ${input.userId}::uuid
        AND ma.event_id = ${input.eventId}::uuid
        AND (
          (pm.post_id IS NOT NULL AND p.id IS NOT NULL)
          OR (pm.post_id IS NULL AND edm.id IS NOT NULL)
        )
      GROUP BY ma.id, ma.media_type, ma.media_url, edm.thumbnail_url, pm.thumbnail_url, ma.created_at,
               ma.event_day_media_id, edm.event_session_id, edm.event_day_id, pm.post_id, p.caption
    `;
    rows.push(...matched);
  } catch (error) {
    console.error('[people-media] listMyMedia match query failed', error);
  }

  try {
    const ownPosts = await prisma.$queryRaw<MyMediaRow[]>`
      SELECT pm.id AS media_asset_id,
             'user_post' AS source,
             pm.media_type::text AS media_type,
             pm.media_url,
             pm.thumbnail_url,
             pm.created_at,
             NULL::uuid AS event_day_media_id,
             NULL::uuid AS event_session_id,
             NULL::uuid AS event_day_id,
             p.id AS post_id,
             p.caption,
             1::float AS similarity
      FROM post_media pm
      JOIN posts p ON p.id = pm.post_id
      WHERE p.event_id = ${input.eventId}::uuid
        AND p.user_id = ${input.userId}::uuid
        AND p.status = 'active'
        AND pm.media_type IN ('image', 'video')
    `;
    rows.push(...ownPosts);
  } catch (error) {
    console.error('[people-media] listMyMedia own-post query failed', error);
  }

  const items = mergeMyMedia(rows);
  const total = items.length;
  const pageItems = items.slice(offset, offset + input.limit);
  const posts = await loadFeedPosts(
    [...new Set(pageItems.map((row) => row.post_id).filter((id): id is string => !!id))],
    input.userId,
    input.eventId
  );

  const data: Array<
    | {
        media_asset_id: string;
        source: 'user_post';
        media_type: string;
        media_url: string;
        thumbnail_url: string | null;
        created_at: Date | null;
        post_id: string;
        post: FeedPost;
        caption: string | null;
        similarity: number;
      }
    | {
        media_asset_id: string;
        source: 'session_media';
        id: string;
        event_day_media_id: string;
        event_session_id: string | null;
        event_day_id: string | null;
        media_type: string;
        media_url: string;
        thumbnail_url: string | null;
        created_at: Date | null;
        similarity: number;
      }
  > = [];
  for (const row of pageItems) {
    if (row.post_id) {
      const post = posts.get(row.post_id);
      if (!post) continue;
      data.push({
        media_asset_id: row.media_asset_id,
        source: 'user_post',
        media_type: row.media_type,
        media_url: row.media_url,
        thumbnail_url: row.thumbnail_url,
        created_at: row.created_at,
        post_id: row.post_id,
        post,
        caption: post.caption,
        similarity: row.similarity,
      });
      continue;
    }
    if (!row.event_day_media_id) continue;
    data.push({
      media_asset_id: row.media_asset_id,
      source: 'session_media',
      id: row.event_day_media_id,
      event_day_media_id: row.event_day_media_id,
      event_session_id: row.event_session_id,
      event_day_id: row.event_day_id,
      media_type: row.media_type,
      media_url: row.media_url,
      thumbnail_url: row.thumbnail_url,
      created_at: row.created_at,
      similarity: row.similarity,
    });
  }

  return { items: data, total };
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
