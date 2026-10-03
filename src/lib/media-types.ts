/** Shared media MIME type constants (no side effects). */

/** Allowed MIME types for images */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** Allowed MIME types for videos */
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // mov
] as const;

/** Allowed MIME types for PDF documents (e.g. e-invite) */
export const ALLOWED_PDF_TYPES = ['application/pdf'] as const;

export const ALLOWED_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_PDF_TYPES,
] as const;

