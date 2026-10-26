import { NextRequest } from 'next/server';
import { parseParams, userIdPathSchema, uuidSchema } from '@/lib/validations';
import { badRequest, forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { getMediaKind, resolveUploadMime, saveUploadedBuffer, validateMediaFile } from '@/lib/upload';
import { isEventGuest } from '@/server/event-guests';
import { enrollStoredFaceReference, queueExistingFaceReference } from '@/server/people-media/face-reference';
import { verifyProfileFace } from '@/server/people-media/profile-verify';
import { overlayEventProfile, upsertUserEventProfile } from '@/server/user-event-profiles';
import { getUserById, updateUser } from '@/server/users';

/** Profile upload also enrolls the face reference and runs matching. */
export const maxDuration = 60;

/**
 * POST /api/users/[user_id]/profile-picture
 * First photo with one face becomes the account person. Later photos must be that person.
 * Body: multipart/form-data with field "file" and event_id for the event profile photo.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ user_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, userIdPathSchema);
    if (pathErr) return pathErr;

    const formData = await request.formData();
    const file = formData.get('file');
    const tokenUser = getUserFromAuthorizationHeader(request);
    if (tokenUser && tokenUser.id !== path.user_id) {
      return forbidden('You can only update your own profile picture');
    }

    const eventIdRaw = typeof formData.get('event_id') === 'string' ? String(formData.get('event_id')).trim() : '';
    const eventIdParsed = eventIdRaw ? uuidSchema.safeParse(eventIdRaw) : null;
    if (eventIdRaw && !eventIdParsed?.success) {
      return badRequest('event_id must be a UUID');
    }
    const event_id = eventIdParsed?.success ? eventIdParsed.data : tokenUser?.event_id;
    if (event_id) {
      const guest = await isEventGuest(event_id, path.user_id);
      if (!guest) return forbidden('User is not a guest of this event');
    }

    if (!file || !(file instanceof File) || file.size === 0) {
      return badRequest('No image file provided. Send a file in the "file" field.');
    }

    const kind = getMediaKind(file.type);
    if (kind !== 'image') {
      return badRequest('File must be an image (JPEG, PNG, GIF, WebP).');
    }

    const validationError = validateMediaFile(file, 'image');
    if (validationError) {
      return badRequest(validationError);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) return badRequest('The image did not finish uploading. Please try again.');

    const faceCheck = await verifyProfileFace(path.user_id, bytes);
    if (!faceCheck.ok) return badRequest(faceCheck.message);

    const mime = resolveUploadMime(file.type, file.name);
    const saved = await saveUploadedBuffer(bytes, 'image', process.cwd(), {
      prefix: 'profile-pictures',
      contentType: mime || file.type,
      fileName: file.name,
    });

    let user = event_id ? await getUserById(path.user_id) : await updateUser(path.user_id, { avatar_url: saved.relativeUrl });
    if (!user) return notFound('User not found');
    if (event_id) {
      const eventProfile = await upsertUserEventProfile(path.user_id, event_id, {
        avatar_url: saved.relativeUrl,
      });
      user = overlayEventProfile(user, eventProfile);
    }

    let face_reference = null;
    if (faceCheck.first) {
      try {
        face_reference = await enrollStoredFaceReference(user.id, saved.storageKey);
      } catch (error) {
        console.error('[profile-picture] face reference was not enrolled', error);
        face_reference = {
          consent: false,
          processing_status: 'failed',
          last_error: error instanceof Error ? error.message : 'Face reference was not enrolled',
          has_embedding: false,
        };
      }
    } else {
      try {
        face_reference = await queueExistingFaceReference(user.id);
      } catch (error) {
        console.error('[profile-picture] existing face reference was not reused', error);
      }
    }
    return ok(
      {
        user_id: user.id,
        avatar_url: user.avatar_url,
        face_reference,
      },
      'Profile picture updated'
    );
  } catch (e) {
    console.error(e);
    return serverError('Unable to upload profile picture');
  }
}
