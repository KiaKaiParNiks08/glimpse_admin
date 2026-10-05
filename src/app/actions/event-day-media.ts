'use server';

import prisma from '@/server/prisma';
import { getAdminSessionFromCookies } from '@/lib/admin-session';
import { isEventAdminAssigned, getEventById } from '@/server/events';
import { getEventDaysByEventId } from '@/server/event-days';
import { createPresignedUpload } from '@/lib/s3-presign';
import {
  getMediaKind,
  resolveUploadMime,
  validateDeclaredVideoDuration,
  validateMediaFile,
} from '@/lib/upload-rules';
import { createEventDayMedia, deleteEventDayMediaById } from '@/server/event-day-media';
import { buildEventWatermark, type EventWatermark } from '@/lib/watermark';

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
      event: { id: string; title: string; watermark: EventWatermark | null };
      days: Awaited<ReturnType<typeof getEventDaysByEventId>>;
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

  const days = await getEventDaysByEventId(eventId);
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
    event: { id: event.id, title: event.title, watermark: buildEventWatermark(event) },
    days: normalizedDays,
  };
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

