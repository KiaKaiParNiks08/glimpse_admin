import prisma from '@/server/prisma';
import {
  compareFacePhotos,
  detectSingleProfileFace,
  rekognitionClient,
  rekognitionProfileUpdateMinSimilarity,
} from './rekognition';
import { readStoredMedia } from './storage';

export type ProfileFaceCheck =
  | { ok: true; first: boolean }
  | { ok: false; message: string };

const DIFFERENT_PERSON =
  'This photo is a different person from the profile picture first uploaded for this mobile number. The picture was not changed.';
const NEED_ONE_FACE = 'Use a photo that shows only your face. This photo was not used as the profile picture.';
const COULD_NOT_CHECK = 'We could not confirm this is the same person as your first profile photo. The picture was not changed.';

/**
 * The first profile photo is the person for this account and is not replaced.
 * A later photo must be that same person (new background or style is allowed).
 * Amazon Rekognition CompareFaces does the check.
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
  if (!storageKey) return checkFirstProfileFace(nextBytes);

  const incoming = await detectSingleProfileFace(nextBytes);
  if (incoming === 'too_large') {
    return { ok: false, message: 'Use a profile photo under 5 MB so the face can be checked.' };
  }
  if (incoming === 'many' || incoming === 'none') return { ok: false, message: NEED_ONE_FACE };
  if (incoming === 'unavailable' || incoming === 'error') {
    return { ok: false, message: COULD_NOT_CHECK };
  }

  if (!rekognitionClient()) return { ok: false, message: COULD_NOT_CHECK };

  let stored: Buffer;
  try {
    stored = (await readStoredMedia(storageKey)).bytes;
  } catch (error) {
    console.error('[profile-face] stored reference could not be read', error);
    return { ok: false, message: COULD_NOT_CHECK };
  }

  const minSimilarity = rekognitionProfileUpdateMinSimilarity();
  const compared = await compareFacePhotos(stored, nextBytes, minSimilarity);
  if (compared.ok) return { ok: true, first: false };
  if (compared.reason === 'too_large') {
    return { ok: false, message: 'Use a profile photo under 5 MB so the face can be checked.' };
  }
  if (compared.reason === 'no_face') return { ok: false, message: NEED_ONE_FACE };
  if (compared.reason === 'below_threshold') {
    console.error('[profile-face] same-person check below threshold', minSimilarity);
    return { ok: false, message: DIFFERENT_PERSON };
  }
  return { ok: false, message: COULD_NOT_CHECK };
}

async function checkFirstProfileFace(nextBytes: Buffer): Promise<ProfileFaceCheck> {
  const detected = await detectSingleProfileFace(nextBytes);
  if (detected === 'unavailable') return { ok: true, first: true };
  if (detected === 'one') return { ok: true, first: true };
  if (detected === 'too_large') {
    return { ok: false, message: 'Use a profile photo under 5 MB so the face can be checked.' };
  }
  if (detected === 'many' || detected === 'none') return { ok: false, message: NEED_ONE_FACE };
  return { ok: true, first: true };
}
