'use server';

import { requireAdminContextFromCookies, canContextAccessEvent } from '@/server/access';
import { generateS3Key, getStoredObjectUrl, putObjectFromBuffer, deleteObjectByKey } from '@/lib/s3-presign';
import { getMediaKind, validateMediaFile } from '@/lib/upload-rules';
import prisma from '@/server/prisma';


type ResultOk = { ok: true; url: string; originalName: string | null; uploadedAt: string };
type ResultErr = { ok: false; error: string };
export type UploadPostEventPdfResult = ResultOk | ResultErr;
export type RemovePostEventPdfResult = { ok: true } | ResultErr;
export type UploadPostEventPdfThumbnailResult = { ok: true; url: string } | ResultErr;
export type RemovePostEventPdfThumbnailResult = { ok: true } | ResultErr;

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isFileLike(value: unknown): value is File | (Blob & { size: number; type: string; name?: string }) {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.arrayBuffer === 'function' && typeof o.size === 'number' && typeof o.type === 'string' && o.size > 0;
}

async function requireEventWriteAccess(eventId: string) {
  const auth = await requireAdminContextFromCookies();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (!auth.ctx.hasPermission('report.manage')) {
    return { ok: false as const, error: 'Forbidden: post-event report is disabled for your role or plan' };
  }
  const allowed = await canContextAccessEvent(auth.ctx, eventId);
  if (!allowed) return { ok: false as const, error: 'Event not found' };
  return { ok: true as const, session: auth.ctx };
}

/**
 * Upload a post-event PDF to S3 and store metadata in DB.
 * FormData: file (PDF)
 */
export async function uploadPostEventPdfAction(
  eventId: string,
  formData: FormData
): Promise<UploadPostEventPdfResult> {
  if (!isUuid(eventId)) return { ok: false, error: 'Invalid event id' };

  const access = await requireEventWriteAccess(eventId);
  if (!access.ok) return { ok: false, error: access.error };

  const file = formData.get('file');
  if (!isFileLike(file)) return { ok: false, error: 'No file provided or invalid file' };

  const mimeType = (file.type || '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  const kind = getMediaKind(mimeType);
  if (kind !== 'pdf') return { ok: false, error: 'Please choose a PDF file.' };

  const validationError = validateMediaFile({ type: mimeType, size: file.size }, 'pdf');
  if (validationError) return { ok: false, error: validationError };

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true, post_event_pdf_key: true },
  });
  if (!event) return { ok: false, error: 'Event not found' };

  const originalName =
    typeof (file as unknown as { name?: unknown })?.name === 'string'
      ? ((file as unknown as { name: string }).name || '').slice(0, 500)
      : null;

  try {
    const key = generateS3Key(`events/${eventId}/post-event`, mimeType);
    const buffer = Buffer.from(await file.arrayBuffer());
    await putObjectFromBuffer(key, buffer, mimeType);
    const url = getStoredObjectUrl(key);
    const uploadedAt = new Date();

    await prisma.events.update({
      where: { id: eventId },
      data: {
        post_event_pdf_url: url,
        post_event_pdf_key: key,
        post_event_pdf_original_name: originalName,
        post_event_pdf_size: file.size,
        post_event_pdf_uploaded_by: access.session.id,
        post_event_pdf_uploaded_at: uploadedAt,
      },
    });

    // Best-effort cleanup of previous object if replacing.
    if (event.post_event_pdf_key && event.post_event_pdf_key !== key) {
      deleteObjectByKey(event.post_event_pdf_key).catch(() => null);
    }

    return { ok: true, url, originalName, uploadedAt: uploadedAt.toISOString() };
  } catch (e) {
    console.error('[uploadPostEventPdfAction]', e);
    const message = e instanceof Error ? e.message : 'Upload failed';
    return { ok: false, error: message };
  }
}

/**
 * Upload a thumbnail image for post-event PDF report.
 * FormData: file (JPEG, PNG, WebP, GIF)
 */
