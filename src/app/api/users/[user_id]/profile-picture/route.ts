import { NextRequest } from 'next/server';
import { parseParams, userIdPathSchema, uuidSchema } from '@/lib/validations';
import { badRequest, forbidden, notFound, ok, serverError, unsupportedMediaType } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { getMediaKind, resolveUploadMime, saveUploadedBuffer, validateMediaFile } from '@/lib/upload';
import { isEventGuest } from '@/server/event-guests';
import { enrollStoredFaceReference } from '@/server/people-media/face-reference';
import { verifyProfileFace } from '@/server/people-media/profile-verify';
import { ensureUserEventScans } from '@/server/people-media/scans';
import { scheduleFaceProcessing } from '@/server/people-media/schedule';
import { sha256Hex } from '@/server/people-media/storage';
import prisma from '@/server/prisma';

/** Profile upload also enrolls the face reference and runs matching. */
export const maxDuration = 60;

/**
 * POST /api/users/[user_id]/profile-picture
 * Global canonical profile photo.
 * First upload: enrolls facial reference.
 * Later uploads: verifies same person against facial reference (403 if mismatch).
 * Body: multipart/form-data with field "file".
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

    const user = await prisma.users.findUnique({
      where: { id: path.user_id },
      select: {
        id: true,
        avatar_url: true,
        is_avatar_locked: true,
        user_face_references: {
          select: {
            id: true,
            consent: true,
            processing_status: true,
            storage_key: true,
          },
        },
      },
    });
    if (!user) return notFound('User not found');

    if (!file || !(file instanceof File) || file.size === 0) {
      return badRequest('No image file provided. Send a file in the "file" field.');
    }

    const mime = resolveUploadMime(file.type, file.name);
    const kind = getMediaKind(mime);
    if (kind !== 'image') {
      return unsupportedMediaType(
        `Unsupported media type: ${mime || file.name || 'unknown'}. File must be an image (JPEG, PNG, GIF, WebP, HEIC, HEIF).`
      );
    }

    const validationError = validateMediaFile({ type: mime, size: file.size }, 'image');
    if (validationError) {
      return badRequest(validationError);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) return badRequest('The image did not finish uploading. Please try again.');

    // Enforce same-person match for re-uploads, or single face check for first upload
    const faceCheck = await verifyProfileFace(user.id, bytes);
    if (!faceCheck.ok) {
      if (
        faceCheck.message.includes('different person') ||
        faceCheck.message.includes('could not confirm')
      ) {
        return forbidden(faceCheck.message);
      }
      return badRequest(faceCheck.message);
    }

    const saved = await saveUploadedBuffer(bytes, 'image', process.cwd(), {
      prefix: 'profile-pictures',
      contentType: mime || file.type,
      fileName: file.name,
    });

    await prisma.users.update({
      where: { id: user.id },
      data: {
        avatar_url: saved.relativeUrl,
        is_avatar_locked: true,
      },
    });

    let face_reference = null;
    if (faceCheck.first) {
      try {
        face_reference = await enrollStoredFaceReference(user.id, saved.storageKey, {
          verifiedSingleFace: true,
        });
        await ensureUserEventScans(user.id, sha256Hex(saved.storageKey));
        await scheduleFaceProcessing();
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
      face_reference = user.user_face_references;
    }

    return ok(
      {
        user_id: user.id,
        avatar_url: saved.relativeUrl,
        can_replace_profile_photo: false,
        face_reference,
      },
      'Profile picture registered'
    );
  } catch (e) {
    console.error(e);
    return serverError('Unable to upload profile picture');
  }
}
