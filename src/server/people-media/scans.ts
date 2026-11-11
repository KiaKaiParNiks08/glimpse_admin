import { Prisma } from '@prisma/client';
import { notifySessionFaceRecognized, notifySpotlightPost } from '@/server/notifications/service';
import prisma from '@/server/prisma';
import { FACE_EMBEDDING_DIM, faceComparePageSize, faceMaxAttempts } from './config';
import { ensurePeopleMediaSchema } from './ensure-schema';
import { clearFaceEmbedding, deleteMatchesForUser, toVectorLiteral } from './match';
import {
  compareReferenceToAsset,
  detectFacesOutcomeToError,
  detectRekognitionFaces,
  ensureMediaFace,
  rekognitionClient,
  upsertRekognitionMatch,
  evidenceForCompare,
} from './rekognition';
import { readStoredMedia } from './storage';

type AssetRow = {
  id: string;
  storage_key: string;
  media_type: string;
  thumbnail_storage_key: string | null;
  created_at: Date | null;
  face_count: number | null;
  match_complete: boolean | null;
  event_day_media_id?: string | null;
  post_media_id?: string | null;
};

/** Queue scans for a user's events without wiping a completed scan for the same reference. */
export async function ensureUserEventScans(userId: string, referenceSha256: string): Promise<number> {
  const result = await prisma.$executeRaw`
    INSERT INTO user_event_face_scans (
      user_id, event_id, reference_sha256, status, last_asset_id, last_asset_created_at,
      attempt_count, last_error, scanned_count, matched_count, next_retry_at, updated_at
    )
    SELECT ${userId}::uuid,
           e.event_id,
           ${referenceSha256},
           'pending',
           NULL,
           NULL,
           0,
           NULL,
           0,
           0,
           NULL,
           now()
    FROM (
      SELECT event_id FROM event_guests WHERE user_id = ${userId}::uuid
      UNION
      SELECT event_id FROM posts WHERE user_id = ${userId}::uuid AND event_id IS NOT NULL
    ) e
    ON CONFLICT (user_id, event_id) DO UPDATE SET
      status = CASE
        WHEN user_event_face_scans.reference_sha256 IS DISTINCT FROM EXCLUDED.reference_sha256 THEN 'pending'
        WHEN user_event_face_scans.status IN ('failed', 'processing') THEN 'pending'
        ELSE user_event_face_scans.status
      END,
      last_asset_id = CASE
        WHEN user_event_face_scans.reference_sha256 IS DISTINCT FROM EXCLUDED.reference_sha256 THEN NULL
        ELSE user_event_face_scans.last_asset_id
      END,
      last_asset_created_at = CASE
        WHEN user_event_face_scans.reference_sha256 IS DISTINCT FROM EXCLUDED.reference_sha256 THEN NULL
        ELSE user_event_face_scans.last_asset_created_at
      END,
      attempt_count = CASE
        WHEN user_event_face_scans.status = 'failed' THEN 0
        ELSE user_event_face_scans.attempt_count
      END,
      last_error = CASE
        WHEN user_event_face_scans.status = 'failed' THEN NULL
        ELSE user_event_face_scans.last_error
      END,
      reference_sha256 = EXCLUDED.reference_sha256,
      next_retry_at = NULL,
      updated_at = now()
  `;
  return Number(result);
}

/** New event photos should be compared even if a user's scan already finished or failed. */
export async function reopenCompleteScansForEvent(eventId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE user_event_face_scans
    SET status = 'pending',
        last_error = NULL,
        next_retry_at = NULL,
        updated_at = now()
    WHERE event_id = ${eventId}::uuid
      AND status IN ('complete', 'failed')
  `;
}

export async function resetUserEventScans(userId: string, referenceSha256: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM media_asset_user_checks WHERE user_id = ${userId}::uuid`.catch(() => {});
  await prisma.$executeRaw`
    INSERT INTO user_event_face_scans (
      user_id, event_id, reference_sha256, status, last_asset_id, last_asset_created_at,
      attempt_count, last_error, scanned_count, matched_count, next_retry_at, updated_at
    )
    SELECT ${userId}::uuid,
           e.event_id,
           ${referenceSha256},
           'pending',
           NULL,
           NULL,
           0,
           NULL,
           0,
           0,
           NULL,
           now()
    FROM (
      SELECT event_id FROM event_guests WHERE user_id = ${userId}::uuid
      UNION
      SELECT event_id FROM posts WHERE user_id = ${userId}::uuid AND event_id IS NOT NULL
    ) e
    ON CONFLICT (user_id, event_id) DO UPDATE SET
      reference_sha256 = EXCLUDED.reference_sha256,
      status = 'pending',
      last_asset_id = NULL,
      last_asset_created_at = NULL,
      attempt_count = 0,
      last_error = NULL,
      scanned_count = 0,
      matched_count = 0,
      next_retry_at = NULL,
      updated_at = now()
  `;
}

