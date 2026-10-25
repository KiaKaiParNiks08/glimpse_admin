import { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import {
  FACE_EMBEDDING_DIM,
  assertEmbeddingConfig,
  faceMaxAttempts,
  faceWorkerBatchSize,
  faceWorkerTimeBudgetMs,
} from './config';
import { ensurePeopleMediaSchema } from './ensure-schema';
import { clearFaceEmbedding, deleteMatchesForUser, toVectorLiteral } from './match';
import {
  detectRekognitionFaces,
  ensureMediaFace,
  rekognitionClient,
} from './rekognition';
import {
  claimUserEventScans,
  failUserEventScan,
  matchGuestsForAssetPage,
  processUserEventScan,
  resetUserEventScans,
} from './scans';
import { readStoredMedia } from './storage';
import type { DetectedFace } from './types';

class PermanentFaceError extends Error {}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Face processing failed';
  return message.slice(0, 500);
}

async function insertMediaFace(
  assetId: string,
  index: number,
  face: DetectedFace
): Promise<string | null> {
  const box = JSON.stringify(face.box);
  try {
    const vectorSql = Prisma.raw(`'${toVectorLiteral(face.embedding)}'::vector`);
    const inserted = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO media_faces (id, media_asset_id, face_index, confidence, box, embedding)
      VALUES (
        gen_random_uuid(),
        ${assetId}::uuid,
        ${index},
        ${face.confidence},
        ${box}::jsonb,
        ${vectorSql}
      )
      ON CONFLICT (media_asset_id, face_index) DO UPDATE SET
        confidence = EXCLUDED.confidence,
        box = EXCLUDED.box
      RETURNING id
    `;
    return inserted[0]?.id ?? null;
  } catch (error) {
    console.error('[people-media] vector face insert failed, trying jsonb', error);
    const inserted = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO media_faces (id, media_asset_id, face_index, confidence, box, embedding)
      VALUES (
        gen_random_uuid(),
        ${assetId}::uuid,
        ${index},
        ${face.confidence},
        ${box}::jsonb,
        ${JSON.stringify(face.embedding)}::jsonb
      )
      ON CONFLICT (media_asset_id, face_index) DO UPDATE SET confidence = EXCLUDED.confidence
      RETURNING id
    `;
    return inserted[0]?.id ?? null;
  }
}

async function reclaimStuckJobs(): Promise<void> {
  await prisma.$executeRaw`
    UPDATE media_assets
    SET processing_status = 'pending', updated_at = now()
    WHERE processing_status = 'processing'
      AND updated_at < now() - interval '15 minutes'
  `;
  await prisma.$executeRaw`
    UPDATE user_face_references
    SET processing_status = 'pending', updated_at = now()
    WHERE processing_status = 'processing'
      AND updated_at < now() - interval '15 minutes'
  `;
  await prisma.$executeRaw`
    UPDATE user_event_face_scans
    SET status = 'pending', updated_at = now()
    WHERE status = 'processing'
      AND updated_at < now() - interval '15 minutes'
  `;
}

async function claimMediaIds(batch: number, maxAttempts: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE media_assets
    SET processing_status = 'processing',
        updated_at = now()
    WHERE id IN (
      SELECT id FROM media_assets
      WHERE match_complete = false
        AND (
          processing_status = 'pending'
          OR (
            processing_status = 'failed'
            AND attempt_count < ${maxAttempts}
            AND (next_retry_at IS NULL OR next_retry_at <= now())
          )
          OR (
            processing_status = 'processing'
            AND updated_at < now() - interval '15 minutes'
          )
        )
      ORDER BY created_at ASC
      LIMIT ${batch}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  return rows.map((row) => row.id);
}

async function claimReferenceIds(batch: number, maxAttempts: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE user_face_references
    SET processing_status = 'processing',
        attempt_count = CASE WHEN processing_status = 'failed' THEN attempt_count + 1 ELSE attempt_count END,
        last_error = NULL,
        updated_at = now()
    WHERE id IN (
      SELECT id FROM user_face_references
      WHERE consent = true
        AND revoked_at IS NULL
        AND storage_key IS NOT NULL
        AND (
          processing_status = 'pending'
          OR (
            processing_status = 'failed'
            AND attempt_count < ${maxAttempts}
            AND (next_retry_at IS NULL OR next_retry_at <= now())
          )
        )
      ORDER BY updated_at ASC
      LIMIT ${batch}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  return rows.map((row) => row.id);
}

async function failMedia(id: string, message: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE media_assets
    SET processing_status = 'failed',
        attempt_count = attempt_count + 1,
        last_error = ${message},
        next_retry_at = now() + (LEAST(600, 15 * power(2, GREATEST(attempt_count, 1))) * interval '1 second'),
        updated_at = now()
    WHERE id = ${id}::uuid
  `;
}

async function failReference(id: string, message: string, stopRetrying = false): Promise<void> {
  if (stopRetrying) {
    await prisma.$executeRaw`
      UPDATE user_face_references
      SET processing_status = 'failed',
          attempt_count = ${faceMaxAttempts()},
          last_error = ${message},
          next_retry_at = NULL,
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
    return;
  }
  await prisma.$executeRaw`
    UPDATE user_face_references
    SET processing_status = 'failed',
        last_error = ${message},
        next_retry_at = now() + (LEAST(600, 15 * power(2, GREATEST(attempt_count, 1))) * interval '1 second'),
        updated_at = now()
    WHERE id = ${id}::uuid
  `;
}

async function loadAssetCompareBytes(asset: {
  media_type: string;
  storage_key: string;
  thumbnail_storage_key: string | null;
}): Promise<{ bytes: Buffer; mediaType: 'image' | 'video' } | 'no_frame'> {
  if (asset.media_type === 'video') {
    if (!asset.thumbnail_storage_key) return 'no_frame';
    const stored = await readStoredMedia(asset.thumbnail_storage_key);
    return { bytes: stored.bytes, mediaType: 'video' };
  }
  const stored = await readStoredMedia(asset.storage_key);
  return { bytes: stored.bytes, mediaType: 'image' };
}

async function persistDetectedFaces(
  assetId: string,
  faces: { confidence: number; box: { width: number; height: number; left: number; top: number } }[]
): Promise<string | null> {
  await prisma.media_faces.deleteMany({ where: { media_asset_id: assetId } });
  let primary: string | null = null;
  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    const detected: DetectedFace = {
      confidence: face.confidence,
      box: { x: face.box.left, y: face.box.top, width: face.box.width, height: face.box.height },
      embedding: new Array(FACE_EMBEDDING_DIM).fill(0),
    };
    detected.embedding[0] = 1;
    const faceId = await insertMediaFace(assetId, index, detected);
    if (faceId && index === 0) primary = faceId;
  }
  return primary ?? (await ensureMediaFace(assetId));
}

