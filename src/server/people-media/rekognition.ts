import { CompareFacesCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import prisma from '@/server/prisma';
import { readStoredMedia } from './storage';

const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;

export function rekognitionClient(): RekognitionClient | null {
  const region = process.env.AWS_REGION?.trim();
  if (!region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
  return new RekognitionClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

/** Profile lock stays strict (default 95). Event media uses a lower bar so a post photo can match. */
export function rekognitionMediaMinSimilarity(): number {
  const n = Number(process.env.FACE_REKOGNITION_MIN_SIMILARITY ?? '80');
  if (!Number.isFinite(n) || n < 70 || n > 100) return 80;
  return n;
}

export function rekognitionProfileMinSimilarity(): number {
  const n = Number(process.env.PROFILE_FACE_MIN_SIMILARITY ?? '95');
  if (!Number.isFinite(n) || n < 80 || n > 100) return 95;
  return n;
}

export type FaceCompareResult =
  | { ok: true; similarity: number }
  | { ok: false; reason: 'no_face' | 'below_threshold' | 'too_large' | 'unavailable' | 'error' };

/**
 * Compare two face photos. Source is the enrolled profile; target is the post or gallery image.
 */
export async function compareFacePhotos(
  sourceBytes: Buffer,
  targetBytes: Buffer,
  minSimilarity: number
): Promise<FaceCompareResult> {
  const client = rekognitionClient();
  if (!client) return { ok: false, reason: 'unavailable' };
  if (sourceBytes.length > REKOGNITION_MAX_BYTES || targetBytes.length > REKOGNITION_MAX_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  try {
    const result = await client.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: new Uint8Array(sourceBytes) },
        TargetImage: { Bytes: new Uint8Array(targetBytes) },
        SimilarityThreshold: minSimilarity,
      })
    );
    const similarity = result.FaceMatches?.[0]?.Similarity ?? 0;
    if (!result.FaceMatches?.length || similarity < minSimilarity) {
      return { ok: false, reason: 'below_threshold' };
    }
    return { ok: true, similarity };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : '';
    if (name === 'InvalidParameterException') return { ok: false, reason: 'no_face' };
    if (name === 'AccessDeniedException' || /not authorized|AccessDenied/i.test(message)) {
      console.error('[people-media] IAM user needs rekognition:CompareFaces', error);
      return { ok: false, reason: 'error' };
    }
    console.error('[people-media] Rekognition compare failed', error);
    return { ok: false, reason: 'error' };
  }
}

async function upsertMatch(input: {
  mediaAssetId: string;
  mediaFaceId: string;
  userId: string;
  similarity: number;
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO media_matches (id, media_asset_id, media_face_id, user_id, similarity)
    VALUES (
      gen_random_uuid(),
      ${input.mediaAssetId}::uuid,
      ${input.mediaFaceId}::uuid,
      ${input.userId}::uuid,
      ${input.similarity}
    )
    ON CONFLICT (media_face_id, user_id)
    DO UPDATE SET similarity = GREATEST(media_matches.similarity, EXCLUDED.similarity)
  `;
}

/** Compare one event photo to consented guest profile photos. Used when FACE_PROVIDER=local. */
export async function matchMediaWithRekognition(input: {
  eventId: string;
  mediaAssetId: string;
  mediaFaceId: string;
  mediaBytes: Buffer;
}): Promise<number> {
  if (!rekognitionClient()) return 0;
  const guests = await prisma.$queryRaw<{ user_id: string; storage_key: string }[]>`
    SELECT ufr.user_id, ufr.storage_key
    FROM user_face_references ufr
    WHERE ufr.consent = true
      AND ufr.revoked_at IS NULL
      AND ufr.storage_key IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM event_guests eg
          WHERE eg.user_id = ufr.user_id AND eg.event_id = ${input.eventId}::uuid
        )
        OR EXISTS (
          SELECT 1 FROM posts p
          WHERE p.user_id = ufr.user_id AND p.event_id = ${input.eventId}::uuid
        )
        OR EXISTS (
          SELECT 1 FROM media_assets ma
          WHERE ma.uploaded_by = ufr.user_id AND ma.event_id = ${input.eventId}::uuid
        )
      )
    LIMIT 25
  `;
  const minSimilarity = rekognitionMediaMinSimilarity();
  let matched = 0;
  for (const guest of guests) {
    let source: Buffer;
    try {
      source = (await readStoredMedia(guest.storage_key)).bytes;
    } catch (error) {
      console.error('[people-media] guest reference could not be read', guest.user_id, error);
      continue;
    }
    const compared = await compareFacePhotos(source, input.mediaBytes, minSimilarity);
    if (!compared.ok) continue;
    await upsertMatch({
      mediaAssetId: input.mediaAssetId,
      mediaFaceId: input.mediaFaceId,
      userId: guest.user_id,
      similarity: compared.similarity / 100,
    });
    matched += 1;
  }
  return matched;
}

/** Compare one enrolled profile to ready event photos for that guest. */
export async function matchUserWithRekognition(input: {
  userId: string;
  referenceBytes: Buffer;
}): Promise<number> {
  if (!rekognitionClient()) return 0;
  const rows = await prisma.$queryRaw<{ media_asset_id: string; media_face_id: string; storage_key: string }[]>`
    SELECT ma.id AS media_asset_id,
           mf.id AS media_face_id,
           ma.storage_key
    FROM media_faces mf
    JOIN media_assets ma ON ma.id = mf.media_asset_id
    WHERE ma.processing_status = 'ready'
      AND mf.face_index = 0
      AND (
        EXISTS (
          SELECT 1 FROM event_guests eg
          WHERE eg.event_id = ma.event_id AND eg.user_id = ${input.userId}::uuid
        )
        OR EXISTS (
          SELECT 1 FROM posts p
          WHERE p.event_id = ma.event_id AND p.user_id = ${input.userId}::uuid
        )
        OR ma.uploaded_by = ${input.userId}::uuid
      )
    ORDER BY ma.created_at DESC
    LIMIT 25
  `;
  const minSimilarity = rekognitionMediaMinSimilarity();
  let matched = 0;
  for (const row of rows) {
    let target: Buffer;
    try {
      target = (await readStoredMedia(row.storage_key)).bytes;
    } catch (error) {
      console.error('[people-media] media could not be read', row.media_asset_id, error);
      continue;
    }
    const compared = await compareFacePhotos(input.referenceBytes, target, minSimilarity);
    if (!compared.ok) continue;
    await upsertMatch({
      mediaAssetId: row.media_asset_id,
      mediaFaceId: row.media_face_id,
      userId: input.userId,
      similarity: compared.similarity / 100,
    });
    matched += 1;
  }
  return matched;
}
