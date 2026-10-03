/**
 * Upload limits and validation (no Node fs — safe for client + server).
 */
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_PDF_TYPES,
  ALLOWED_VIDEO_TYPES,
} from '@/lib/media-types';

export const MIN_IMAGE_SIZE_BYTES = 1;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MIN_VIDEO_SIZE_BYTES = 1;
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
export const MIN_PDF_SIZE_BYTES = 1;
export const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;

export const MAX_IMAGE_SIZE_MB = 10;
export const MAX_VIDEO_SIZE_MB = 50;
export const MAX_PDF_SIZE_MB = 15;

/** Maximum playable length for uploaded videos (seconds). */
export const MAX_VIDEO_DURATION_SECONDS = 120;

export type RulesMediaKind = 'image' | 'video' | 'pdf';

export function getMediaKind(mime: string): RulesMediaKind | null {
  const normalized = mime.split(';')[0].trim().toLowerCase();
  if (ALLOWED_IMAGE_TYPES.includes(normalized as (typeof ALLOWED_IMAGE_TYPES)[number])) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(normalized as (typeof ALLOWED_VIDEO_TYPES)[number])) return 'video';
  if (ALLOWED_PDF_TYPES.includes(normalized as (typeof ALLOWED_PDF_TYPES)[number])) return 'pdf';
  return null;
}

export function validateMediaFile(
  file: { type: string; size: number },
  kind: RulesMediaKind
): string | null {
  const mimeType = file.type.split(';')[0].trim().toLowerCase();
  const allowed =
    kind === 'image'
      ? ALLOWED_IMAGE_TYPES
      : kind === 'video'
        ? ALLOWED_VIDEO_TYPES
        : ALLOWED_PDF_TYPES;
  if (!(allowed as readonly string[]).includes(mimeType)) {
    return `Invalid ${kind} type: ${mimeType || '(unknown)'}. Allowed: ${allowed.join(', ')}`;
  }
  const minSize =
    kind === 'image'
      ? MIN_IMAGE_SIZE_BYTES
      : kind === 'video'
        ? MIN_VIDEO_SIZE_BYTES
        : MIN_PDF_SIZE_BYTES;
  const maxSize =
    kind === 'image'
      ? MAX_IMAGE_SIZE_BYTES
      : kind === 'video'
        ? MAX_VIDEO_SIZE_BYTES
        : MAX_PDF_SIZE_BYTES;
  if (file.size < minSize) {
    return `${kind} file is too small or empty.`;
  }
  if (file.size > maxSize) {
    const maxMB =
      kind === 'image' ? MAX_IMAGE_SIZE_MB : kind === 'video' ? MAX_VIDEO_SIZE_MB : MAX_PDF_SIZE_MB;
    return `${kind} file too large. Maximum size: ${maxMB} MB.`;
  }
  return null;
}

/** After probing video metadata in the browser (null = unreadable). */
export function validateProbedVideoDuration(probedSeconds: number | null): string | null {
  if (probedSeconds == null || !Number.isFinite(probedSeconds) || probedSeconds <= 0) {
    return 'Could not read video length. Use MP4, WebM, or MOV, or try another file.';
  }
  if (probedSeconds > MAX_VIDEO_DURATION_SECONDS + 0.05) {
    return `Video must be at most ${MAX_VIDEO_DURATION_SECONDS} seconds (this file is about ${Math.ceil(probedSeconds)}s).`;
  }
  return null;
}

/** Server: validate client-supplied duration for a video upload. */
export function validateDeclaredVideoDuration(raw: unknown): string | null {
  const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    return 'Video duration must be provided for verification. Re-select the file and upload again.';
  }
  if (n > MAX_VIDEO_DURATION_SECONDS + 0.05) {
    return `Video must be at most ${MAX_VIDEO_DURATION_SECONDS} seconds.`;
  }
  return null;
}

export const IMAGE_UPLOAD_LIMITS_NOTE = `JPEG, PNG, GIF, or WebP — max ${MAX_IMAGE_SIZE_MB} MB per file.`;

export const IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE = `Images: JPEG, PNG, GIF, WebP — max ${MAX_IMAGE_SIZE_MB} MB. Videos: MP4, WebM, MOV — max ${MAX_VIDEO_SIZE_MB} MB and max ${MAX_VIDEO_DURATION_SECONDS}s length.`;

export const PDF_UPLOAD_LIMITS_NOTE = `PDF only — max ${MAX_PDF_SIZE_MB} MB.`;
