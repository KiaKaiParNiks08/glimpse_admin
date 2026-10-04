import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { generateS3Key, getStoredObjectUrl, putObjectFromBuffer } from '@/lib/s3-presign';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_MEDIA_TYPES,
} from '@/lib/media-types';
import {
  getMediaKind,
  validateMediaFile,
} from '@/lib/upload-rules';

/** Disk path under public (project/public/uploads). Served at /uploads/... */
const UPLOADS_DISK_DIR = 'public/uploads';
/** URL path prefix (no leading slash). */
const UPLOADS_URL_PREFIX = 'uploads';

export { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, ALLOWED_MEDIA_TYPES };

export {
  getMediaKind,
  validateMediaFile,
  MIN_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MIN_VIDEO_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  MIN_PDF_SIZE_BYTES,
  MAX_PDF_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  MAX_PDF_SIZE_MB,
  MAX_VIDEO_DURATION_SECONDS,
} from '@/lib/upload-rules';

export type MediaKind = import('@/lib/upload-rules').RulesMediaKind;

function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'application/pdf': '.pdf',
  };
  return map[mime] ?? '.bin';
}

function getExtensionFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext || '.bin';
}

export interface SavedMedia {
  media_type: 'image' | 'video';
  media_url: string;
  thumbnail_url?: string;
  media_order: number;
}

function isS3Configured(): boolean {
  return Boolean(process.env.AWS_REGION && process.env.S3_BUCKET);
}

/**
 * Save a single file (from FormData) to project uploads folder.
 * Uses subdir by date (YYYY/MM) and a unique filename.
 * Returns relative URL path (e.g. /uploads/2025/03/uuid.jpg) for use in API responses.
 */
export async function saveUploadedFile(
  file: File,
  kind: MediaKind,
  projectRoot: string,
  options?: { prefix?: string; storage?: 'auto' | 'disk' | 's3' }
): Promise<{ relativeUrl: string; absolutePath: string; storageKey: string }> {
  const prefix = options?.prefix ?? 'uploads';
  const storage = options?.storage ?? 'auto';
  const mimeType = (file.type || '').split(';')[0].trim().toLowerCase();

  const validationError = validateMediaFile({ type: mimeType, size: file.size }, kind);
  if (validationError) {
    throw new Error(validationError);
  }

  if ((storage === 's3' || storage === 'auto') && isS3Configured()) {
    const key = generateS3Key(prefix, mimeType);
    const buffer = Buffer.from(await file.arrayBuffer());
    await putObjectFromBuffer(key, buffer, mimeType);
    const url = getStoredObjectUrl(key);
    return { relativeUrl: url, absolutePath: '', storageKey: key };
  }

  const now = new Date();
  const yearMonth = path.join(
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0')
  );
  const diskSubdir = path.join(UPLOADS_DISK_DIR, yearMonth);
  const dir = path.join(projectRoot, diskSubdir);
  await mkdir(dir, { recursive: true });

  const ext = getExtensionFromMime(mimeType) || getExtensionFromFilename(file.name);
  const basename = `${randomUUID()}${ext}`;
  const filePath = path.join(dir, basename);
  const relativeUrl = `/${path.join(UPLOADS_URL_PREFIX, yearMonth, basename).replace(/\\/g, '/')}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return { relativeUrl, absolutePath: filePath, storageKey: relativeUrl.replace(/^\//, '') };
}
