import { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { FACE_EMBEDDING_DIM, faceMatchMinSimilarity } from './config';

export function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== FACE_EMBEDDING_DIM || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error('Invalid face embedding');
  }
  return `[${embedding.join(',')}]`;
}

/** Match one media face against consented references of guests of the same event. */
export async function matchFaceToEventGuests(input: {
  eventId: string;
  mediaAssetId: string;
  mediaFaceId: string;
  embedding: number[];
}): Promise<void> {
  const vector = toVectorLiteral(input.embedding);
  const threshold = faceMatchMinSimilarity();
  await prisma.$executeRaw`
    INSERT INTO media_matches (id, media_asset_id, media_face_id, user_id, similarity)
    SELECT gen_random_uuid(),
           ${input.mediaAssetId}::uuid,
           ${input.mediaFaceId}::uuid,
           ufr.user_id,
           1 - (ufr.embedding <=> ${vector}::vector)
    FROM user_face_references ufr
    JOIN event_guests eg ON eg.user_id = ufr.user_id AND eg.event_id = ${input.eventId}::uuid
    WHERE ufr.consent = true
      AND ufr.revoked_at IS NULL
      AND ufr.embedding IS NOT NULL
      AND 1 - (ufr.embedding <=> ${vector}::vector) >= ${threshold}
    ON CONFLICT (media_face_id, user_id)
    DO UPDATE SET similarity = EXCLUDED.similarity
  `;
}

/** Match one consented user against faces already stored for events they belong to. */
export async function matchUserToGuestMedia(userId: string, embedding: number[]): Promise<void> {
  const vector = toVectorLiteral(embedding);
  const threshold = faceMatchMinSimilarity();
  await prisma.$executeRaw`
    INSERT INTO media_matches (id, media_asset_id, media_face_id, user_id, similarity)
    SELECT gen_random_uuid(),
           mf.media_asset_id,
           mf.id,
           ${userId}::uuid,
           1 - (mf.embedding <=> ${vector}::vector)
    FROM media_faces mf
    JOIN media_assets ma ON ma.id = mf.media_asset_id
    JOIN event_guests eg ON eg.event_id = ma.event_id AND eg.user_id = ${userId}::uuid
    WHERE 1 - (mf.embedding <=> ${vector}::vector) >= ${threshold}
    ON CONFLICT (media_face_id, user_id)
    DO UPDATE SET similarity = EXCLUDED.similarity
  `;
}

export async function deleteMatchesForUser(userId: string): Promise<void> {
  await prisma.media_matches.deleteMany({ where: { user_id: userId } });
}

export async function clearFaceEmbedding(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE user_face_references
    SET embedding = NULL, updated_at = now()
    WHERE user_id = ${userId}::uuid
  `;
}

export function isPrismaUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
