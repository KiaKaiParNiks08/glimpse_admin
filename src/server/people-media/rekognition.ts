import { CompareFacesCommand, DetectFacesCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { FACE_EMBEDDING_DIM, rekognitionDetectMinConfidence } from './config';
import { toVectorLiteral } from './match';
import {
  GALLERY_ALGORITHM_VERSION,
  MATCH_SOURCE,
  imageFaceEvidence,
  videoThumbnailEvidence,
} from './recognition-policy';
import { readStoredMedia } from './storage';
import { RekognitionJobError, classifyRekognitionError } from './rekognition-errors';
import { isRekognitionSupportedImage, sniffImageKind } from './rekognition-image';

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

/** Gallery discovery (default 90). Profile lock stays on PROFILE_FACE_MIN_SIMILARITY. */
export function rekognitionMediaMinSimilarity(): number {
  const n = Number(process.env.FACE_REKOGNITION_MIN_SIMILARITY ?? '90');
  if (!Number.isFinite(n) || n < 70 || n > 100) return 90;
  return n;
}

export function rekognitionProfileMinSimilarity(): number {
  const n = Number(process.env.PROFILE_FACE_MIN_SIMILARITY ?? '95');
  if (!Number.isFinite(n) || n < 80 || n > 100) return 95;
  return n;
}

/** Later profile photos of the same person (new background/style). Lower than the first-photo lock. */
export function rekognitionProfileUpdateMinSimilarity(): number {
  const n = Number(process.env.PROFILE_FACE_UPDATE_MIN_SIMILARITY ?? '90');
  if (!Number.isFinite(n) || n < 70 || n > 100) return 90;
  return n;
}

export type FaceCompareResult =
  | {
      ok: true;
      similarity: number;
      boundingBox?: { width?: number; height?: number; left?: number; top?: number };
    }
  | { ok: false; reason: 'no_face' | 'below_threshold' | 'too_large' | 'unavailable' | 'error' | 'throttled' };

export type DetectedRekognitionFace = {
  confidence: number;
  box: { width: number; height: number; left: number; top: number };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottleError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  return (
    name === 'ProvisionedThroughputExceededException' ||
    name === 'ThrottlingException' ||
    /Rate exceeded|Too many requests/i.test(message)
  );
}

export type DetectFacesContext = {
  job_id?: string;
  job_kind?: 'media' | 'reference' | 'scan' | 'profile';
};

export type DetectFacesOutcome =
  | { ok: true; faces: DetectedRekognitionFace[]; byte_length: number; content_kind: string }
  | {
      ok: false;
      code:
        | 'too_large'
        | 'unavailable'
        | 'unsupported_format'
        | 'rekognition_access_denied'
        | 'rekognition_invalid_credentials'
        | 'rekognition_invalid_image'
        | 'rekognition_throttled'
        | 'rekognition_error';
      permanent: boolean;
      byte_length: number;
      content_kind: string;
    };

function logRekognitionFailure(
  operation: string,
  error: unknown,
  extra: Record<string, unknown>
): ReturnType<typeof classifyRekognitionError> {
  const classified = classifyRekognitionError(error);
  console.error(
    `[people-media] Rekognition ${operation} failed`,
    JSON.stringify({
      kind: classified.kind,
      name: classified.name,
      http_status: classified.http_status,
      request_id: classified.request_id,
      region: classified.region,
      permanent: classified.permanent,
      message: classified.message,
      ...extra,
    })
  );
  return classified;
}

export function detectFacesOutcomeToError(outcome: Extract<DetectFacesOutcome, { ok: false }>): Error {
  if (outcome.code === 'unavailable') {
    return new RekognitionJobError('unavailable', 'missing_config', true, 'Rekognition is not configured');
  }
  if (outcome.code === 'too_large') {
    return new RekognitionJobError(outcome.code, 'invalid_image', true, 'Image is larger than Rekognition allows');
  }
  if (outcome.code === 'unsupported_format') {
    return new RekognitionJobError(
      outcome.code,
      'unsupported_format',
      true,
      `Rekognition Image.Bytes requires JPEG or PNG (got ${outcome.content_kind})`
    );
  }
  const kind =
    outcome.code === 'rekognition_access_denied'
      ? 'access_denied'
      : outcome.code === 'rekognition_invalid_credentials'
        ? 'invalid_credentials'
        : outcome.code === 'rekognition_throttled'
          ? 'throttled'
          : outcome.code === 'rekognition_invalid_image'
            ? 'invalid_image'
            : 'unknown';
  return new RekognitionJobError(outcome.code, kind, outcome.permanent, outcome.code);
}

/** First profile photo must contain exactly one face so that face stays the account. */
export async function detectSingleProfileFace(
  bytes: Buffer
): Promise<'one' | 'none' | 'many' | 'too_large' | 'unavailable' | 'error'> {
  const outcome = await detectRekognitionFaces(bytes, { job_kind: 'profile' });
  if (!outcome.ok) {
    if (outcome.code === 'too_large') return 'too_large';
    if (outcome.code === 'unavailable') return 'unavailable';
    return 'error';
  }
  if (outcome.faces.length === 1) return 'one';
  if (outcome.faces.length === 0) return 'none';
  return 'many';
}

export async function detectRekognitionFaces(
  bytes: Buffer,
  context: DetectFacesContext = {}
): Promise<DetectFacesOutcome> {
  const content_kind = sniffImageKind(bytes);
  const byte_length = bytes.length;
  const client = rekognitionClient();
  if (!client) {
    return { ok: false, code: 'unavailable', permanent: true, byte_length, content_kind };
  }
  if (byte_length > REKOGNITION_MAX_BYTES) {
    return { ok: false, code: 'too_large', permanent: true, byte_length, content_kind };
  }
  if (!isRekognitionSupportedImage(content_kind)) {
    console.error(
      '[people-media] Rekognition DetectFaces skipped unsupported bytes',
      JSON.stringify({
        job_id: context.job_id ?? null,
        job_kind: context.job_kind ?? null,
        retrieved: true,
        byte_length,
        content_kind,
        region: process.env.AWS_REGION?.trim() ?? null,
      })
    );
    return { ok: false, code: 'unsupported_format', permanent: true, byte_length, content_kind };
  }
  const minConfidence = rekognitionDetectMinConfidence();
  try {
    const result = await client.send(
      new DetectFacesCommand({
        Image: { Bytes: new Uint8Array(bytes) },
        Attributes: ['DEFAULT'],
      })
    );
    const details = result.FaceDetails ?? [];
    const faces = details
      .filter((face) => (face.Confidence ?? 0) >= minConfidence && face.BoundingBox)
      .map((face) => ({
        confidence: face.Confidence ?? 0,
        box: {
          width: face.BoundingBox?.Width ?? 0,
          height: face.BoundingBox?.Height ?? 0,
          left: face.BoundingBox?.Left ?? 0,
          top: face.BoundingBox?.Top ?? 0,
        },
      }));
    return { ok: true, faces, byte_length, content_kind };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'InvalidParameterException') {
      return { ok: true, faces: [], byte_length, content_kind };
    }
    const classified = logRekognitionFailure('DetectFaces', error, {
      job_id: context.job_id ?? null,
      job_kind: context.job_kind ?? null,
      retrieved: true,
      byte_length,
      content_kind,
    });
    const mapped: Extract<DetectFacesOutcome, { ok: false }>['code'] =
      classified.kind === 'access_denied'
        ? 'rekognition_access_denied'
        : classified.kind === 'invalid_credentials'
          ? 'rekognition_invalid_credentials'
          : classified.kind === 'invalid_image'
            ? 'rekognition_invalid_image'
            : classified.kind === 'unsupported_format'
              ? 'unsupported_format'
              : classified.kind === 'throttled'
                ? 'rekognition_throttled'
                : classified.kind === 'missing_config'
                  ? 'unavailable'
                  : 'rekognition_error';
    return {
      ok: false,
      code: mapped,
      permanent: classified.permanent,
      byte_length,
      content_kind,
    };
  }
}