async function markAssetCheckedForUser(
  mediaAssetId: string,
  userId: string,
  referenceSha256: string | null
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO media_asset_user_checks (media_asset_id, user_id, reference_sha256, checked_at)
    VALUES (${mediaAssetId}::uuid, ${userId}::uuid, ${referenceSha256}, now())
    ON CONFLICT (media_asset_id, user_id)
    DO UPDATE SET reference_sha256 = EXCLUDED.reference_sha256, checked_at = now()
  `;
}

async function loadCompareBytes(asset: AssetRow): Promise<{ bytes: Buffer; mediaType: 'image' | 'video' } | null> {
  if (asset.media_type === 'video') {
    if (!asset.thumbnail_storage_key) return null;
    const stored = await readStoredMedia(asset.thumbnail_storage_key);
    return { bytes: stored.bytes, mediaType: 'video' };
  }
  const stored = await readStoredMedia(asset.storage_key);
  return { bytes: stored.bytes, mediaType: 'image' };
}

export async function claimUserEventScans(
  batch: number,
  maxAttempts: number
): Promise<{ user_id: string; event_id: string }[]> {
  return prisma.$queryRaw<{ user_id: string; event_id: string }[]>`
    UPDATE user_event_face_scans
    SET status = 'processing',
        attempt_count = CASE WHEN status = 'failed' THEN attempt_count + 1 ELSE attempt_count END,
        last_error = NULL,
        updated_at = now()
    WHERE (user_id, event_id) IN (
      SELECT user_id, event_id FROM user_event_face_scans
      WHERE status = 'pending'
         OR (
           status = 'failed'
           AND attempt_count < ${maxAttempts}::int
           AND (next_retry_at IS NULL OR next_retry_at <= now())
         )
         OR (
           status = 'processing'
           AND updated_at < now() - interval '15 minutes'
         )
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC, updated_at DESC
      LIMIT ${batch}::int
      FOR UPDATE SKIP LOCKED
    )
    RETURNING user_id, event_id
  `;
}

async function dispatchScanMatchNotifications(
  eventId: string,
  userId: string,
  matchedAssets: AssetRow[]
): Promise<void> {
  if (matchedAssets.length === 0) return;
  try {
    const dayMediaIds = matchedAssets
      .map((a) => a.event_day_media_id)
      .filter((id): id is string => Boolean(id));

    if (dayMediaIds.length > 0) {
      const dayMediaRows = await prisma.event_day_media.findMany({
        where: { id: { in: dayMediaIds } },
        select: { event_session_id: true },
      });

      const countBySession = new Map<string, number>();
      for (const row of dayMediaRows) {
        if (!row.event_session_id) continue;
        countBySession.set(row.event_session_id, (countBySession.get(row.event_session_id) ?? 0) + 1);
      }

      for (const [sessionId, count] of countBySession) {
        await notifySessionFaceRecognized({
          eventId,
          eventSessionId: sessionId,
          userId,
          recognizedCount: count,
        });
      }
    }

    const postMediaIds = matchedAssets
      .map((a) => a.post_media_id)
      .filter((id): id is string => Boolean(id));

    if (postMediaIds.length > 0) {
      const postMediaRows = await prisma.post_media.findMany({
        where: { id: { in: postMediaIds } },
        select: {
          post_id: true,
          posts: {
            select: {
              id: true,
              user_id: true,
              event_id: true,
            },
          },
        },
      });

      const notifiedPosts = new Set<string>();
      for (const pm of postMediaRows) {
        if (!pm.posts || pm.posts.user_id === userId) continue;
        if (notifiedPosts.has(pm.posts.id)) continue;
        notifiedPosts.add(pm.posts.id);

        await notifySpotlightPost({
          postId: pm.posts.id,
          eventId: pm.posts.event_id || eventId,
          authorUserId: pm.posts.user_id,
          recognizedUserId: userId,
        });
      }
    }
  } catch (err) {
    console.error('[notifications] dispatchScanMatchNotifications failed:', err);
  }
}

export async function processUserEventScan(
  userId: string,
  eventId: string,
  deadline: number
): Promise<{ scanned: number; matched: number; complete: boolean }> {
  const scan = await prisma.user_event_face_scans.findUnique({
    where: { user_id_event_id: { user_id: userId, event_id: eventId } },
  });
  if (!scan) return { scanned: 0, matched: 0, complete: true };

  const refs = await prisma.$queryRaw<{ storage_key: string; content_sha256: string | null }[]>`
    SELECT storage_key, content_sha256
    FROM user_face_references
    WHERE user_id = ${userId}::uuid
      AND consent = true
      AND revoked_at IS NULL
      AND storage_key IS NOT NULL
    LIMIT 1
  `;
  const ref = refs[0];
  if (!ref?.storage_key) {
    await prisma.user_event_face_scans.update({
      where: { user_id_event_id: { user_id: userId, event_id: eventId } },
      data: { status: 'failed', last_error: 'No face reference', updated_at: new Date() },
    });
    return { scanned: 0, matched: 0, complete: true };
  }
  if (!rekognitionClient()) {
    await prisma.user_event_face_scans.update({
      where: { user_id_event_id: { user_id: userId, event_id: eventId } },
      data: {
        status: 'failed',
        last_error: 'Rekognition is not configured',
        next_retry_at: new Date(Date.now() + 60_000),
        updated_at: new Date(),
      },
    });
    return { scanned: 0, matched: 0, complete: false };
  }

  const referenceBytes = (await readStoredMedia(ref.storage_key)).bytes;
  const pageSize = faceComparePageSize();
  let lastCreated = scan.last_asset_created_at;
  let lastId = scan.last_asset_id;
  let scanned = 0;
  let matched = 0;
  const newlyMatchedAssets: AssetRow[] = [];

  while (Date.now() < deadline) {
    // Query newest unchecked assets first so freshly uploaded posts & media match immediately
    // and no out-of-order/backfilled row can ever be permanently skipped by a timestamp cursor.
    const assets = await prisma.$queryRaw<AssetRow[]>`
      SELECT ma.id,
             ma.storage_key,
             ma.media_type::text AS media_type,
             ma.thumbnail_storage_key,
             ma.created_at,
             ma.face_count,
             ma.match_complete,
             ma.event_day_media_id,
             ma.post_media_id
      FROM media_assets ma
      WHERE ma.event_id = ${eventId}::uuid
        AND (ma.media_type::text <> 'video' OR ma.thumbnail_storage_key IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM media_asset_user_checks mc
          WHERE mc.media_asset_id = ma.id
            AND mc.user_id = ${userId}::uuid
            AND mc.reference_sha256 IS NOT DISTINCT FROM ${ref.content_sha256}::text
        )
      ORDER BY ma.created_at DESC NULLS LAST, ma.id DESC
      LIMIT ${pageSize}::int
    `;

    if (assets.length === 0) {
      await prisma.$executeRaw`
        UPDATE user_event_face_scans
        SET status = 'complete',
            scanned_count = scanned_count + ${scanned},
            matched_count = matched_count + ${matched},
            last_error = NULL,
            updated_at = now()
        WHERE user_id = ${userId}::uuid AND event_id = ${eventId}::uuid
      `;
      void dispatchScanMatchNotifications(eventId, userId, newlyMatchedAssets);
      return { scanned, matched, complete: true };
    }

    for (const asset of assets) {
      if (Date.now() >= deadline) break;
      lastCreated = asset.created_at;
      lastId = asset.id;
      scanned += 1;

      const existing = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM media_matches
        WHERE media_asset_id = ${asset.id}::uuid
          AND user_id = ${userId}::uuid
          AND match_source = 'rekognition'
          AND reference_sha256 IS NOT DISTINCT FROM ${ref.content_sha256}::text
        LIMIT 1
      `;
      if (existing[0]) {
        await markAssetCheckedForUser(asset.id, userId, ref.content_sha256);
        continue;
      }

      let loaded: { bytes: Buffer; mediaType: 'image' | 'video' } | null;
      try {
        loaded = await loadCompareBytes(asset);
      } catch {
        console.error('[people-media] media could not be read', asset.id);
        await markAssetCheckedForUser(asset.id, userId, ref.content_sha256);
        continue;
      }
      if (!loaded) {
        continue;
      }

      const compared = await compareReferenceToAsset({
        referenceBytes,
        targetBytes: loaded.bytes,
        mediaType: loaded.mediaType,
      });
      if (!compared.ok) {
        if (compared.reason === 'throttled') {
          await prisma.$executeRaw`
            UPDATE user_event_face_scans
            SET status = 'pending',
                last_asset_id = ${lastId}::uuid,
                last_asset_created_at = ${lastCreated},
                scanned_count = scanned_count + ${scanned},
                matched_count = matched_count + ${matched},
                last_error = 'throttled',
                next_retry_at = now() + interval '20 seconds' * power(2, LEAST(attempt_count, 5)),
                updated_at = now()
            WHERE user_id = ${userId}::uuid AND event_id = ${eventId}::uuid
          `;
          void dispatchScanMatchNotifications(eventId, userId, newlyMatchedAssets);
          return { scanned, matched, complete: false };
        }
        await markAssetCheckedForUser(asset.id, userId, ref.content_sha256);
        continue;
      }

      const mediaFaceId = await ensureMediaFace(asset.id);
      if (!mediaFaceId) {
        await markAssetCheckedForUser(asset.id, userId, ref.content_sha256);
        continue;
      }
      await upsertRekognitionMatch({
        mediaAssetId: asset.id,
        mediaFaceId,
        userId,
        similarity: compared.similarity / 100,
        referenceSha256: ref.content_sha256,
        evidence: evidenceForCompare(loaded.mediaType, compared),
      });
      await markAssetCheckedForUser(asset.id, userId, ref.content_sha256);
      matched += 1;
      newlyMatchedAssets.push(asset);
    }

    await prisma.$executeRaw`
      UPDATE user_event_face_scans
      SET last_asset_id = ${lastId}::uuid,
          last_asset_created_at = ${lastCreated},
          scanned_count = scanned_count + ${scanned},
          matched_count = matched_count + ${matched},
          updated_at = now()
      WHERE user_id = ${userId}::uuid AND event_id = ${eventId}::uuid
    `;
    scanned = 0;
    matched = 0;
  }

  await prisma.$executeRaw`
    UPDATE user_event_face_scans
    SET status = 'pending',
        last_asset_id = ${lastId}::uuid,
        last_asset_created_at = ${lastCreated},
        updated_at = now()
    WHERE user_id = ${userId}::uuid AND event_id = ${eventId}::uuid
  `;
  void dispatchScanMatchNotifications(eventId, userId, newlyMatchedAssets);
  return { scanned, matched, complete: false };
}

