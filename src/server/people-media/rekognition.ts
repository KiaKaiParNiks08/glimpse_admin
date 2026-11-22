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
import {
  extractFaceCrop,
  isRekognitionSupportedImage,
  normalizeImageForRekognition,
  sniffImageKind,
} from './rekognition-image';
import type { DetectedFace } from './types';

const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;

let cachedRekognitionClient: RekognitionClient | null = null;
let cachedRekognitionSignature = '';

export function rekognitionClient(): RekognitionClient | null {
  const region = process.env.AWS_REGION?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? '';
  if (!region || !accessKeyId || !secretAccessKey) return null;
  const sig = `${region}:${accessKeyId}`;
  if (cachedRekognitionClient && cachedRekognitionSignature === sig) {
    return cachedRekognitionClient;
  }
  cachedRekognitionSignature = sig;
  cachedRekognitionClient = new RekognitionClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  return cachedRekognitionClient;
}

/** Gallery discovery threshold (default 75). Profile lock stays on PROFILE_FACE_MIN_SIMILARITY. */
export function rekognitionMediaMinSimilarity(): number {
  const n = Number(process.env.FACE_REKOGNITION_MIN_SIMILARITY ?? '75');
  if (!Number.isFinite(n) || n < 50 || n > 100) return 75;
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
  const normalized = await normalizeImageForRekognition(bytes);
  const outcome = await detectRekognitionFaces(normalized.bytes, { job_kind: 'profile' });
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
  const normalized = await normalizeImageForRekognition(bytes);
  const content_kind = normalized.kind;
  const processedBytes = normalized.bytes;
  const byte_length = processedBytes.length;

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
        Image: { Bytes: new Uint8Array(processedBytes) },
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

  const normSource = await normalizeImageForRekognition(sourceBytes);
  const normTarget = await normalizeImageForRekognition(targetBytes);

  if (normSource.bytes.length > REKOGNITION_MAX_BYTES || normTarget.bytes.length > REKOGNITION_MAX_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: new Uint8Array(normSource.bytes) },
          TargetImage: { Bytes: new Uint8Array(normTarget.bytes) },
          SimilarityThreshold: Math.min(minSimilarity, 70),
        })
      );
      const matches = result.FaceMatches ?? [];
      const best = matches[0];
      const similarity = best?.Similarity ?? 0;
      if (!matches.length || similarity < minSimilarity) {
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

export async function insertMediaFace(
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

export async function ensureMediaFace(
  mediaAssetId: string,
  box?: { left?: number; top?: number; width?: number; height?: number }
): Promise<string | null> {
  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM media_faces
    WHERE media_asset_id = ${mediaAssetId}::uuid AND face_index = 0
    LIMIT 1
  `;
  if (existing[0]?.id) return existing[0].id;

  const boxJson = box
    ? JSON.stringify({
        x: box.left ?? 0,
        y: box.top ?? 0,
        width: box.width ?? 1,
        height: box.height ?? 1,
      })
    : PLACEHOLDER_BOX;

  try {
    const vectorSql = Prisma.raw(`'${toVectorLiteral(placeholderEmbedding())}'::vector`);
    const inserted = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO media_faces (id, media_asset_id, face_index, confidence, box, embedding)
      VALUES (
        gen_random_uuid(),
        ${mediaAssetId}::uuid,
        0,
        1,
        ${boxJson}::jsonb,
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
        ${boxJson}::jsonb,
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

export async function findClosestMediaFaceId(
  mediaAssetId: string,
  box?: { left?: number; top?: number; width?: number; height?: number }
): Promise<string | null> {
  const faces = await prisma.$queryRaw<{ id: string; box: unknown }[]>`
    SELECT id, box FROM media_faces
    WHERE media_asset_id = ${mediaAssetId}::uuid
    ORDER BY face_index ASC
  `;
  if (faces.length === 0) {
    return ensureMediaFace(mediaAssetId, box);
  }
  if (!box || box.left == null || box.top == null) {
    return faces[0]?.id ?? ensureMediaFace(mediaAssetId, box);
  }

  const targetX = (box.left ?? 0) + (box.width ?? 0) / 2;
  const targetY = (box.top ?? 0) + (box.height ?? 0) / 2;

  let bestFaceId = faces[0].id;
  let minDistance = Infinity;

  for (const f of faces) {
    const b = (typeof f.box === 'string' ? JSON.parse(f.box) : f.box) as {
      x?: number;
      left?: number;
      y?: number;
      top?: number;
      width?: number;
      height?: number;
    } | null;
    if (!b) continue;
    const fX = (b.x ?? b.left ?? 0) + (b.width ?? 0) / 2;
    const fY = (b.y ?? b.top ?? 0) + (b.height ?? 0) / 2;
    const dist = Math.hypot(targetX - fX, targetY - fY);
    if (dist < minDistance) {
      minDistance = dist;
      bestFaceId = f.id;
    }
  }

  return bestFaceId;
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

export type CompareDetailedResult =
  | {
      ok: true;
      similarity: number;
      mediaFaceId: string;
      boundingBox?: { width?: number; height?: number; left?: number; top?: number };
    }
  | {
      ok: false;
      reason: 'no_face' | 'below_threshold' | 'too_large' | 'unavailable' | 'error' | 'throttled';
    };

export async function compareReferenceToAssetDetailed(input: {
  referenceBytes: Buffer;
  targetBytes: Buffer;
  mediaType: 'image' | 'video';
  mediaAssetId: string;
  jobId?: string;
}): Promise<CompareDetailedResult> {
  const minSimilarity = rekognitionMediaMinSimilarity();

  // 1. Attempt full-image comparison first
  const compared = await compareFacePhotos(
    input.referenceBytes,
    input.targetBytes,
    minSimilarity
  );

  if (compared.ok) {
    const mediaFaceId =
      (await findClosestMediaFaceId(input.mediaAssetId, compared.boundingBox)) ??
      (await ensureMediaFace(input.mediaAssetId, compared.boundingBox));
    if (mediaFaceId) {
      return {
        ok: true,
        similarity: compared.similarity,
        mediaFaceId,
        boundingBox: compared.boundingBox,
      };
    }
  }

  if (!compared.ok && (compared.reason === 'error' || compared.reason === 'unavailable' || compared.reason === 'throttled')) {
    throw new RekognitionJobError(
      `rekognition_${compared.reason}`,
      compared.reason === 'throttled' ? 'throttled' : compared.reason === 'unavailable' ? 'missing_config' : 'unknown',
      compared.reason === 'unavailable',
      compared.reason
    );
  }

  // 2. Crop-based fallback for images (handles group photos, distant faces, small faces)
  if (input.mediaType === 'image') {
    let faces = await prisma.$queryRaw<{ id: string; box: unknown; face_index: number }[]>`
      SELECT id, box, face_index FROM media_faces
      WHERE media_asset_id = ${input.mediaAssetId}::uuid
      ORDER BY face_index ASC
      LIMIT 20
    `;

    // If no detected faces are in media_faces yet, detect them on the fly
    if (faces.length === 0) {
      const detectResult = await detectRekognitionFaces(input.targetBytes, {
        job_id: input.jobId,
        job_kind: 'media',
      });
      if (detectResult.ok && detectResult.faces.length > 0) {
        for (let idx = 0; idx < detectResult.faces.length; idx++) {
          const f = detectResult.faces[idx];
          const detected: DetectedFace = {
            confidence: f.confidence,
            box: { x: f.box.left, y: f.box.top, width: f.box.width, height: f.box.height },
            embedding: new Array(FACE_EMBEDDING_DIM).fill(0),
          };
          detected.embedding[0] = 1;
          const insertedId = await insertMediaFace(input.mediaAssetId, idx, detected);
          if (insertedId) {
            faces.push({ id: insertedId, box: detected.box, face_index: idx });
          }
        }
      }
    }

    if (faces.length > 0) {
      for (const face of faces) {
        const rawBox = (typeof face.box === 'string' ? JSON.parse(face.box) : face.box) as {
          x?: number;
          left?: number;
          y?: number;
          top?: number;
          width?: number;
          height?: number;
        } | null;
        if (!rawBox) continue;

        const box = {
          left: rawBox.x ?? rawBox.left ?? 0,
          top: rawBox.y ?? rawBox.top ?? 0,
          width: rawBox.width ?? 0.1,
          height: rawBox.height ?? 0.1,
        };

        const cropBytes = await extractFaceCrop(input.targetBytes, box, 0.20);
        if (!cropBytes) continue;

        const cropCompared = await compareFacePhotos(
          input.referenceBytes,
          cropBytes,
          minSimilarity
        );

        if (cropCompared.ok) {
          return {
            ok: true,
            similarity: cropCompared.similarity,
            mediaFaceId: face.id,
            boundingBox: box,
          };
        }
        if (!cropCompared.ok && (cropCompared.reason === 'error' || cropCompared.reason === 'throttled')) {
          if (cropCompared.reason === 'throttled') {
            throw new RekognitionJobError('rekognition_throttled', 'throttled', false, 'throttled');
          }
        }
      }
    }
  }

  return { ok: false, reason: compared.ok ? 'error' : compared.reason };
}

export async function compareReferenceToAsset(input: {
  referenceBytes: Buffer;
  targetBytes: Buffer;
  mediaType: 'image' | 'video';
  jobId?: string;
}): Promise<FaceCompareResult> {
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
  compared: { boundingBox?: { width?: number; height?: number; left?: number; top?: number } }
): unknown {
  if (mediaType === 'video') return videoThumbnailEvidence();
  return imageFaceEvidence(compared.boundingBox);
}
