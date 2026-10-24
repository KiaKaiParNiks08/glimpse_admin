'use server';

import prisma from '@/server/prisma';
import { getAdminSessionFromCookies } from '@/lib/admin-session';
import { isEventAdminAssigned, getEventById } from '@/server/events';
import { getEventDaysByEventId } from '@/server/event-days';
import { createPresignedUpload } from '@/lib/s3-presign';
import { IncompleteUploadError, saveUploadedFile } from '@/lib/upload';
import {
  getMediaKind,
  resolveUploadMime,
  validateDeclaredVideoDuration,
  validateMediaFile,
} from '@/lib/upload-rules';
import { createEventDayMedia, deleteEventDayMediaById } from '@/server/event-day-media';
import { buildEventWatermark, type EventWatermark } from '@/lib/watermark';
import { isCorporateCategory } from '@/lib/event-categories';
import {
  grantSessionUpload,
  listUploadersForEvent,
  removeSessionUploader,
  type SessionUploader,
} from '@/server/session-uploaders';

type AdminViewer = { id: string; role_name: 'super_admin' | 'event_admin' };

async function requireAdmin(): Promise<{ ok: true; admin: AdminViewer } | { ok: false; error: string }> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  return { ok: true, admin: { id: session.id, role_name: session.role_name } };
}

async function canAccessEvent(eventId: string, viewer: AdminViewer): Promise<boolean> {
  if (viewer.role_name === 'super_admin') return true;
  return isEventAdminAssigned(eventId, viewer.id);
}

function normalizeDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null) {
    const maybe = value as { toNumber?: () => number };
    if (typeof maybe.toNumber === 'function') return maybe.toNumber();
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type GetEventDaysForMediaResult =
  | {
      ok: true;
      event: {
        id: string;
        title: string;
        watermark: EventWatermark | null;
        is_corporate: boolean;
      };
      days: Awaited<ReturnType<typeof getEventDaysByEventId>>;
      uploaders: SessionUploader[];
    }
  | { ok: false; error: string };

async function findEventSession(eventId: string, eventSessionId: string) {
  return prisma.event_sessions.findFirst({
    where: { id: eventSessionId, event_days: { event_id: eventId } },
    select: { id: true, event_day_id: true },
  });
}

export async function getEventDaysForMediaAction(eventId: string): Promise<GetEventDaysForMediaResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const allowed = await canAccessEvent(eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };

  const event = await getEventById(eventId);
  if (!event) return { ok: false, error: 'Event not found' };

  const [days, uploaders] = await Promise.all([
    getEventDaysByEventId(eventId),
    listUploadersForEvent(eventId),
  ]);
  const normalizedDays = days.map((day) => ({
    ...day,
    event_sessions: day.event_sessions.map((session) => ({
      ...session,
      venues: session.venues
        ? {
            ...session.venues,
            latitude: normalizeDecimal(session.venues.latitude),
            longitude: normalizeDecimal(session.venues.longitude),
          }
        : null,
    })),
  }));
  return {
    ok: true,
    event: {
      id: event.id,
      title: event.title,
      watermark: buildEventWatermark(event),
      is_corporate: isCorporateCategory(event.event_categories),
    },
    days: normalizedDays,
    uploaders,
  };
}

export async function addSessionUploaderAction(input: {
  eventId: string;
  all_sessions?: boolean;
  event_session_ids?: string[];
  mobile_number?: string;
  country_code?: string;
  email?: string;
}): Promise<{ ok: true; data: SessionUploader[] } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const allowed = await canAccessEvent(input.eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };
  try {
    const data = await grantSessionUpload({
      eventId: input.eventId,
      allSessions: input.all_sessions === true,
      eventSessionIds: input.event_session_ids,
      mobile_number: input.mobile_number,
      country_code: input.country_code,
      email: input.email,
    });
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'SESSION_NOT_FOUND') return { ok: false, error: 'Session not found' };
    if (message === 'SESSION_REQUIRED') return { ok: false, error: 'Choose at least one session' };
    if (message === 'CONTACT_REQUIRED') return { ok: false, error: 'Enter a mobile number or email' };
    if (message === 'INVALID_EMAIL') return { ok: false, error: 'Enter a valid email' };
    if (message === 'INVALID_MOBILE') return { ok: false, error: 'Enter a valid mobile number' };
    console.error(error);
    return { ok: false, error: 'Unable to add uploader' };
  }
}

