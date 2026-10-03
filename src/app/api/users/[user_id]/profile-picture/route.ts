import { NextRequest } from 'next/server';
import { parseParams, userIdPathSchema } from '@/lib/validations';
import { badRequest, notFound, ok, serverError } from '@/lib/api-response';
import { getMediaKind, saveUploadedFile, validateMediaFile } from '@/lib/upload';
import { updateUser } from '@/server/users';

/** Increase body size allowance for profile image uploads. */
export const maxDuration = 30;

/**
 * POST /api/users/[user_id]/profile-picture
 * Uploads and updates only the user's profile picture (avatar_url).
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

    const projectRoot = process.cwd();
    const { relativeUrl } = await saveUploadedFile(file, 'image', projectRoot, { prefix: 'profile-pictures' });

    const user = await updateUser(path.user_id, { avatar_url: relativeUrl });
    if (!user) return notFound('User not found');

    return ok({
      message: 'Profile picture updated',
      data: {
        user_id: user.id,
        avatar_url: user.avatar_url,
      },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to upload profile picture');
  }
}
