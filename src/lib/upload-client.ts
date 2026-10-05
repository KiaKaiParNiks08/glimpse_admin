/**
 * Client-side image/video upload via server action.
 * File is sent to our server; server uploads to S3. Client never sees S3 URLs or AWS credentials.
 */

import { uploadFileServerAction } from '@/app/actions/upload';
import {
  getMediaKind,
  resolveUploadMime,
  validateMediaFile,
  validateProbedVideoDuration,
  IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE,
} from '@/lib/upload-rules';

export type UploadPrefix =
  | 'uploads'
  | 'venues'
  | 'feed'
  | 'contacts'
  | 'explore'
  | 'events'
  | 'events/current-happening';

export { IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE };

/**
 * Read video duration from a local file (metadata only).
 */
export function probeVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }

    let settled = false;
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(value);
    };

    const timeoutId = window.setTimeout(() => finish(null), VIDEO_PROBE_TIMEOUT_MS);

    video.onloadedmetadata = () => {
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) finish(null);
      else finish(d);
    };
    video.onerror = () => finish(null);

    video.src = url;
    try {
      video.load();
    } catch {
      finish(null);
    }
  });
}

export type UploadPrecheckResult =
  | { ok: true; contentType?: string; videoDurationSec?: number }
  | { ok: false; error: string };

export type UploadPrecheckOk = Extract<UploadPrecheckResult, { ok: true }>;

const VIDEO_PROBE_TIMEOUT_MS = 15_000;

/**
 * Image-only forms (venues, highlights, etc.): type + size, no video.
 */
export async function precheckImageOnlyFile(file: File): Promise<UploadPrecheckResult> {
  const mimeType = (file.type || '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  const kind = getMediaKind(mimeType);
  if (kind !== 'image') {
    return {
      ok: false,
      error: 'Please choose an image file (JPEG, PNG, GIF, or WebP).',
    };
  }
  const sizeErr = validateMediaFile({ type: mimeType, size: file.size }, 'image');
  if (sizeErr) return { ok: false, error: sizeErr };
  return { ok: true };
}

/**
 * PDF-only uploads: type + size.
 */
export async function precheckPdfOnlyFile(file: File): Promise<UploadPrecheckResult> {
  const mimeType = (file.type || '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  const kind = getMediaKind(mimeType);
  if (kind !== 'pdf') {
    return { ok: false, error: 'Please choose a PDF file.' };
  }
  const sizeErr = validateMediaFile({ type: mimeType, size: file.size }, 'pdf');
  if (sizeErr) return { ok: false, error: sizeErr };
  return { ok: true };
}

/**
 * Validate every file before a batch gallery / multi upload. Fails fast with file name in the message.
 * Returns precheck results so callers can pass them to {@link uploadFile} and avoid a second video probe.
 */
export async function validateMediaFilesForUpload(
  files: File[]
): Promise<{ ok: true; prechecks: UploadPrecheckOk[] } | { ok: false; error: string }> {
  const prechecks: UploadPrecheckOk[] = [];
  for (const file of files) {
    const pre = await precheckUploadFile(file);
    if (!pre.ok) {
      return { ok: false, error: `${file.name}: ${pre.error}` };
    }
    prechecks.push(pre);
  }
  return { ok: true, prechecks };
}

/**
 * Validate type, size, and (for video) duration before upload.
 */
export async function precheckUploadFile(file: File): Promise<UploadPrecheckResult> {
  const mimeType = resolveUploadMime(file.type, file.name);
  const kind = getMediaKind(mimeType);
  if (!kind) {
    return {
      ok: false,
      error:
        'Invalid file type. Use image (JPEG, PNG, GIF, WebP), video (MP4, WebM, MOV), or PDF where allowed.',
    };
  }

  const sizeErr = validateMediaFile({ type: mimeType, size: file.size }, kind);
  if (sizeErr) return { ok: false, error: sizeErr };

  if (kind === 'pdf') {
    return { ok: true, contentType: mimeType };
  }

  if (kind === 'video') {
    const probed = await probeVideoDurationSeconds(file);
    const durErr = validateProbedVideoDuration(probed);
    if (durErr) return { ok: false, error: durErr };
    return { ok: true, contentType: mimeType, videoDurationSec: probed! };
  }

  return { ok: true, contentType: mimeType };
}

/**
 * Upload a file (image or video) via server. Returns the URL to store (opaque token or CloudFront).
 * No S3 or presigned URLs are ever sent to the browser.
 * @param reusePrecheck — from {@link validateMediaFilesForUpload} / {@link precheckUploadFile}; skips a second video metadata probe (avoids hangs/timeouts).
 */
export async function uploadFile(
  file: File,
  prefix: UploadPrefix = 'uploads',
  reusePrecheck?: UploadPrecheckOk
): Promise<string> {
  const pre: UploadPrecheckResult = reusePrecheck ?? (await precheckUploadFile(file));
  if (!pre.ok) {
    throw new Error(pre.error);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('prefix', prefix);
  if (pre.videoDurationSec != null) {
    formData.append('video_duration_sec', String(pre.videoDurationSec));
  }

  const result = await uploadFileServerAction(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.url;
}

/**
 * Upload an image file. Convenience wrapper with prefix 'venues' for venue/form uploads.
 * Use uploadFile(file, 'feed') for feed posts, etc.
 */
export async function uploadImage(file: File, prefix: UploadPrefix = 'venues'): Promise<string> {
  const pre = await precheckImageOnlyFile(file);
  if (!pre.ok) {
    throw new Error(pre.error);
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('prefix', prefix);
  const result = await uploadFileServerAction(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.url;
}

/**
 * Upload a PDF (e-invite, etc.). Client-side type and size checks only.
 */
export async function uploadPdf(file: File, prefix: UploadPrefix = 'events'): Promise<string> {
  const pre = await precheckPdfOnlyFile(file);
  if (!pre.ok) {
    throw new Error(pre.error);
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('prefix', prefix);
  const result = await uploadFileServerAction(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.url;
}
