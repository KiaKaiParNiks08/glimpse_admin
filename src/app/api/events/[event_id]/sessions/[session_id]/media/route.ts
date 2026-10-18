import { NextRequest } from 'next/server';
import { badRequest, forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import {
  IncompleteUploadError,
  getMediaKind,
  resolveUploadMime,
  saveUploadedFile,
  validateMediaFile,
} from '@/lib/upload';
import { validateDeclaredVideoDuration } from '@/lib/upload-rules';
import { createEventDayMedia } from '@/server/event-day-media';
import { sessionIdsViewerCanUpload } from '@/server/session-uploaders';
import prisma from '@/server/prisma';

export const maxDuration = 60;

const MAX_FILES = 10;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * POST /api/events/{event_id}/sessions/{session_id}/media
 * Guest upload. Multipart field `media` (repeat), max 10 images and/or videos.
 * Caller must be a session uploader (mobile or corporate email) and the JWT event must match.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ event_id: string; session_id: string }> }
) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    if (!user) return forbidden('Not authenticated');

    const { event_id, session_id } = await context.params;
    if (!isUuid(event_id) || !isUuid(session_id)) return badRequest('Invalid event or session id');
    if (user.event_id !== event_id) return forbidden('This login is for a different event');

    const session = await prisma.event_sessions.findFirst({
      where: { id: session_id, event_days: { event_id } },
      select: { id: true, event_day_id: true },
    });
    if (!session) return notFound('Session not found');

    const allowed = await sessionIdsViewerCanUpload([session.id], user.id);
    if (!allowed.has(session.id)) return forbidden('You do not have permission to upload to this session');

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return badRequest('Expected multipart/form-data');
    }

    const files: File[] = [];
    const durations: string[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'media' || key === 'media[]' || key.startsWith('media[')) {
        if (!(value instanceof File) || value.size <= 0) {
          return badRequest('A media file was missing or did not finish uploading.');
        }
        files.push(value);
      } else if (key === 'video_duration_sec' || key === 'video_duration_sec[]' || key.startsWith('video_duration_sec[')) {
        if (typeof value === 'string') durations.push(value);
      }
    }

    if (files.length === 0) return badRequest('Send at least one file in the media field');
    if (files.length > MAX_FILES) return badRequest(`Maximum ${MAX_FILES} files per upload`);

    const validated: { file: File; kind: 'image' | 'video'; mime: string }[] = [];
    for (const file of files) {
      const mime = resolveUploadMime(file.type, file.name);
      const kind = getMediaKind(mime);
      if (kind !== 'image' && kind !== 'video') {
        return badRequest(
          `Invalid file type for "${file.name}". Allowed: images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV).`
        );
      }
      const sizeError = validateMediaFile({ type: mime, size: file.size }, kind);
      if (sizeError) return badRequest(sizeError);
      validated.push({ file, kind, mime });
    }

    const videos = validated.filter((item) => item.kind === 'video');
    if (videos.length > 0) {
      if (durations.length !== videos.length) {
        return badRequest('Send video_duration_sec once for each video, in the same order as the video files');
      }
      for (const duration of durations) {
        const durationError = validateDeclaredVideoDuration(duration);
        if (durationError) return badRequest(durationError);
      }
    }

    const saved: Array<{
      media_key: string;
      media_url: string;
      media_type: 'image' | 'video';
      display_order: number;
    }> = [];

    for (let i = 0; i < validated.length; i++) {
      const { file, kind, mime } = validated[i];
      try {
        const stored = await saveUploadedFile(file, kind, process.cwd(), {
          prefix: `events/${event_id}/sessions/${session.id}`,
          contentType: mime,
        });
        saved.push({
          media_key: stored.storageKey,
          media_url: stored.relativeUrl,
          media_type: kind,
          display_order: i,
        });
      } catch (error) {
        if (error instanceof IncompleteUploadError) return badRequest(error.message);
        throw error;
      }
    }

    const created = await createEventDayMedia(
      saved.map((item) => ({
        event_day_id: session.event_day_id,
        event_session_id: session.id,
        media_key: item.media_key,
        media_url: item.media_url,
        media_type: item.media_type,
        display_order: item.display_order,
        uploaded_by: user.id,
      }))
    );

    return ok(
      {
        data: created.map(({ media_key: _key, ...row }) => row),
      },
      'Media uploaded'
    );
  } catch (error) {
    console.error(error);
    return serverError('Unable to upload session media');
  }
}
