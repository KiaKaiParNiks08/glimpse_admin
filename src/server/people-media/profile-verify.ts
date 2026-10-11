import prisma from '@/server/prisma';
import {
  compareFacePhotos,
  rekognitionClient,
  rekognitionProfileMinSimilarity,
} from './rekognition';
import { readStoredMedia } from './storage';

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
  if (!rekognitionClient()) return { ok: true, first: false };

  let stored: Buffer;
  try {
    stored = (await readStoredMedia(storageKey)).bytes;
  } catch (error) {
    console.error('[profile-face] stored reference could not be read', error);
    return { ok: true, first: false };
  }

  const compared = await compareFacePhotos(stored, nextBytes, rekognitionProfileMinSimilarity());
  if (compared.ok) return { ok: true, first: false };
  if (compared.reason === 'too_large') {
    return { ok: false, message: 'Use a profile photo under 5 MB so the face can be checked.' };
  }
  if (compared.reason === 'no_face') {
    return {
      ok: false,
      message: 'A clear face is required. This photo was not used as the profile picture.',
    };
  }
  if (compared.reason === 'below_threshold') {
    return {
      ok: false,
      message:
        'This photo is a different person from the profile picture first uploaded for this mobile number. The picture was not changed.',
    };
  }
  return { ok: true, first: false };
}