/**
 * Targeted inline recognition pass used by GET /api/events/[event_id]/my-media
 * so newly uploaded posts or profile photos reflect immediately on Vercel without waiting for cron.
 */
export async function runUserEventRecognitionNow(input: {
  userId: string;
  eventId: string;
  timeBudgetMs?: number;
}): Promise<{ complete: boolean }> {
  const { userId, eventId, timeBudgetMs = 9_000 } = input;
  await ensurePeopleMediaSchema();
  if (!rekognitionClient()) return { complete: false };

  const deadline = Date.now() + timeBudgetMs;

  // 1. Ensure this user's face reference is ready if it is still pending or previously errored transiently
  const refRows = await prisma.$queryRaw<
    { id: string; storage_key: string | null; content_sha256: string | null; processing_status: string }[]
  >`
    SELECT id, storage_key, content_sha256, processing_status
    FROM user_face_references
    WHERE user_id = ${userId}::uuid
      AND consent = true
      AND revoked_at IS NULL
      AND storage_key IS NOT NULL
    LIMIT 1
  `;
  const ref = refRows[0];
  if (!ref?.storage_key) return { complete: true };

  if (ref.processing_status === 'pending' || ref.processing_status === 'failed') {
    try {
      const stored = await readStoredMedia(ref.storage_key);
      const detected = await detectRekognitionFaces(stored.bytes, { job_id: ref.id, job_kind: 'reference' });
      if (!detected.ok) throw detectFacesOutcomeToError(detected);
      if (detected.faces.length !== 1) {
        await clearFaceEmbedding(userId);
        await deleteMatchesForUser(userId);
        await prisma.$executeRaw`
          UPDATE user_face_references
          SET processing_status = 'failed',
              attempt_count = ${faceMaxAttempts()},
              last_error = ${detected.faces.length === 0 ? 'No face detected in the reference photo' : 'Profile photo must contain exactly one face'},
              next_retry_at = NULL,
              updated_at = now()
          WHERE id = ${ref.id}::uuid
        `;
        return { complete: true };
      }

      const embedding = new Array(FACE_EMBEDDING_DIM).fill(0);
      embedding[0] = 1;
      try {
        const vectorSql = Prisma.raw(`'${toVectorLiteral(embedding)}'::vector`);
        await prisma.$executeRaw`
          UPDATE user_face_references
          SET embedding = ${vectorSql},
              processing_status = 'ready',
              last_error = NULL,
              next_retry_at = NULL,
              updated_at = now()
          WHERE id = ${ref.id}::uuid
        `;
      } catch {
        await prisma.$executeRaw`
          UPDATE user_face_references
          SET processing_status = 'ready',
              last_error = NULL,
              next_retry_at = NULL,
              updated_at = now()
          WHERE id = ${ref.id}::uuid
        `;
      }
      await deleteMatchesForUser(userId);
      await resetUserEventScans(userId, ref.content_sha256 ?? '');
    } catch (err) {
      console.warn('[people-media] inline reference preparation failed:', err);
      return { complete: false };
    }
  }

  // 2. Ensure scan row exists and check if any event assets remain unchecked for this user
  await ensureUserEventScans(userId, ref.content_sha256 ?? '');

  const unchecked = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM media_assets ma
    WHERE ma.event_id = ${eventId}::uuid
      AND (ma.media_type::text <> 'video' OR ma.thumbnail_storage_key IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM media_asset_user_checks mc
        WHERE mc.media_asset_id = ma.id
          AND mc.user_id = ${userId}::uuid
          AND mc.reference_sha256 IS NOT DISTINCT FROM ${ref.content_sha256}::text
      )
  `;

  if ((unchecked[0]?.n ?? 0) === 0) {
    // Still make sure scan status is synced to complete if nothing remains
    await prisma.$executeRaw`
      UPDATE user_event_face_scans
      SET status = 'complete', last_error = NULL, updated_at = now()
      WHERE user_id = ${userId}::uuid AND event_id = ${eventId}::uuid AND status <> 'complete'
    `;
    return { complete: true };
  }

  const scanRes = await processUserEventScan(userId, eventId, deadline);
  return { complete: scanRes.complete };
}

export async function failUserEventScan(
  userId: string,
  eventId: string,
  message: string,
  permanent = false
): Promise<void> {
  const maxAttempts = faceMaxAttempts();
  if (permanent) {
    await prisma.$executeRaw`
      UPDATE user_event_face_scans
      SET status = 'failed',
          attempt_count = ${maxAttempts}::int,
          last_error = ${message},
          next_retry_at = NULL,
          updated_at = now()
      WHERE user_id = ${userId}::uuid
        AND event_id = ${eventId}::uuid
    `;
    return;
  }
  await prisma.$executeRaw`
    UPDATE user_event_face_scans
    SET status = 'failed',
        attempt_count = attempt_count + 1,
        last_error = ${message},
        next_retry_at = now() + (LEAST(600, 15 * power(2, GREATEST(attempt_count, 1))) * interval '1 second'),
        updated_at = now()
    WHERE user_id = ${userId}::uuid
      AND event_id = ${eventId}::uuid
  `;
}
