/**
 * Upload limits and validation (no Node fs — safe for client + server).
 */

/** Allowed MIME types for images */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

/** Allowed MIME types for videos */
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // mov
  'video/x-matroska', // mkv
  'video/3gpp', // 3gp
] as const;

/** Allowed MIME types for PDF documents (e.g. e-invite) */
export const ALLOWED_PDF_TYPES = ['application/pdf'] as const;

export const ALLOWED_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_PDF_TYPES,
] as const;

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

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  pdf: 'application/pdf',
};

/** Filename extension when the client omits a type or sends application/octet-stream. */
export function mimeFromFilename(filename: string): string | null {
  const base = filename.trim().toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return null;
  return EXTENSION_MIME[base.slice(dot + 1)] ?? null;
}

/** Standard file extension from MIME type. */
export function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-matroska': '.mkv',
    'video/3gpp': '.3gp',
    'application/pdf': '.pdf',
  };
  return map[mime] ?? '.bin';
}

/**
 * Declared MIME, or the filename when the phone sends an empty or generic type.
 */
export function resolveUploadMime(type: string, filename: string): string {
  const mime = (type || '').split(';')[0].trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream' && getMediaKind(mime)) return mime;
  return mimeFromFilename(filename) ?? mime;
}

export function getMediaKind(mime: string): RulesMediaKind | null {
  const normalized = (mime || '').split(';')[0].trim().toLowerCase();
  if (ALLOWED_IMAGE_TYPES.includes(normalized as (typeof ALLOWED_IMAGE_TYPES)[number])) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(normalized as (typeof ALLOWED_VIDEO_TYPES)[number])) return 'video';
  if (ALLOWED_PDF_TYPES.includes(normalized as (typeof ALLOWED_PDF_TYPES)[number])) return 'pdf';
  return null;
}

export function validateMediaFile(
  file: { type: string; size: number },
  kind: RulesMediaKind
): string | null {
  const mimeType = (file.type || '').split(';')[0].trim().toLowerCase();
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
  if (probedSeconds < 0.1) {
    return 'Video duration is too short.';
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

export const IMAGE_UPLOAD_LIMITS_NOTE = `JPEG, PNG, GIF, WebP, HEIC, or HEIF — max ${MAX_IMAGE_SIZE_MB} MB per file.`;

export const IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE = `Images: JPEG, PNG, GIF, WebP, HEIC, HEIF — max ${MAX_IMAGE_SIZE_MB} MB. Videos: MP4, WebM, MOV, MKV, 3GP — max ${MAX_VIDEO_SIZE_MB} MB and max ${MAX_VIDEO_DURATION_SECONDS}s length.`;

export const PDF_UPLOAD_LIMITS_NOTE = `PDF only — max ${MAX_PDF_SIZE_MB} MB.`;