async function processMedia(id: string, deadline: number): Promise<void> {
  const asset = await prisma.media_assets.findUnique({
    where: { id },
    select: {
      id: true,
      event_id: true,
      storage_key: true,
      media_type: true,
      guest_scan_cursor: true,
      match_complete: true,
      face_count: true,
      thumbnail_storage_key: true,
    },
  });
  if (!asset) return;

  if (!rekognitionClient()) {
    throw new Error('Rekognition is not configured');
  }

  const loaded = await loadAssetCompareBytes(asset);
  if (loaded === 'no_frame') {
    await prisma.media_assets.update({
      where: { id: asset.id },
      data: {
        processing_status: 'ready',
        match_complete: true,
        face_count: 0,
        last_error: null,
        processed_at: new Date(),
      },
    });
    return;
  }

  let primaryFaceId: string | null = null;
  let faceCount = asset.face_count;
  if (!asset.guest_scan_cursor) {
    const detected = await detectRekognitionFaces(loaded.bytes);
    if (detected === 'too_large') throw new PermanentFaceError('Image is larger than Rekognition allows');
    if (detected === 'unavailable') throw new Error('Rekognition is not configured');
    if (detected === 'error') throw new Error('Rekognition DetectFaces failed');
    faceCount = detected.length;
    if (detected.length === 0) {
      await prisma.media_faces.deleteMany({ where: { media_asset_id: asset.id } });
      await prisma.media_assets.update({
        where: { id: asset.id },
        data: {
          processing_status: 'ready',
          match_complete: true,
          face_count: 0,
          last_error: null,
          processed_at: new Date(),
        },
      });
      return;
    }
    primaryFaceId = await persistDetectedFaces(asset.id, detected);
  } else {
    primaryFaceId = await ensureMediaFace(asset.id);
  }

  if (!primaryFaceId) throw new Error('Unable to store media face');

  const page = await matchGuestsForAssetPage({
    eventId: asset.event_id,
    mediaAssetId: asset.id,
    mediaFaceId: primaryFaceId,
    targetBytes: loaded.bytes,
    mediaType: loaded.mediaType,
    cursor: asset.guest_scan_cursor,
    deadline,
  });

  if (page.throttled) {
    await prisma.media_assets.update({
      where: { id: asset.id },
      data: {
        processing_status: 'pending',
        guest_scan_cursor: page.lastUserId,
        match_complete: false,
        face_count: faceCount,
        last_error: 'throttled',
        next_retry_at: new Date(Date.now() + 20_000),
      },
    });
    return;
  }

  if (page.done) {
    await prisma.media_assets.update({
      where: { id: asset.id },
      data: {
        processing_status: 'ready',
        match_complete: true,
        guest_scan_cursor: page.lastUserId,
        face_count: faceCount,
        last_error: null,
        next_retry_at: null,
        processed_at: new Date(),
      },
    });
    return;
  }

  await prisma.media_assets.update({
    where: { id: asset.id },
    data: {
      processing_status: 'pending',
      match_complete: false,
      guest_scan_cursor: page.lastUserId,
      face_count: faceCount,
      last_error: null,
    },
  });
}

