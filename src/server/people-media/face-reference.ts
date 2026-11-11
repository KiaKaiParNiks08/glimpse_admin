import { Prisma } from '@prisma/client';
import { unlink } from 'fs/promises';
import path from 'path';
import prisma from '@/server/prisma';
import { deleteObjectByKey } from '@/lib/s3-presign';
import { saveUploadedFile } from '@/lib/upload';
import { FACE_CONSENT_VERSION, FACE_EMBEDDING_DIM } from './config';
import { ensurePeopleMediaSchema } from './ensure-schema';
import { clearFaceEmbedding, deleteMatchesForUser, toVectorLiteral } from './match';
import { backfillUserEventMedia } from './register';
import { ensureUserEventScans, resetUserEventScans } from './scans';
import { scheduleFaceProcessing } from './schedule';
import { sha256Hex, storageKeyFromMediaUrl } from './storage';

const referenceSelect = {
  consent: true,
  consent_version: true,
  processing_status: true,
  last_error: true,
  consented_at: true,
  revoked_at: true,
  updated_at: true,
} as const;

export type FaceReferenceStatus = {
  consent: boolean;
  consent_version: string;
  processing_status: string;
  last_error: string | null;
  consented_at: Date | null;
  revoked_at: Date | null;
  updated_at: Date | null;
  has_embedding: boolean;
};

async function hasEmbedding(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ has_embedding: boolean }[]>`
    SELECT (embedding IS NOT NULL) AS has_embedding
    FROM user_face_references
    WHERE user_id = ${userId}::uuid
  `;
  return rows[0]?.has_embedding === true;
}

export async function getFaceReferenceStatus(userId: string): Promise<FaceReferenceStatus | null> {
  const row = await prisma.user_face_references.findUnique({
    where: { user_id: userId },
    select: referenceSelect,
  });
  if (!row) return null;
  return { ...row, has_embedding: await hasEmbedding(userId) };
}

async function deleteStoredReference(storageKey: string | null): Promise<void> {
  if (!storageKey) return;
  try {
    if (storageKey.startsWith('uploads/')) {
      const root = path.resolve(process.cwd(), 'public');
      const full = path.resolve(root, storageKey);
      if (full.startsWith(root + path.sep)) await unlink(full);
      return;
    }
    await deleteObjectByKey(storageKey);
  } catch (error) {
    console.error('[people-media] reference file delete failed', error);
  }
}

export async function revokeFaceReference(userId: string): Promise<FaceReferenceStatus | null> {
  const existing = await prisma.user_face_references.findUnique({
    where: { user_id: userId },
    select: { storage_key: true },
  });
  if (!existing) return null;
  await deleteMatchesForUser(userId);
  await prisma.$executeRaw`DELETE FROM media_asset_user_checks WHERE user_id = ${userId}::uuid`.catch(() => {});
  await clearFaceEmbedding(userId);
  await deleteStoredReference(existing.storage_key);
  const row = await prisma.user_face_references.update({
    where: { user_id: userId },
    data: {
      consent: false,
      revoked_at: new Date(),
      storage_key: null,
      content_sha256: null,
      processing_status: 'revoked',
      last_error: null,
      next_retry_at: null,
      attempt_count: 0,
    },
    select: referenceSelect,
  });
  return { ...row, has_embedding: false };
}

async function findFallbackAvatarStorageKey(userId: string): Promise<string | null> {
  const eventProfiles = await prisma.$queryRaw<{ avatar_url: string | null }[]>`
    SELECT avatar_url FROM user_event_profiles
    WHERE user_id = ${userId}::uuid AND avatar_url IS NOT NULL AND avatar_url <> ''
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `.catch(() => []);
  const eventKey = storageKeyFromMediaUrl(eventProfiles[0]?.avatar_url);
  if (eventKey) return eventKey;

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { avatar_url: true },
  });
  return storageKeyFromMediaUrl(user?.avatar_url);
}

/** Keep a valid enrolled reference and queue event scans. Does not replace the stored photo. */
export async function queueExistingFaceReference(userId: string): Promise<FaceReferenceStatus | null> {
  await ensurePeopleMediaSchema();
  const row = await prisma.user_face_references.findUnique({
    where: { user_id: userId },
    select: { storage_key: true, content_sha256: true, consent: true, revoked_at: true, processing_status: true },
  });

  if (!row) {
    const fallbackKey = await findFallbackAvatarStorageKey(userId);
    if (fallbackKey) {
      return enrollStoredFaceReference(userId, fallbackKey);
    }
    return null;
  }

  if (!row.storage_key || !row.consent || row.revoked_at) return getFaceReferenceStatus(userId);
  if (row.processing_status === 'failed') {
    await prisma.user_face_references.update({
      where: { user_id: userId },
      data: { processing_status: 'pending', next_retry_at: null, last_error: null, attempt_count: 0 },
    });
  }
  try {
    await backfillUserEventMedia(userId);
  } catch (error) {
    console.error('[people-media] event media backfill failed', error);
  }
  try {
    await ensureUserEventScans(userId, row.content_sha256 ?? sha256Hex(row.storage_key));
  } catch (error) {
    console.error('[people-media] user event scans were not queued', error);
  }
  scheduleFaceProcessing();
  return getFaceReferenceStatus(userId);
}

export async function enrollFaceReference(userId: string, file: File): Promise<FaceReferenceStatus> {
  const saved = await saveUploadedFile(file, 'image', process.cwd(), { prefix: `face-references/${userId}` });
  return enrollStoredFaceReference(userId, saved.storageKey);
}