export async function removeSessionUploaderAction(input: {
  eventId: string;
  uploaderId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const allowed = await canAccessEvent(input.eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };
  const removed = await removeSessionUploader(input);
  if (!removed) return { ok: false, error: 'Uploader not found' };
  return { ok: true };
}

export type PresignEventDayMediaResult =
  | { ok: true; data: { uploadUrl: string; fileUrl: string; key: string } }
  | { ok: false; error: string };

export async function presignEventDayMediaUploadAction(input: {
  eventId: string;
  eventSessionId: string;
  filename: string;
  contentType: string;
  fileSize: number;
  videoDurationSec?: number;
}): Promise<PresignEventDayMediaResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const allowed = await canAccessEvent(input.eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };

  const session = await findEventSession(input.eventId, input.eventSessionId);
  if (!session) return { ok: false, error: 'Session not found' };

  const mimeType = resolveUploadMime(input.contentType, input.filename);
  const kind = getMediaKind(mimeType);
  if (!kind || kind === 'pdf') {
    return {
      ok: false,
      error: 'Only images (JPEG, PNG, GIF, WebP) or videos (MP4, WebM, MOV) are allowed for day media.',
    };
  }

  const sizeErr = validateMediaFile({ type: mimeType, size: input.fileSize }, kind);
  if (sizeErr) return { ok: false, error: sizeErr };

  if (kind === 'video') {
    const durErr = validateDeclaredVideoDuration(
      input.videoDurationSec != null ? input.videoDurationSec : undefined
    );
    if (durErr) return { ok: false, error: durErr };
  }

  try {
    const prefix = `events/${input.eventId}/sessions/${session.id}`;
    const data = await createPresignedUpload(input.filename, mimeType, prefix);
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Presign failed';
    return { ok: false, error: msg };
  }
}

export type UploadSessionMediaFileResult =
  | { ok: true; data: { media_key: string; media_url: string; media_type: 'image' | 'video' } }
  | { ok: false; error: string };

/**
 * Upload one session image or video through the server, the same path as current-happening.
 * The browser does not PUT to S3. Vercel blocks that direct upload.
 */
export async function uploadSessionMediaFileAction(formData: FormData): Promise<UploadSessionMediaFileResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const eventId = String(formData.get('event_id') ?? '').trim();
  const eventSessionId = String(formData.get('event_session_id') ?? '').trim();
  const allowed = await canAccessEvent(eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };

  const session = await findEventSession(eventId, eventSessionId);
  if (!session) return { ok: false, error: 'Session not found' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, error: 'The media file was missing or did not finish uploading.' };
  }

  const mimeType = resolveUploadMime(file.type, file.name);
  const kind = getMediaKind(mimeType);
  if (kind !== 'image' && kind !== 'video') {
    return { ok: false, error: 'Only images (JPEG, PNG, GIF, WebP) or videos (MP4, WebM, MOV) are allowed.' };
  }

  const sizeErr = validateMediaFile({ type: mimeType, size: file.size }, kind);
  if (sizeErr) return { ok: false, error: sizeErr };
  if (kind === 'video') {
    const durErr = validateDeclaredVideoDuration(formData.get('video_duration_sec'));
    if (durErr) return { ok: false, error: durErr };
  }

  try {
    const saved = await saveUploadedFile(file, kind, process.cwd(), {
      prefix: `events/${eventId}/sessions/${session.id}`,
      contentType: mimeType,
    });
    return {
      ok: true,
      data: { media_key: saved.storageKey, media_url: saved.relativeUrl, media_type: kind },
    };
  } catch (error) {
    if (error instanceof IncompleteUploadError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: error instanceof Error ? error.message : 'Upload failed' };
  }
}

export type CreateEventDayMediaActionResult =
  | { ok: true; data: Awaited<ReturnType<typeof createEventDayMedia>> }
  | { ok: false; error: string };

