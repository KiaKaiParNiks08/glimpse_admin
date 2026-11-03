import { badRequest, forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { getMediaKind, saveUploadedBuffer } from '@/lib/upload';
import { aspectRatio, readMediaDimensions } from '@/lib/media-dimensions';
import { createPost } from '@/server/posts';
import { createEventDayMedia } from '@/server/event-day-media';
import { sessionIdsViewerCanUpload } from '@/server/session-uploaders';
import { ensureEventGuest } from '@/server/event-guests';
import { registerFeedPostMedia } from '@/server/people-media/register';
import { notifyNewPostInEvent } from '@/server/notifications/service';
import { assembleUploadSession, cleanupUploadSession } from '@/server/upload-sessions';
import prisma from '@/server/prisma';

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

/**
 * POST /api/events/{event_id}/upload-sessions/{upload_id}/complete
 * Assembles chunked upload sessions and creates domain entities (Feed Post or Session Gallery Media).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ event_id: string; upload_id: string }> }
) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    const admin = getAdminFromAuthorizationHeader(request);
    if (!user && !admin) return forbidden('Not authenticated');

    const { event_id } = await context.params;
    if (!isUuid(event_id)) {
      return badRequest('Invalid event id');
    }
    if (user && user.event_id !== event_id) {
      return forbidden('This login is for a different event');
    }

    const event = await prisma.events.findUnique({
      where: { id: event_id },
      select: { id: true },
    });
    if (!event) return notFound('Event not found');

    let body: any;
    try {
      body = await request.json();
    } catch {
      return badRequest('Expected JSON body');
    }

    const kind = body.kind;
    const projectRoot = process.cwd();
    const effectiveUserId = user ? user.id : body.user_id || admin!.id;

    // =========================================================================
    // 1. FEED POST COMPLETION
    // =========================================================================
    if (kind === 'feed_post') {
      const uploadIds: string[] = Array.isArray(body.upload_ids) ? body.upload_ids.filter(Boolean) : [];
      if (uploadIds.length === 0) {
        return badRequest('upload_ids must contain at least one upload_id');
      }

      await ensureEventGuest({ event_id, user_id: effectiveUserId });

      // If thumbnail_upload_id was provided (e.g. video poster)
      let videoThumbnail: {
        url: string;
        storageKey: string;
        width: number | null;
        height: number | null;
      } | null = null;

      if (body.thumbnail_upload_id) {
        try {
          const { buffer: thumbBuffer, session: thumbSession } = await assembleUploadSession(
            body.thumbnail_upload_id
          );
          const thumbSize = readMediaDimensions(thumbBuffer, 'image');
          const savedThumb = await saveUploadedBuffer(thumbBuffer, 'image', projectRoot, {
            prefix: 'feed/thumbnails',
            contentType: thumbSession.content_type,
            fileName: thumbSession.filename,
          });
          videoThumbnail = {
            url: savedThumb.relativeUrl,
            storageKey: savedThumb.storageKey,
            width: thumbSize?.width ?? null,
            height: thumbSize?.height ?? null,
          };
          await cleanupUploadSession(body.thumbnail_upload_id, {
            url: savedThumb.relativeUrl,
            key: savedThumb.storageKey,
          });
        } catch (err) {
          console.error('[feed_post thumbnail assemble failed]', err);
          return badRequest('Failed to assemble video thumbnail upload session');
        }
      }

      const mediaItems: Array<{
        media_type: 'image' | 'video';
        media_url: string;
        thumbnail_url?: string;
        media_width: number | null;
        media_height: number | null;
        aspect_ratio: number | null;
        thumbnail_width: number | null;
        thumbnail_height: number | null;
        media_order: number;
        storageKey: string;
      }> = [];

      let order = 0;
      for (const upId of uploadIds) {
        order++;
        let assembled;
        try {
          assembled = await assembleUploadSession(upId);
        } catch (err: any) {
          console.error(`[feed_post assemble failed for ${upId}]`, err);
          return badRequest(`Upload session ${upId} is incomplete or corrupt: ${err.message}`);
        }

        const mediaKind = getMediaKind(assembled.session.content_type);
        if (mediaKind !== 'image' && mediaKind !== 'video') {
          return badRequest(`Unsupported media content type ${assembled.session.content_type}`);
        }

        const size = readMediaDimensions(assembled.buffer, mediaKind);
        const ratio = size ? aspectRatio(size.width, size.height) : null;
        const saved = await saveUploadedBuffer(assembled.buffer, mediaKind, projectRoot, {
          prefix: 'feed',
          contentType: assembled.session.content_type,
          fileName: assembled.session.filename,
        });

        mediaItems.push({
          media_type: mediaKind,
          media_url: saved.relativeUrl,
          media_width: size?.width ?? null,
          media_height: size?.height ?? null,
          aspect_ratio: ratio,
          thumbnail_width: mediaKind === 'video' ? videoThumbnail?.width ?? null : null,
          thumbnail_height: mediaKind === 'video' ? videoThumbnail?.height ?? null : null,
          media_order: order,
          storageKey: saved.storageKey,
          ...(mediaKind === 'video' && videoThumbnail ? { thumbnail_url: videoThumbnail.url } : {}),
        });

        await cleanupUploadSession(upId, { url: saved.relativeUrl, key: saved.storageKey });
      }

      const post = await createPost(
        {
          user_id: effectiveUserId,
          caption: body.caption ? String(body.caption).trim() : undefined,
          status: 'active',
          event_id,
          height: body.height !== undefined && body.height !== null && body.height !== '' ? Number(body.height) : null,
        },
        mediaItems.map((item) => ({
          media_type: item.media_type,
          media_url: item.media_url,
          thumbnail_url: item.thumbnail_url ?? null,
          media_width: item.media_width,
          media_height: item.media_height,
          aspect_ratio: item.aspect_ratio,
          thumbnail_width: item.thumbnail_width,
          thumbnail_height: item.thumbnail_height,
          media_order: item.media_order,
        }))
      );

      const storageByOrder = new Map(mediaItems.map((item) => [item.media_order, item.storageKey]));
      await registerFeedPostMedia({
        eventId: event_id,
        userId: effectiveUserId,
        items: post.post_media.map((item) => ({
          id: item.id,
          media_type: item.media_type,
          media_url: item.media_url,
          storageKey: storageByOrder.get(item.media_order ?? 0) ?? null,
          thumbnailUrl: item.thumbnail_url,
          thumbnailStorageKey: item.media_type === 'video' ? videoThumbnail?.storageKey ?? null : null,
        })),
      });

      void notifyNewPostInEvent({
        postId: post.id,
        eventId: event_id,
        authorUserId: effectiveUserId,
      }).catch((err) => console.error('[notifications] notifyNewPostInEvent failed:', err));

      return ok(post, 201);
    }

    // =========================================================================
    // 2. SESSION MEDIA COMPLETION
    // =========================================================================
    if (kind === 'session_media') {
      const sessionId = body.session_id;
      if (!sessionId || !isUuid(sessionId)) {
        return badRequest('Valid session_id UUID is required');
      }

      const session = await prisma.event_sessions.findFirst({
        where: { id: sessionId, event_days: { event_id } },
        select: { id: true, event_day_id: true },
      });
      if (!session) return notFound('Session not found');

      const allowed = await sessionIdsViewerCanUpload([session.id], effectiveUserId);
      if (!allowed.has(session.id) && !admin) {
        return forbidden('You do not have permission to upload to this session');
      }

      const uploadIds: string[] = Array.isArray(body.upload_ids) ? body.upload_ids.filter(Boolean) : [];
      if (uploadIds.length === 0) {
        return badRequest('upload_ids must contain at least one upload_id');
      }

      const thumbnailUploadIds: string[] = Array.isArray(body.thumbnail_upload_ids)
        ? body.thumbnail_upload_ids.filter(Boolean)
        : [];

      // Pre-assemble thumbnails if present
      const savedThumbnails: Array<{ url: string; key: string }> = [];
      for (const thumbUpId of thumbnailUploadIds) {
        try {
          const { buffer: tBuf, session: tSession } = await assembleUploadSession(thumbUpId);
          const savedThumb = await saveUploadedBuffer(tBuf, 'image', projectRoot, {
            prefix: `events/${event_id}/sessions/${session.id}/thumbnails`,
            contentType: tSession.content_type,
            fileName: tSession.filename,
          });
          savedThumbnails.push({ url: savedThumb.relativeUrl, key: savedThumb.storageKey });
          await cleanupUploadSession(thumbUpId, { url: savedThumb.relativeUrl, key: savedThumb.storageKey });
        } catch (err) {
          console.error(`[session_media thumbnail assemble failed for ${thumbUpId}]`, err);
        }
      }

      const savedItems: Array<{
        media_key: string;
        media_url: string;
        media_type: 'image' | 'video';
        thumbnail_url: string | null;
        thumbnail_key: string | null;
        display_order: number;
      }> = [];

      let videoIndex = 0;
      for (let i = 0; i < uploadIds.length; i++) {
        const upId = uploadIds[i];
        let assembled;
        try {
          assembled = await assembleUploadSession(upId);
        } catch (err: any) {
          console.error(`[session_media assemble failed for ${upId}]`, err);
          return badRequest(`Upload session ${upId} is incomplete: ${err.message}`);
        }

        const mediaKind = getMediaKind(assembled.session.content_type);
        if (mediaKind !== 'image' && mediaKind !== 'video') {
          return badRequest(`Unsupported media content type ${assembled.session.content_type}`);
        }

        const saved = await saveUploadedBuffer(assembled.buffer, mediaKind, projectRoot, {
          prefix: `events/${event_id}/sessions/${session.id}`,
          contentType: assembled.session.content_type,
          fileName: assembled.session.filename,
        });

        let thumbUrl: string | null = null;
        let thumbKey: string | null = null;
        if (mediaKind === 'video' && savedThumbnails[videoIndex]) {
          thumbUrl = savedThumbnails[videoIndex].url;
          thumbKey = savedThumbnails[videoIndex].key;
          videoIndex++;
        }

        savedItems.push({
          media_key: saved.storageKey,
          media_url: saved.relativeUrl,
          media_type: mediaKind,
          thumbnail_url: thumbUrl,
          thumbnail_key: thumbKey,
          display_order: i,
        });

        await cleanupUploadSession(upId, { url: saved.relativeUrl, key: saved.storageKey });
      }

      const created = await createEventDayMedia(
        savedItems.map((item) => ({
          event_day_id: session.event_day_id,
          event_session_id: session.id,
          media_key: item.media_key,
          media_url: item.media_url,
          media_type: item.media_type,
          thumbnail_url: item.thumbnail_url,
          thumbnail_key: item.thumbnail_key,
          display_order: item.display_order,
          uploaded_by: effectiveUserId,
        }))
      );

      return ok(
        {
          message: 'Upload complete',
          data: created.map(({ media_key: _key, ...row }) => ({
            ...row,
            can_upload: true,
            can_delete: true,
          })),
        },
        'Upload complete'
      );
    }

    return badRequest(`Unknown upload kind "${kind}". Supported: "feed_post", "session_media"`);
  } catch (error) {
    console.error('[POST upload-sessions complete error]', error);
    return serverError('Unable to complete upload session');
  }
}
