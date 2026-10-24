import { CompareFacesCommand, DetectFacesCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { FACE_EMBEDDING_DIM } from './config';
import { toVectorLiteral } from './match';
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

/** First profile photo must contain exactly one face so that face stays the account. */
export async function detectSingleProfileFace(
  bytes: Buffer
): Promise<'one' | 'none' | 'many' | 'too_large' | 'unavailable' | 'error'> {
  const client = rekognitionClient();
  if (!client) return 'unavailable';
  if (bytes.length > REKOGNITION_MAX_BYTES) return 'too_large';
  try {
    const result = await client.send(
      new DetectFacesCommand({
        Image: { Bytes: new Uint8Array(bytes) },
        Attributes: ['DEFAULT'],
      })
    );
    const count = result.FaceDetails?.length ?? 0;
    if (count === 1) return 'one';
    if (count === 0) return 'none';
    return 'many';
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'InvalidParameterException') return 'none';
    console.error('[people-media] Rekognition detect faces failed', error);
    return 'error';
  }
}

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

const PLACEHOLDER_BOX = JSON.stringify({ x: 0, y: 0, width: 1, height: 1 });

function placeholderEmbedding(): number[] {
  const values = new Array<number>(FACE_EMBEDDING_DIM).fill(0);
  values[0] = 1;
  return values;
}

/** Rekognition matches need a media_faces row even when local embeddings never inserted one. */
export async function ensureMediaFace(mediaAssetId: string): Promise<string | null> {
  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM media_faces
    WHERE media_asset_id = ${mediaAssetId}::uuid AND face_index = 0
    LIMIT 1
  `;
  if (existing[0]?.id) return existing[0].id;

  try {
    const vectorSql = Prisma.raw(`'${toVectorLiteral(placeholderEmbedding())}'::vector`);
    const inserted = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO media_faces (id, media_asset_id, face_index, confidence, box, embedding)
      VALUES (
        gen_random_uuid(),
        ${mediaAssetId}::uuid,
        0,
        1,
        ${PLACEHOLDER_BOX}::jsonb,
        ${vectorSql}
      )
      ON CONFLICT (media_asset_id, face_index) DO UPDATE SET confidence = media_faces.confidence
      RETURNING id
    `;
    if (inserted[0]?.id) return inserted[0].id;
  } catch (error) {
    console.error('[people-media] vector placeholder face failed, trying jsonb', error);
  }

  try {
    const inserted = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO media_faces (id, media_asset_id, face_index, confidence, box, embedding)
      VALUES (
        gen_random_uuid(),
        ${mediaAssetId}::uuid,
        0,
        1,
        ${PLACEHOLDER_BOX}::jsonb,
        ${JSON.stringify(placeholderEmbedding())}::jsonb
      )
      ON CONFLICT (media_asset_id, face_index) DO UPDATE SET confidence = media_faces.confidence
      RETURNING id
    `;
    return inserted[0]?.id ?? null;
  } catch (error) {
    console.error('[people-media] placeholder face insert failed', mediaAssetId, error);
    return null;
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

export async function recordUploaderMatch(
  mediaAssetId: string,
  mediaFaceId: string,
  userId: string
): Promise<void> {
  await upsertMatch({ mediaAssetId, mediaFaceId, userId, similarity: 1 });
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

/** Compare one enrolled profile to event photos. Does not require media_faces to already exist. */
export async function matchUserWithRekognition(input: {
  userId: string;
  referenceBytes: Buffer;
  eventId?: string;
}): Promise<number> {
  if (!rekognitionClient()) return 0;
  const eventId = input.eventId ?? null;
  const rows = await prisma.$queryRaw<{ media_asset_id: string; storage_key: string }[]>`
    SELECT ma.id AS media_asset_id, ma.storage_key
    FROM media_assets ma
    WHERE ma.media_type = 'image'
      AND (${eventId}::uuid IS NULL OR ma.event_id = ${eventId}::uuid)
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
    LIMIT 50
  `;
  const minSimilarity = rekognitionMediaMinSimilarity();
  let matched = 0;
  for (const row of rows) {
    const mediaFaceId = await ensureMediaFace(row.media_asset_id);
    if (!mediaFaceId) continue;
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
      mediaFaceId,
      userId: input.userId,
      similarity: compared.similarity / 100,
    });
    matched += 1;
  }
  return matched;
}

/** Compare an already-ready profile to this event's photos. Used when GET my-media is empty. */
export async function rematchUserEventMedia(userId: string, eventId: string): Promise<number> {
  if (!rekognitionClient()) {
    console.error('[people-media] Rekognition is not configured; my-media will stay empty');
    return 0;
  }
  const rows = await prisma.$queryRaw<{ storage_key: string }[]>`
    SELECT storage_key
    FROM user_face_references
    WHERE user_id = ${userId}::uuid
      AND consent = true
      AND revoked_at IS NULL
      AND storage_key IS NOT NULL
    LIMIT 1
  `;
  const key = rows[0]?.storage_key;
  if (!key) return 0;
  const stored = await readStoredMedia(key);
  return matchUserWithRekognition({ userId, referenceBytes: stored.bytes, eventId });
}