/** Enroll using a file that is already in S3 (the profile picture). Avoids a second File read on Vercel. */
export async function enrollStoredFaceReference(
  userId: string,
  storageKey: string,
  options?: { verifiedSingleFace?: boolean }
): Promise<FaceReferenceStatus> {
  if (!storageKey) throw new Error('Face reference file was not stored');
  await ensurePeopleMediaSchema();

  const previous = await prisma.user_face_references.findUnique({
    where: { user_id: userId },
    select: { storage_key: true, processing_status: true, consent: true, revoked_at: true },
  });
  const contentSha = sha256Hex(storageKey);

  if (
    previous?.storage_key === storageKey &&
    previous.consent &&
    previous.revoked_at == null &&
    (previous.processing_status === 'ready' || previous.processing_status === 'pending')
  ) {
    try {
      await backfillUserEventMedia(userId);
    } catch (error) {
      console.error('[people-media] event media backfill failed', error);
    }
    try {
      await ensureUserEventScans(userId, contentSha);
    } catch (error) {
      console.error('[people-media] user event scans were not queued', error);
    }
    scheduleFaceProcessing();
    const status = await getFaceReferenceStatus(userId);
    if (!status) throw new Error('Face reference was not saved');
    return status;
  }

  await deleteMatchesForUser(userId);
  await prisma.$executeRaw`DELETE FROM media_asset_user_checks WHERE user_id = ${userId}::uuid`.catch(() => {});

  const initialStatus = options?.verifiedSingleFace ? 'ready' : 'pending';
  const unitVec = new Array(FACE_EMBEDDING_DIM).fill(0);
  unitVec[0] = 1;

  if (options?.verifiedSingleFace) {
    try {
      const vectorSql = Prisma.raw(`'${toVectorLiteral(unitVec)}'::vector`);
      await prisma.$executeRaw`
        INSERT INTO user_face_references (
          id, user_id, consent, consent_version, consented_at, revoked_at,
          storage_key, content_sha256, processing_status, attempt_count, last_error, embedding,
          reference_version, updated_at
        )
        VALUES (
          gen_random_uuid(), ${userId}::uuid, true, ${FACE_CONSENT_VERSION}, now(), NULL,
          ${storageKey}, ${contentSha}, ${initialStatus}, 0, NULL, ${vectorSql}, 1, now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          consent = true,
          consent_version = EXCLUDED.consent_version,
          consented_at = now(),
          revoked_at = NULL,
          storage_key = EXCLUDED.storage_key,
          content_sha256 = EXCLUDED.content_sha256,
          processing_status = EXCLUDED.processing_status,
          attempt_count = 0,
          last_error = NULL,
          next_retry_at = NULL,
          embedding = EXCLUDED.embedding,
          reference_version = user_face_references.reference_version + 1,
          updated_at = now()
      `;
    } catch {
      await prisma.$executeRaw`
        INSERT INTO user_face_references (
          id, user_id, consent, consent_version, consented_at, revoked_at,
          storage_key, content_sha256, processing_status, attempt_count, last_error, embedding,
          reference_version, updated_at
        )
        VALUES (
          gen_random_uuid(), ${userId}::uuid, true, ${FACE_CONSENT_VERSION}, now(), NULL,
          ${storageKey}, ${contentSha}, ${initialStatus}, 0, NULL, NULL, 1, now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          consent = true,
          consent_version = EXCLUDED.consent_version,
          consented_at = now(),
          revoked_at = NULL,
          storage_key = EXCLUDED.storage_key,
          content_sha256 = EXCLUDED.content_sha256,
          processing_status = EXCLUDED.processing_status,
          attempt_count = 0,
          last_error = NULL,
          next_retry_at = NULL,
          embedding = NULL,
          reference_version = user_face_references.reference_version + 1,
          updated_at = now()
      `;
    }
  } else {
    await prisma.$executeRaw`
      INSERT INTO user_face_references (
        id, user_id, consent, consent_version, consented_at, revoked_at,
        storage_key, content_sha256, processing_status, attempt_count, last_error, embedding,
        reference_version, updated_at
      )
      VALUES (
        gen_random_uuid(), ${userId}::uuid, true, ${FACE_CONSENT_VERSION}, now(), NULL,
        ${storageKey}, ${contentSha}, 'pending', 0, NULL, NULL, 1, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        consent = true,
        consent_version = EXCLUDED.consent_version,
        consented_at = now(),
        revoked_at = NULL,
        storage_key = EXCLUDED.storage_key,
        content_sha256 = EXCLUDED.content_sha256,
        processing_status = 'pending',
        attempt_count = 0,
        last_error = NULL,
        next_retry_at = NULL,
        embedding = NULL,
        reference_version = user_face_references.reference_version + 1,
        updated_at = now()
    `;
  }

  if (previous?.storage_key && previous.storage_key !== storageKey) {
    await deleteStoredReference(previous.storage_key);
  }
  try {
    await backfillUserEventMedia(userId);
  } catch (error) {
    console.error('[people-media] event media backfill failed', error);
  }
  try {
    await resetUserEventScans(userId, contentSha);
  } catch (error) {
    console.error('[people-media] user event scans were not queued', error);
  }
  scheduleFaceProcessing();
  const status = await getFaceReferenceStatus(userId);
  if (!status) throw new Error('Face reference was not saved');
  return status;
}
