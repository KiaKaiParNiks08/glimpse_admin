import { NextRequest } from 'next/server';
import { ok, badRequest, serverError } from '@/lib/api-response';
import {
  getMediaKind,
  saveUploadedFile,
  validateMediaFile,
} from '@/lib/upload';

/** Increase body size for image uploads (default 1MB). */
export const maxDuration = 30;

/**
 * POST /api/upload/image
 * Upload a single image. Body: multipart/form-data with field "file".
 * Returns { url: "/uploads/YYYY/MM/uuid.jpg" }.
 */
export async function POST(request: NextRequest) {
  try {
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
    const { relativeUrl } = await saveUploadedFile(file, 'image', projectRoot, { prefix: 'uploads' });
    return ok({ url: relativeUrl });
  } catch (e) {
    console.error(e);
    return serverError('Upload failed');
  }
}
