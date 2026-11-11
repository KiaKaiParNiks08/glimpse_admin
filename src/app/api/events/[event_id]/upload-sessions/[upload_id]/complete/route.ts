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
import { getEventEffectiveFeatures } from '@/server/access';
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
    const enabledFeatures = await getEventEffectiveFeatures(event_id);
    const projectRoot = process.cwd();
    const effectiveUserId = user ? user.id : body.user_id || admin!.id;

    // =========================================================================
    // 1. FEED POST COMPLETION
    // =========================================================================
    if (kind === 'feed_post') {
      if (!enabledFeatures.mobile_feed) {
        return forbidden('Social feed is disabled for this event');
      }
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

      const mediaItems = await Promise.all(
        uploadIds.map(async (upId, idx) => {
          const assembled = await assembleUploadSession(upId);
          const mediaKind = getMediaKind(assembled.session.content_type);
          if (mediaKind !== 'image' && mediaKind !== 'video') {
            throw new Error(`BAD_CONTENT_TYPE:${assembled.session.content_type}`);
          }
          const size = readMediaDimensions(assembled.buffer, mediaKind);
          const ratio = size ? aspectRatio(size.width, size.height) : null;
          const saved = await saveUploadedBuffer(assembled.buffer, mediaKind, projectRoot, {
            prefix: 'feed',
            contentType: assembled.session.content_type,
            fileName: assembled.session.filename,
          });
          await cleanupUploadSession(upId, { url: saved.relativeUrl, key: saved.storageKey });
          return {
            media_type: mediaKind,
            media_url: saved.relativeUrl,
            media_width: size?.width ?? null,
            media_height: size?.height ?? null,
            aspect_ratio: ratio,
            thumbnail_width: mediaKind === 'video' ? videoThumbnail?.width ?? null : null,
            thumbnail_height: mediaKind === 'video' ? videoThumbnail?.height ?? null : null,
            media_order: idx + 1,
            storageKey: saved.storageKey,
            ...(mediaKind === 'video' && videoThumbnail ? { thumbnail_url: videoThumbnail.url } : {}),
          };
        })
      ).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Upload incomplete';
        return msg;
      });
      if (typeof mediaItems === 'string') {
        if (mediaItems.startsWith('BAD_CONTENT_TYPE:')) {
          return badRequest(`Unsupported media content type ${mediaItems.slice('BAD_CONTENT_TYPE:'.length)}`);
        }
        return badRequest(`Upload session is incomplete or corrupt: ${mediaItems}`);
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
      if (!enabledFeatures.session_media_upload) {
        return forbidden('Session media upload is disabled for this event');
      }
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

      // Pre-assemble thumbnails concurrently if present
      const savedThumbnails = (
        await Promise.all(
          thumbnailUploadIds.map(async (thumbUpId) => {
            try {
              const { buffer: tBuf, session: tSession } = await assembleUploadSession(thumbUpId);
              const savedThumb = await saveUploadedBuffer(tBuf, 'image', projectRoot, {
                prefix: `events/${event_id}/sessions/${session.id}/thumbnails`,
                contentType: tSession.content_type,
                fileName: tSession.filename,
              });
              await cleanupUploadSession(thumbUpId, { url: savedThumb.relativeUrl, key: savedThumb.storageKey });
              return { url: savedThumb.relativeUrl, key: savedThumb.storageKey };
            } catch (err) {
              console.error(`[session_media thumbnail assemble failed for ${thumbUpId}]`, err);
              return null;
            }
          })
        )
      ).filter((t): t is { url: string; key: string } => t !== null);

      const assembledResults = await Promise.all(
        uploadIds.map(async (upId, i) => {
          const assembled = await assembleUploadSession(upId);
          const mediaKind = getMediaKind(assembled.session.content_type);
          if (mediaKind !== 'image' && mediaKind !== 'video') {
            throw new Error(`BAD_CONTENT_TYPE:${assembled.session.content_type}`);
          }
          const saved = await saveUploadedBuffer(assembled.buffer, mediaKind, projectRoot, {
            prefix: `events/${event_id}/sessions/${session.id}`,
            contentType: assembled.session.content_type,
            fileName: assembled.session.filename,
          });
          await cleanupUploadSession(upId, { url: saved.relativeUrl, key: saved.storageKey });
          return {
            media_key: saved.storageKey,
            media_url: saved.relativeUrl,
            media_type: mediaKind as 'image' | 'video',
            display_order: i,
          };
        })
      ).catch((err: unknown) => (err instanceof Error ? err.message : 'Incomplete upload'));

      if (typeof assembledResults === 'string') {
        if (assembledResults.startsWith('BAD_CONTENT_TYPE:')) {
          return badRequest(`Unsupported media content type ${assembledResults.slice('BAD_CONTENT_TYPE:'.length)}`);
        }
        return badRequest(`Upload session is incomplete: ${assembledResults}`);
      }

      let videoIndex = 0;
      const savedItems = assembledResults.map((item) => {
        let thumbnail_url: string | null = null;
        let thumbnail_key: string | null = null;
        if (item.media_type === 'video' && savedThumbnails[videoIndex]) {
          thumbnail_url = savedThumbnails[videoIndex].url;
          thumbnail_key = savedThumbnails[videoIndex].key;
          videoIndex++;
        }
        return {
          ...item,
          thumbnail_url,
          thumbnail_key,
        };
      });

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
