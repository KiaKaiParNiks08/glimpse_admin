'use server';

import {
  generateS3Key,
  getStoredObjectUrl,
  putObjectFromBuffer,
} from '@/lib/s3-presign';
import { getMediaKind, validateMediaFile } from '@/lib/upload';
import { validateDeclaredVideoDuration } from '@/lib/upload-rules';

const ALLOWED_PREFIXES = [
  'uploads',
  'venues',
  'feed',
  'contacts',
  'explore',
  'events',
  'events/current-happening',
] as const;

export type UploadFileResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Server-side upload: client sends file via FormData; server uploads to S3 and returns
 * an opaque URL. Client never sees S3, presigned URLs, or path structure.
 * FormData must include: file (File), and optionally prefix ('venues' | 'uploads' | 'feed' | 'contacts').
 */
function isFileLike(value: unknown): value is File | Blob & { size: number; type: string } {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.arrayBuffer === 'function' &&
    typeof o.size === 'number' &&
    typeof o.type === 'string' &&
    o.size > 0
  );
}

export async function uploadFileServerAction(
  formData: FormData
): Promise<UploadFileResult> {
  const file = formData.get('file');
  if (!isFileLike(file)) {
    return { ok: false, error: 'No file provided or invalid file' };
  }

  const mimeType = (file.type || '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  const kind = getMediaKind(mimeType);
  if (!kind) {
    return {
      ok: false,
      error: 'Invalid file type. Use image (JPEG, PNG, GIF, WebP), video (MP4, WebM, MOV), or PDF.',
    };
  }

  const validationError = validateMediaFile(
    { type: mimeType, size: file.size },
    kind
  );
  if (validationError) {
    return { ok: false, error: validationError };
  }

  if (kind === 'video') {
    const durationErr = validateDeclaredVideoDuration(formData.get('video_duration_sec'));
    if (durationErr) {
      return { ok: false, error: durationErr };
    }
  }

  const rawPrefix = formData.get('prefix');
  const prefix =
    typeof rawPrefix === 'string' && ALLOWED_PREFIXES.includes(rawPrefix as (typeof ALLOWED_PREFIXES)[number])
      ? rawPrefix
      : 'uploads';

  try {
    const key = generateS3Key(prefix, mimeType);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await putObjectFromBuffer(key, buffer, mimeType);
    const url = getStoredObjectUrl(key);
    return { ok: true, url };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed';
    console.error('[uploadFileServerAction]', e);
    if (
      message.startsWith('Invalid content type') ||
      message.startsWith('AWS_') ||
      message.startsWith('S3_') ||
      message.includes('UPLOAD_TOKEN_SECRET')
    ) {
      return { ok: false, error: message };
    }
    return { ok: false, error: message };
  }
}
