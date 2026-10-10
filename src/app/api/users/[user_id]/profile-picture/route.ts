import { NextRequest } from 'next/server';
import { parseParams, userIdPathSchema } from '@/lib/validations';
import { badRequest, notFound, ok, serverError } from '@/lib/api-response';
import { getMediaKind, saveUploadedFile, validateMediaFile } from '@/lib/upload';
import { enrollFaceReference } from '@/server/people-media/face-reference';
import { verifyProfileFace } from '@/server/people-media/profile-verify';
import { updateUser } from '@/server/users';

/** Profile upload also enrolls the face reference and runs matching. */
export const maxDuration = 60;

/**
 * POST /api/users/[user_id]/profile-picture
 * Uploads the profile picture and uses that same photo as the face reference.
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

    const faceCheck = await verifyProfileFace(path.user_id, Buffer.from(await file.arrayBuffer()));
    if (!faceCheck.ok) return badRequest(faceCheck.message);

    const projectRoot = process.cwd();
    const { relativeUrl } = await saveUploadedFile(file, 'image', projectRoot, { prefix: 'profile-pictures' });

    const user = await updateUser(path.user_id, { avatar_url: relativeUrl });
    if (!user) return notFound('User not found');

    let face_reference = null;
    try {
      face_reference = await enrollFaceReference(user.id, file);
    } catch (error) {
      console.error('[profile-picture] face reference was not enrolled', error);
    }

    return ok({
      message: 'Profile picture updated',
      data: {
        user_id: user.id,
        avatar_url: user.avatar_url,
        face_reference,
      },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to upload profile picture');
  }
}
