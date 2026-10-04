import { unlink } from 'fs/promises';
import path from 'path';
import prisma from '@/server/prisma';
import { deleteObjectByKey } from '@/lib/s3-presign';
import { saveUploadedFile } from '@/lib/upload';
import { FACE_CONSENT_VERSION } from './config';
import { clearFaceEmbedding, deleteMatchesForUser } from './match';
import { sha256Hex } from './storage';

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

export async function enrollFaceReference(userId: string, file: File): Promise<FaceReferenceStatus> {
  const saved = await saveUploadedFile(file, 'image', process.cwd(), { prefix: `face-references/${userId}` });
  const storageKey = saved.storageKey;
  if (!storageKey) throw new Error('Face reference file was not stored');

  const previous = await prisma.user_face_references.findUnique({
    where: { user_id: userId },
    select: { storage_key: true },
  });

  await deleteMatchesForUser(userId);
  const contentSha = sha256Hex(storageKey);
  await prisma.$executeRaw`
    INSERT INTO user_face_references (
      id, user_id, consent, consent_version, consented_at, revoked_at,
      storage_key, content_sha256, processing_status, attempt_count, last_error, embedding, updated_at
    )
    VALUES (
      gen_random_uuid(), ${userId}::uuid, true, ${FACE_CONSENT_VERSION}, now(), NULL,
      ${storageKey}, ${contentSha}, 'pending', 0, NULL, NULL, now()
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
      updated_at = now()
  `;
  if (previous?.storage_key && previous.storage_key !== storageKey) {
    await deleteStoredReference(previous.storage_key);
  }
  const status = await getFaceReferenceStatus(userId);
  if (!status) throw new Error('Face reference was not saved');
  return status;
}
