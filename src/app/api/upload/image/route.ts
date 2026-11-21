import { NextRequest } from 'next/server';
import { ok, badRequest, serverError, unsupportedMediaType } from '@/lib/api-response';
import {
  getMediaKind,
  resolveUploadMime,
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

    const projectRoot = process.cwd();
    const { relativeUrl } = await saveUploadedFile(file, 'image', projectRoot, {
      prefix: 'uploads',
      contentType: mime,
    });
    return ok({ url: relativeUrl });
  } catch (e) {
    console.error(e);
    return serverError('Upload failed');
  }
}