export async function createEventDayMediaAction(input: {
  eventId: string;
  eventSessionId: string;
  items: Array<{
    media_key: string;
    media_url: string;
    media_type: 'image' | 'video';
    display_order?: number;
  }>;
}): Promise<CreateEventDayMediaActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const allowed = await canAccessEvent(input.eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };

  const session = await findEventSession(input.eventId, input.eventSessionId);
  if (!session) return { ok: false, error: 'Session not found' };

  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: 'No items provided' };
  if (input.items.length > 50) return { ok: false, error: 'Too many items (max 50)' };

  try {
    const created = await createEventDayMedia(
      input.items.map((it, i) => ({
        event_day_id: session.event_day_id,
        event_session_id: session.id,
        media_key: it.media_key,
        media_url: it.media_url,
        media_type: it.media_type,
        display_order: it.display_order ?? i,
        uploaded_by: auth.admin.id,
      }))
    );
    return { ok: true, data: created };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      error: 'The files reached storage but could not be saved on this session. Try the upload again.',
    };
  }
}

export type DeleteEventDayMediaActionResult = { ok: true } | { ok: false; error: string };

export async function deleteEventDayMediaAction(input: {
  eventId: string;
  mediaId: string;
}): Promise<DeleteEventDayMediaActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const allowed = await canAccessEvent(input.eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };

  const media = await prisma.event_day_media.findFirst({
    where: { id: input.mediaId, event_days: { event_id: input.eventId } },
    select: { id: true },
  });
  if (!media) return { ok: false, error: 'Media not found' };

  await deleteEventDayMediaById(input.mediaId);
  return { ok: true };
}

export type DeleteEventDayMediaBulkActionResult =
  | { ok: true; deletedCount: number }
  | { ok: false; error: string };

export async function deleteEventDayMediaBulkAction(input: {
  eventId: string;
  mediaIds: string[];
}): Promise<DeleteEventDayMediaBulkActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const allowed = await canAccessEvent(input.eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };

  const ids = Array.isArray(input.mediaIds)
    ? Array.from(new Set(input.mediaIds.filter((x) => typeof x === 'string' && x.trim()))).slice(0, 200)
    : [];
  if (ids.length === 0) return { ok: false, error: 'No media selected' };

  // Ensure all IDs belong to this event.
  const rows = await prisma.event_day_media.findMany({
    where: {
      id: { in: ids },
      event_days: { event_id: input.eventId },
    },
    select: { id: true },
  });
  if (rows.length !== ids.length) return { ok: false, error: 'Some selected media were not found' };

  // Delete S3 objects + DB rows one-by-one to preserve current delete semantics.
  for (const id of ids) {
    await deleteEventDayMediaById(id);
  }

  return { ok: true, deletedCount: ids.length };
}

function parseSessionTime(value: string | null | undefined): Date | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  const h = Number.parseInt(parts[0] ?? '', 10);
  const m = Number.parseInt(parts[1] ?? '', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error('INVALID_TIME');
  }
  return new Date(Date.UTC(1970, 0, 1, h, m, 0, 0));
}

export async function saveMediaPanelSessionAction(input: {
  eventId: string;
  sessionId?: string | null;
  eventDayId: string;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
}): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const allowed = await canAccessEvent(input.eventId, auth.admin);
  if (!allowed) return { ok: false, error: 'Event not found' };

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Enter a session title' };
  if (title.length > 150) return { ok: false, error: 'Session title is too long' };

  const day = await prisma.event_days.findFirst({
    where: { id: input.eventDayId, event_id: input.eventId },
    select: { id: true },
  });
  if (!day) return { ok: false, error: 'Choose a day of this event' };

  let startTime: Date | null;
  let endTime: Date | null;
  try {
    startTime = parseSessionTime(input.start_time);
    endTime = parseSessionTime(input.end_time);
  } catch {
    return { ok: false, error: 'Enter times as HH:mm' };
  }

  try {
    if (input.sessionId) {
      const existing = await prisma.event_sessions.findFirst({
        where: { id: input.sessionId, event_days: { event_id: input.eventId }, media_panel_only: true },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: 'Only sessions added on this page can be edited here' };
      await prisma.event_sessions.update({
        where: { id: existing.id },
        data: {
          event_day_id: day.id,
          title,
          start_time: startTime,
          end_time: endTime,
          updated_at: new Date(),
        },
      });
      return { ok: true, sessionId: existing.id };
    }

    const created = await prisma.event_sessions.create({
      data: {
        event_day_id: day.id,
        title,
        description: '',
        start_time: startTime,
        end_time: endTime,
        status: 'upcoming',
        media_panel_only: true,
      },
      select: { id: true },
    });
    return { ok: true, sessionId: created.id };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2002') return { ok: false, error: 'This day already has a session with that title' };
    console.error(error);
    return { ok: false, error: 'Unable to save session' };
  }
}

