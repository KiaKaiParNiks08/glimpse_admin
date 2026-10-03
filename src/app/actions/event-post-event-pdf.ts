'use server';

import { getAdminSessionFromCookies } from '@/lib/admin-session';
import { generateS3Key, getStoredObjectUrl, putObjectFromBuffer, deleteObjectByKey } from '@/lib/s3-presign';
import { getMediaKind, validateMediaFile } from '@/lib/upload-rules';
import prisma from '@/server/prisma';
import { isEventAdminAssigned } from '@/server/events';

type ResultOk = { ok: true; url: string; originalName: string | null; uploadedAt: string };
type ResultErr = { ok: false; error: string };
export type UploadPostEventPdfResult = ResultOk | ResultErr;
export type RemovePostEventPdfResult = { ok: true } | ResultErr;

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isFileLike(value: unknown): value is File | (Blob & { size: number; type: string; name?: string }) {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.arrayBuffer === 'function' && typeof o.size === 'number' && typeof o.type === 'string' && o.size > 0;
}

async function requireEventWriteAccess(eventId: string) {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false as const, error: 'Not authenticated' };
  if (session.role_name === 'super_admin') return { ok: true as const, session };
  if (session.role_name === 'event_admin') {
    const allowed = await isEventAdminAssigned(eventId, session.id);
    if (!allowed) return { ok: false as const, error: 'Event not found' };
    return { ok: true as const, session };
  }
  return { ok: false as const, error: 'Forbidden' };
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
 * Remove post-event PDF (DB + best-effort S3 delete).
 */
export async function removePostEventPdfAction(eventId: string): Promise<RemovePostEventPdfResult> {
  if (!isUuid(eventId)) return { ok: false, error: 'Invalid event id' };

  const access = await requireEventWriteAccess(eventId);
  if (!access.ok) return { ok: false, error: access.error };

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true, post_event_pdf_key: true },
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
    },
  });

  if (event.post_event_pdf_key) {
    deleteObjectByKey(event.post_event_pdf_key).catch(() => null);
  }

  return { ok: true };
}