async function processReference(id: string): Promise<void> {
  const rows = await prisma.$queryRaw<
    { user_id: string; storage_key: string; content_sha256: string | null }[]
  >`
    SELECT user_id, storage_key, content_sha256
    FROM user_face_references
    WHERE id = ${id}::uuid
      AND consent = true
      AND revoked_at IS NULL
      AND storage_key IS NOT NULL
  `;
  const row = rows[0];
  if (!row?.storage_key) return;

  const stored = await readStoredMedia(row.storage_key);
  const detected = await detectRekognitionFaces(stored.bytes);
  if (detected === 'too_large') throw new PermanentFaceError('Profile photo is larger than Rekognition allows');
  if (detected === 'unavailable') throw new Error('Rekognition is not configured');
  if (detected === 'error') throw new Error('Rekognition DetectFaces failed');
  if (detected.length !== 1) {
    await clearFaceEmbedding(row.user_id);
    await deleteMatchesForUser(row.user_id);
    throw new PermanentFaceError(
      detected.length === 0 ? 'No face detected in the reference photo' : 'Profile photo must contain exactly one face'
    );
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
      WHERE id = ${id}::uuid
        AND consent = true
        AND revoked_at IS NULL
    `;
  } catch {
    await prisma.$executeRaw`
      UPDATE user_face_references
      SET processing_status = 'ready',
          last_error = NULL,
          next_retry_at = NULL,
          updated_at = now()
      WHERE id = ${id}::uuid
        AND consent = true
        AND revoked_at IS NULL
    `;
  }

  await deleteMatchesForUser(row.user_id);
  await resetUserEventScans(row.user_id, row.content_sha256 ?? '');
}

export type ProcessBatchResult = {
  media_processed: number;
  media_failed: number;
  references_processed: number;
  references_failed: number;
  scans_processed: number;
  scans_failed: number;
  has_more: boolean;
};

export async function processFaceQueue(options?: { timeBudgetMs?: number }): Promise<ProcessBatchResult> {
  await ensurePeopleMediaSchema();
  assertEmbeddingConfig();
  const batch = faceWorkerBatchSize();
  const maxAttempts = faceMaxAttempts();
  const deadline = Date.now() + (options?.timeBudgetMs ?? faceWorkerTimeBudgetMs());
  await reclaimStuckJobs();

  const result: ProcessBatchResult = {
    media_processed: 0,
    media_failed: 0,
    references_processed: 0,
    references_failed: 0,
    scans_processed: 0,
    scans_failed: 0,
    has_more: false,
  };

  console.error(
    '[people-media] worker start',
    JSON.stringify({ batch, maxAttempts, budget_ms: options?.timeBudgetMs ?? faceWorkerTimeBudgetMs() })
  );

  const referenceIds = await claimReferenceIds(batch, maxAttempts);
  for (const id of referenceIds) {
    if (Date.now() >= deadline) break;
    try {
      await processReference(id);
      result.references_processed += 1;
    } catch (error) {
      result.references_failed += 1;
      await failReference(id, errorText(error), error instanceof PermanentFaceError);
    }
  }

  const mediaIds = await claimMediaIds(batch, maxAttempts);
  for (const id of mediaIds) {
    if (Date.now() >= deadline) break;
    try {
      await processMedia(id, deadline);
      result.media_processed += 1;
    } catch (error) {
      result.media_failed += 1;
      if (error instanceof PermanentFaceError) {
        await prisma.media_assets.update({
          where: { id },
          data: {
            processing_status: 'failed',
            attempt_count: faceMaxAttempts(),
            last_error: errorText(error),
            match_complete: true,
          },
        });
      } else {
        await failMedia(id, errorText(error));
      }
    }
  }

  const scans = await claimUserEventScans(batch, maxAttempts);
  for (const scan of scans) {
    if (Date.now() >= deadline) break;
    try {
      await processUserEventScan(scan.user_id, scan.event_id, deadline);
      result.scans_processed += 1;
    } catch (error) {
      result.scans_failed += 1;
      await failUserEventScan(scan.user_id, scan.event_id, errorText(error));
    }
  }

  const leftover = await prisma.$queryRaw<{ n: number }[]>`
    SELECT (
      (SELECT COUNT(*) FROM media_assets
        WHERE match_complete = false
          AND processing_status IN ('pending', 'failed', 'processing')
          AND (next_retry_at IS NULL OR next_retry_at <= now()))
      + (SELECT COUNT(*) FROM user_face_references
        WHERE consent = true AND revoked_at IS NULL AND storage_key IS NOT NULL
          AND processing_status IN ('pending', 'failed', 'processing')
          AND (next_retry_at IS NULL OR next_retry_at <= now()))
      + (SELECT COUNT(*) FROM user_event_face_scans
        WHERE status IN ('pending', 'failed', 'processing')
          AND (next_retry_at IS NULL OR next_retry_at <= now()))
    )::int AS n
  `;
  result.has_more = (leftover[0]?.n ?? 0) > 0;
  console.error(
    '[people-media] worker done',
    JSON.stringify({
      media_processed: result.media_processed,
      media_failed: result.media_failed,
      references_processed: result.references_processed,
      references_failed: result.references_failed,
      scans_processed: result.scans_processed,
      scans_failed: result.scans_failed,
      has_more: result.has_more,
    })
  );
  return result;
}
