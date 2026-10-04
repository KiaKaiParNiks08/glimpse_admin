import prisma from '@/server/prisma';
import { assertEmbeddingConfig, faceMaxAttempts, faceWorkerBatchSize } from './config';
import { getFaceProvider } from './face-provider';
import { clearFaceEmbedding, deleteMatchesForUser, matchFaceToEventGuests, matchUserToGuestMedia, toVectorLiteral } from './match';
import { readStoredMedia } from './storage';
import type { DetectedFace } from './types';

class PermanentFaceError extends Error {}

const MAX_FACES = 20;

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Face processing failed';
  return message.slice(0, 500);
}

function topFaces(faces: DetectedFace[]): DetectedFace[] {
  return [...faces].sort((a, b) => b.confidence - a.confidence).slice(0, MAX_FACES);
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
}

async function claimMediaIds(batch: number, maxAttempts: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE media_assets
    SET processing_status = 'processing',
        attempt_count = attempt_count + 1,
        last_error = NULL,
        updated_at = now()
    WHERE id IN (
      SELECT id FROM media_assets
      WHERE processing_status = 'pending'
         OR (
           processing_status = 'failed'
           AND attempt_count < ${maxAttempts}
           AND (next_retry_at IS NULL OR next_retry_at <= now())
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
        attempt_count = attempt_count + 1,
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
        last_error = ${message},
        next_retry_at = now() + (attempt_count * interval '30 seconds'),
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
        next_retry_at = now() + (attempt_count * interval '30 seconds'),
        updated_at = now()
    WHERE id = ${id}::uuid
  `;
}

async function processMedia(id: string): Promise<void> {
  const asset = await prisma.media_assets.findUnique({
    where: { id },
    select: {
      id: true,
      event_id: true,
      storage_key: true,
      media_type: true,
    },
  });
  if (!asset) return;

  const stored = await readStoredMedia(asset.storage_key);
  const faces = topFaces(
    await getFaceProvider().detectFaces({
      bytes: stored.bytes,
      contentType: stored.contentType,
      mediaType: asset.media_type,
    })
  );

  await prisma.media_faces.deleteMany({ where: { media_asset_id: asset.id } });

  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    const vector = toVectorLiteral(face.embedding);
    const inserted = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO media_faces (id, media_asset_id, face_index, confidence, box, embedding)
      VALUES (
        gen_random_uuid(),
        ${asset.id}::uuid,
        ${index},
        ${face.confidence},
        ${JSON.stringify(face.box)}::jsonb,
        ${vector}::vector
      )
      RETURNING id
    `;
    const faceId = inserted[0]?.id;
    if (!faceId) continue;
    await matchFaceToEventGuests({
      eventId: asset.event_id,
      mediaAssetId: asset.id,
      mediaFaceId: faceId,
      embedding: face.embedding,
    });
  }

  await prisma.media_assets.update({
    where: { id: asset.id },
    data: {
      processing_status: 'ready',
      face_count: faces.length,
      last_error: null,
      next_retry_at: null,
      processed_at: new Date(),
    },
  });
}

async function processReference(id: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ user_id: string; storage_key: string }[]>`
    SELECT user_id, storage_key
    FROM user_face_references
    WHERE id = ${id}::uuid
      AND consent = true
      AND revoked_at IS NULL
      AND storage_key IS NOT NULL
  `;
  const row = rows[0];
  if (!row?.storage_key) return;

  const stored = await readStoredMedia(row.storage_key);
  const faces = topFaces(
    await getFaceProvider().detectFaces({
      bytes: stored.bytes,
      contentType: stored.contentType,
      mediaType: 'image',
    })
  );
  const best = faces[0];
  if (!best) {
    await clearFaceEmbedding(row.user_id);
    await deleteMatchesForUser(row.user_id);
    throw new PermanentFaceError('No face detected in the reference photo');
  }

  const vector = toVectorLiteral(best.embedding);
  const updated = await prisma.$executeRaw`
    UPDATE user_face_references
    SET embedding = ${vector}::vector,
        processing_status = 'ready',
        last_error = NULL,
        next_retry_at = NULL,
        updated_at = now()
    WHERE id = ${id}::uuid
      AND consent = true
      AND revoked_at IS NULL
  `;
  if (updated > 0) {
    await deleteMatchesForUser(row.user_id);
    await matchUserToGuestMedia(row.user_id, best.embedding);
  }
}

export type ProcessBatchResult = {
  media_processed: number;
  media_failed: number;
  references_processed: number;
  references_failed: number;
};

export async function processFaceQueue(): Promise<ProcessBatchResult> {
  assertEmbeddingConfig();
  const batch = faceWorkerBatchSize();
  const maxAttempts = faceMaxAttempts();
  await reclaimStuckJobs();

  const result: ProcessBatchResult = {
    media_processed: 0,
    media_failed: 0,
    references_processed: 0,
    references_failed: 0,
  };

  const referenceIds = await claimReferenceIds(batch, maxAttempts);
  for (const id of referenceIds) {
    try {
      await processReference(id);
    } catch (error) {
      result.references_failed += 1;
      await failReference(id, errorText(error), error instanceof PermanentFaceError);
    }
  }

  const mediaIds = await claimMediaIds(batch, maxAttempts);
  for (const id of mediaIds) {
    try {
      await processMedia(id);
      result.media_processed += 1;
    } catch (error) {
      result.media_failed += 1;
      await failMedia(id, errorText(error));
    }
  }

  result.references_processed = referenceIds.length - result.references_failed;
  return result;
}
