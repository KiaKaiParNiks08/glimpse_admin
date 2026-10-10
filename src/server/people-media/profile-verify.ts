import { CompareFacesCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import prisma from '@/server/prisma';
import { readStoredMedia } from './storage';

const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;

function minSimilarity(): number {
  const n = Number(process.env.PROFILE_FACE_MIN_SIMILARITY ?? '95');
  if (!Number.isFinite(n) || n < 80 || n > 100) return 95;
  return n;
}

function rekognitionClient(): RekognitionClient | null {
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

export type ProfileFaceCheck =
  | { ok: true; first: boolean }
  | { ok: false; message: string };

/**
 * First profile photo for this account is stored as the face.
 * A later photo must be the same person. Amazon Rekognition CompareFaces does that check.
 * If Rekognition is not configured, the photo is still allowed so existing profile updates keep working.
 */
export async function verifyProfileFace(userId: string, nextBytes: Buffer): Promise<ProfileFaceCheck> {
  let rows: { storage_key: string }[] = [];
  try {
    rows = await prisma.$queryRaw<{ storage_key: string }[]>`
      SELECT storage_key
      FROM user_face_references
      WHERE user_id = ${userId}::uuid
        AND consent = true
        AND revoked_at IS NULL
        AND storage_key IS NOT NULL
      LIMIT 1
    `;
  } catch (error) {
    console.error('[profile-face] reference lookup skipped', error);
    return { ok: true, first: true };
  }
  const storageKey = rows[0]?.storage_key;
  if (!storageKey) return { ok: true, first: true };

  const client = rekognitionClient();
  if (!client) return { ok: true, first: false };

  if (nextBytes.length > REKOGNITION_MAX_BYTES) {
    return { ok: false, message: 'Use a profile photo under 5 MB so the face can be checked.' };
  }

  let stored: Buffer;
  try {
    stored = (await readStoredMedia(storageKey)).bytes;
  } catch (error) {
    console.error('[profile-face] stored reference could not be read', error);
    return { ok: true, first: false };
  }
  if (stored.length > REKOGNITION_MAX_BYTES) return { ok: true, first: false };

  try {
    const result = await client.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: stored },
        TargetImage: { Bytes: nextBytes },
        SimilarityThreshold: minSimilarity(),
      })
    );
    const similarity = result.FaceMatches?.[0]?.Similarity ?? 0;
    if (!result.FaceMatches?.length || similarity < minSimilarity()) {
      return {
        ok: false,
        message:
          'This photo is a different person from the profile picture first uploaded for this mobile number. The picture was not changed.',
      };
    }
    return { ok: true, first: false };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'InvalidParameterException') {
      return {
        ok: false,
        message: 'A clear face is required. This photo was not used as the profile picture.',
      };
    }
    console.error('[profile-face] compare failed', error);
    return { ok: true, first: false };
  }
}