/**
 * Compare two face photos. Source is the enrolled profile; target is the post or gallery image.
 * CompareFaces searches every detected face in the target, which covers group photographs.
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: new Uint8Array(sourceBytes) },
          TargetImage: { Bytes: new Uint8Array(targetBytes) },
          SimilarityThreshold: Math.min(minSimilarity, 80),
        })
      );
      const best = result.FaceMatches?.[0];
      const similarity = best?.Similarity ?? 0;
      if (!result.FaceMatches?.length || similarity < minSimilarity) {
        return { ok: false, reason: 'below_threshold' };
      }
      return {
        ok: true,
        similarity,
        boundingBox: best?.Face?.BoundingBox
          ? {
              width: best.Face.BoundingBox.Width,
              height: best.Face.BoundingBox.Height,
              left: best.Face.BoundingBox.Left,
              top: best.Face.BoundingBox.Top,
            }
          : undefined,
      };
    } catch (error) {
      lastError = error;
      const name = error instanceof Error ? error.name : '';
      if (name === 'InvalidParameterException') return { ok: false, reason: 'no_face' };
      if (isThrottleError(error)) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
      logRekognitionFailure('CompareFaces', error, {});
      return { ok: false, reason: 'error' };
    }
  }
  if (isThrottleError(lastError)) return { ok: false, reason: 'throttled' };
  return { ok: false, reason: 'error' };
}

const PLACEHOLDER_BOX = JSON.stringify({ x: 0, y: 0, width: 1, height: 1 });

function placeholderEmbedding(): number[] {
  const values = new Array<number>(FACE_EMBEDDING_DIM).fill(0);
  values[0] = 1;
  return values;
}

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

export async function upsertRekognitionMatch(input: {
  mediaAssetId: string;
  mediaFaceId: string;
  userId: string;
  similarity: number;
  referenceSha256?: string | null;
  evidence?: unknown;
}): Promise<void> {
  const evidence = input.evidence == null ? null : JSON.stringify(input.evidence);
  await prisma.$executeRaw`
    INSERT INTO media_matches (
      id, media_asset_id, media_face_id, user_id, similarity,
      match_source, algorithm_version, evidence, reference_sha256
    )
    VALUES (
      gen_random_uuid(),
      ${input.mediaAssetId}::uuid,
      ${input.mediaFaceId}::uuid,
      ${input.userId}::uuid,
      ${input.similarity},
      ${MATCH_SOURCE.rekognition},
      ${GALLERY_ALGORITHM_VERSION},
      ${evidence}::jsonb,
      ${input.referenceSha256 ?? null}
    )
    ON CONFLICT (media_asset_id, user_id)
    DO UPDATE SET
      similarity = GREATEST(media_matches.similarity, EXCLUDED.similarity),
      media_face_id = EXCLUDED.media_face_id,
      match_source = EXCLUDED.match_source,
      algorithm_version = EXCLUDED.algorithm_version,
      evidence = COALESCE(EXCLUDED.evidence, media_matches.evidence),
      reference_sha256 = COALESCE(EXCLUDED.reference_sha256, media_matches.reference_sha256)
  `;
}

export async function compareReferenceToAsset(input: {
  referenceBytes: Buffer;
  targetBytes: Buffer;
  mediaType: 'image' | 'video';
  jobId?: string;
}): Promise<FaceCompareResult> {
  const detected = await detectRekognitionFaces(input.targetBytes, { job_id: input.jobId, job_kind: 'scan' });
  if (!detected.ok) {
    throw detectFacesOutcomeToError(detected);
  }
  if (detected.faces.length === 0) return { ok: false, reason: 'no_face' };
  const compared = await compareFacePhotos(
    input.referenceBytes,
    input.targetBytes,
    rekognitionMediaMinSimilarity()
  );
  if (!compared.ok && (compared.reason === 'error' || compared.reason === 'unavailable' || compared.reason === 'throttled')) {
    throw new RekognitionJobError(
      `rekognition_${compared.reason}`,
      compared.reason === 'throttled' ? 'throttled' : compared.reason === 'unavailable' ? 'missing_config' : 'unknown',
      compared.reason === 'unavailable',
      compared.reason
    );
  }
  return compared;
}

export function evidenceForCompare(
  mediaType: 'image' | 'video',
  compared: Extract<FaceCompareResult, { ok: true }>
): unknown {
  if (mediaType === 'video') return videoThumbnailEvidence();
  return imageFaceEvidence(compared.boundingBox);
}
