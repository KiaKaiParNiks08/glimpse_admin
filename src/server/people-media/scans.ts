import prisma from '@/server/prisma';
import { faceComparePageSize, faceMaxAttempts } from './config';
import {
  compareReferenceToAsset,
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

/** New event photos should be compared even if a user's scan already finished. Keep the cursor. */
export async function reopenCompleteScansForEvent(eventId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE user_event_face_scans
    SET status = 'pending',
        last_error = NULL,
        next_retry_at = NULL,
        updated_at = now()
    WHERE event_id = ${eventId}::uuid
      AND status = 'complete'
  `;
}

export async function resetUserEventScans(userId: string, referenceSha256: string): Promise<void> {
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

async function loadCompareBytes(asset: AssetRow): Promise<{ bytes: Buffer; mediaType: 'image' | 'video' } | null> {
  if (asset.media_type === 'video') {
    if (!asset.thumbnail_storage_key) return null;
    const stored = await readStoredMedia(asset.thumbnail_storage_key);
    return { bytes: stored.bytes, mediaType: 'video' };
  }
  const stored = await readStoredMedia(asset.storage_key);
  return { bytes: stored.bytes, mediaType: 'image' };
}

export async function claimUserEventScans(batch: number, maxAttempts: number): Promise<{ user_id: string; event_id: string }[]> {
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
      ORDER BY updated_at ASC
      LIMIT ${batch}::int
      FOR UPDATE SKIP LOCKED
    )
    RETURNING user_id, event_id
  `;
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

  while (Date.now() < deadline) {
    const assets =
      lastCreated && lastId
        ? await prisma.$queryRaw<AssetRow[]>`
            SELECT ma.id, ma.storage_key, ma.media_type::text AS media_type, ma.thumbnail_storage_key, ma.created_at
            FROM media_assets ma
            WHERE ma.event_id = ${eventId}::uuid
              AND (
                ma.created_at > ${lastCreated}
                OR (ma.created_at = ${lastCreated} AND ma.id > ${lastId}::uuid)
              )
            ORDER BY ma.created_at ASC NULLS LAST, ma.id ASC
            LIMIT ${pageSize}::int
          `
        : lastCreated
          ? await prisma.$queryRaw<AssetRow[]>`
              SELECT ma.id, ma.storage_key, ma.media_type::text AS media_type, ma.thumbnail_storage_key, ma.created_at
              FROM media_assets ma
              WHERE ma.event_id = ${eventId}::uuid
                AND ma.created_at > ${lastCreated}
              ORDER BY ma.created_at ASC NULLS LAST, ma.id ASC
              LIMIT ${pageSize}::int
            `
          : await prisma.$queryRaw<AssetRow[]>`
              SELECT ma.id, ma.storage_key, ma.media_type::text AS media_type, ma.thumbnail_storage_key, ma.created_at
              FROM media_assets ma
              WHERE ma.event_id = ${eventId}::uuid
              ORDER BY ma.created_at ASC NULLS LAST, ma.id ASC
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
      if (existing[0]) continue;

      let loaded: { bytes: Buffer; mediaType: 'image' | 'video' } | null;
      try {
        loaded = await loadCompareBytes(asset);
      } catch {
        console.error('[people-media] media could not be read', asset.id);
        continue;
      }
      if (!loaded) continue;

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
          return { scanned, matched, complete: false };
        }
        continue;
      }
      const mediaFaceId = await ensureMediaFace(asset.id);
      if (!mediaFaceId) continue;
      await upsertRekognitionMatch({
        mediaAssetId: asset.id,
        mediaFaceId,
        userId,
        similarity: compared.similarity / 100,
        referenceSha256: ref.content_sha256,
        evidence: evidenceForCompare(loaded.mediaType, compared),
      });
      matched += 1;
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
    if (assets.length < pageSize && Date.now() < deadline) {
      await prisma.$executeRaw`
        UPDATE user_event_face_scans
        SET status = 'complete', last_error = NULL, updated_at = now()
        WHERE user_id = ${userId}::uuid AND event_id = ${eventId}::uuid
      `;
      return { scanned: 0, matched: 0, complete: true };
    }
  }

  await prisma.$executeRaw`
    UPDATE user_event_face_scans
    SET status = 'pending',
        last_asset_id = ${lastId}::uuid,
        last_asset_created_at = ${lastCreated},
        updated_at = now()
    WHERE user_id = ${userId}::uuid AND event_id = ${eventId}::uuid
  `;
  return { scanned, matched, complete: false };
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