export async function uploadPostEventPdfThumbnailAction(
  eventId: string,
  formData: FormData
): Promise<UploadPostEventPdfThumbnailResult> {
  if (!isUuid(eventId)) return { ok: false, error: 'Invalid event id' };

  const access = await requireEventWriteAccess(eventId);
  if (!access.ok) return { ok: false, error: access.error };

  const file = formData.get('file');
  if (!isFileLike(file)) return { ok: false, error: 'No file provided or invalid file' };

  const mimeType = (file.type || '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  const kind = getMediaKind(mimeType);
  if (kind !== 'image') return { ok: false, error: 'Please choose an image file (JPEG, PNG, WebP or GIF).' };

  const validationError = validateMediaFile({ type: mimeType, size: file.size }, 'image');
  if (validationError) return { ok: false, error: validationError };

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true, post_event_pdf_thumbnail_key: true },
  });
  if (!event) return { ok: false, error: 'Event not found' };

  try {
    const key = generateS3Key(`events/${eventId}/post-event/thumbnails`, mimeType);
    const buffer = Buffer.from(await file.arrayBuffer());
    await putObjectFromBuffer(key, buffer, mimeType);
    const url = getStoredObjectUrl(key);

    await prisma.events.update({
      where: { id: eventId },
      data: {
        post_event_pdf_thumbnail_url: url,
        post_event_pdf_thumbnail_key: key,
      },
    });

    if (event.post_event_pdf_thumbnail_key && event.post_event_pdf_thumbnail_key !== key) {
      deleteObjectByKey(event.post_event_pdf_thumbnail_key).catch(() => null);
    }

    return { ok: true, url };
  } catch (e) {
    console.error('[uploadPostEventPdfThumbnailAction]', e);
    const message = e instanceof Error ? e.message : 'Thumbnail upload failed';
    return { ok: false, error: message };
  }
}

/**
 * Remove post-event PDF thumbnail image.
 */
export async function removePostEventPdfThumbnailAction(
  eventId: string
): Promise<RemovePostEventPdfThumbnailResult> {
  if (!isUuid(eventId)) return { ok: false, error: 'Invalid event id' };

  const access = await requireEventWriteAccess(eventId);
  if (!access.ok) return { ok: false, error: access.error };

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true, post_event_pdf_thumbnail_key: true },
  });
  if (!event) return { ok: false, error: 'Event not found' };

  await prisma.events.update({
    where: { id: eventId },
    data: {
      post_event_pdf_thumbnail_url: null,
      post_event_pdf_thumbnail_key: null,
    },
  });

  if (event.post_event_pdf_thumbnail_key) {
    deleteObjectByKey(event.post_event_pdf_thumbnail_key).catch(() => null);
  }

  return { ok: true };
}

/**
 * Remove post-event PDF and its thumbnail (DB + best-effort S3 delete).
 */
export async function removePostEventPdfAction(eventId: string): Promise<RemovePostEventPdfResult> {
  if (!isUuid(eventId)) return { ok: false, error: 'Invalid event id' };

  const access = await requireEventWriteAccess(eventId);
  if (!access.ok) return { ok: false, error: access.error };

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true, post_event_pdf_key: true, post_event_pdf_thumbnail_key: true },
  });
  if (!event) return { ok: false, error: 'Event not found' };

  await prisma.events.update({
    where: { id: eventId },
    data: {
      post_event_pdf_url: null,
      post_event_pdf_key: null,
      post_event_pdf_original_name: null,
      post_event_pdf_size: null,
      post_event_pdf_uploaded_by: null,
      post_event_pdf_uploaded_at: null,
      post_event_pdf_thumbnail_url: null,
      post_event_pdf_thumbnail_key: null,
    },
  });

  if (event.post_event_pdf_key) {
    deleteObjectByKey(event.post_event_pdf_key).catch(() => null);
  }
  if (event.post_event_pdf_thumbnail_key) {
    deleteObjectByKey(event.post_event_pdf_thumbnail_key).catch(() => null);
  }

  return { ok: true };
}
