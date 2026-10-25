import { NextRequest } from 'next/server';
import {
  createFeedPostFormSchema,
  listPostsQuerySchema,
  parseQuery,
} from '@/lib/validations';
import { ok, badRequest, notFound, serverError } from '@/lib/api-response';
import {
  IncompleteUploadError,
  getMediaKind,
  resolveUploadMime,
  saveUploadedBuffer,
  validateMediaFile,
} from '@/lib/upload';
import { aspectRatio, readMediaDimensions } from '@/lib/media-dimensions';
import { validateDeclaredVideoDuration } from '@/lib/upload-rules';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { createPost, listPosts } from '@/server/posts';
import prisma from '@/server/prisma';
import { ensureEventGuest } from '@/server/event-guests';
import { registerFeedPostMedia } from '@/server/people-media/register';

/** Allow a video upload to finish. Body size is set in next.config (middlewareClientMaxBodySize). */
export const maxDuration = 60;

/**
 * GET /api/feed – List feed posts with optional filters and pagination.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listPostsQuerySchema);
    if (err) return err;

    const { page, limit } = query;
    const { posts, total } = await listPosts(query);

    return ok({
      data: posts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch feed');
  }
}

/**
 * POST /api/feed – Create a feed post with optional image/video uploads.
 * Content-Type: multipart/form-data
 * Fields: user_id (required), caption (optional), event_id (optional), height (optional), media (multiple). Max 1 video OR max 6 images per post (no mixing). Status is always active.
 * event_id is stored on the post. GET /api/feed?event_id= returns only that event. A post with no event_id is not listed for any event.
 * Files are saved under project uploads folder (uploads/YYYY/MM/).
 */
export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error(error);
      return badRequest('The upload did not finish. Please send the file again.');
    }
    const user_id = formData.get('user_id');
    const caption = formData.get('caption');
    const event_id = formData.get('event_id');
    const height = formData.get('height');

    const formFields = {
      user_id: user_id === null || user_id === undefined ? undefined : String(user_id),
      caption:
        caption === null || caption === undefined ? undefined : (caption as string).trim() || undefined,
      event_id:
        event_id === null || event_id === undefined || String(event_id).trim() === ''
          ? undefined
          : String(event_id).trim(),
      height:
        height === null || height === undefined || String(height).trim() === ''
          ? undefined
          : String(height).trim(),
    };

    const parsed = createFeedPostFormSchema.safeParse(formFields);
    if (!parsed.success) {
      return badRequest('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const tokenUser = getUserFromAuthorizationHeader(request);
    const eventId =
      parsed.data.event_id ??
      (tokenUser && tokenUser.id === parsed.data.user_id ? tokenUser.event_id : undefined);
    if (eventId) {
      const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true } });
      if (!event) return notFound('Event not found');
      await ensureEventGuest({ event_id: eventId, user_id: parsed.data.user_id });
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

    // Collect all media files: "media", "media[]", or "media[0]", "media[1]" (Swagger UI array).
    // An empty part means the body was cut off. Do not create the post without that file.
    const files: File[] = [];
    const thumbnails: File[] = [];
    for (const [key, value] of formData.entries()) {
      const isMediaField = key === 'media' || key === 'media[]' || key.startsWith('media[');
      const isThumbField = key === 'thumbnail' || key === 'thumbnail[]' || key.startsWith('thumbnail[');
      if (!isMediaField && !isThumbField) continue;
      if (!(value instanceof File) || value.size <= 0) {
        return badRequest('The media file was missing or did not finish uploading. Please try again.');
      }
      if (isThumbField) thumbnails.push(value);
      else files.push(value);
    }

    // Validate type/size and collect kinds: max 1 video OR max 6 images (no mixing)
    const MAX_IMAGES = 6;
    const MAX_VIDEOS = 1;
    let imageCount = 0;
    let videoCount = 0;
    const validated: { file: File; kind: 'image' | 'video'; mime: string }[] = [];

    const videoDurationField = formData.get('video_duration_sec');

    for (const file of files) {
      const mime = resolveUploadMime(file.type, file.name);
      const kind = getMediaKind(mime);
      if (!kind || kind === 'pdf') {
        return badRequest(
          `Invalid file type for "${file.name}". Allowed: images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV).`
        );
      }
      const validationError = validateMediaFile({ type: mime, size: file.size }, kind);
      if (validationError) return badRequest(validationError);
      if (kind === 'video') {
        const durationError = validateDeclaredVideoDuration(videoDurationField);
        if (durationError) return badRequest(durationError);
      }
      if (kind === 'image') imageCount += 1;
      else videoCount += 1;
      validated.push({ file, kind, mime });
    }

    if (videoCount > MAX_VIDEOS) {
      return badRequest(`Maximum ${MAX_VIDEOS} video allowed per post.`);
    }
    if (imageCount > MAX_IMAGES) {
      return badRequest(`Maximum ${MAX_IMAGES} images allowed per post.`);
    }
    if (videoCount >= 1 && imageCount >= 1) {
      return badRequest('Post must contain either a single video or up to 6 images, not both.');
    }
    if (videoCount === 1 && thumbnails.length > 1) {
      return badRequest('Send one thumbnail image for the video');
    }
    if (thumbnails.length === 1) {
      const mime = resolveUploadMime(thumbnails[0].type, thumbnails[0].name);
      if (getMediaKind(mime) !== 'image') return badRequest('Video thumbnail must be an image');
      const sizeError = validateMediaFile({ type: mime, size: thumbnails[0].size }, 'image');
      if (sizeError) return badRequest(sizeError);
    }

    const projectRoot = process.cwd();
    let videoThumbnail: {
      url: string;
      storageKey: string;
      width: number | null;
      height: number | null;
    } | null = null;
    if (videoCount === 1 && thumbnails[0]) {
      const mime = resolveUploadMime(thumbnails[0].type, thumbnails[0].name);
      const thumbBytes = Buffer.from(await thumbnails[0].arrayBuffer());
      const thumbSize = readMediaDimensions(thumbBytes, 'image');
      const savedThumb = await saveUploadedBuffer(thumbBytes, 'image', projectRoot, {
        prefix: 'feed/thumbnails',
        contentType: mime,
        fileName: thumbnails[0].name,
      });
      videoThumbnail = {
        url: savedThumb.relativeUrl,
        storageKey: savedThumb.storageKey,
        width: thumbSize?.width ?? null,
        height: thumbSize?.height ?? null,
      };
    }
    for (const { file, kind, mime } of validated) {
      order += 1;
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length === 0 || bytes.length !== file.size) {
        return badRequest('The media file was missing or did not finish uploading. Please try again.');
      }
      const size = readMediaDimensions(bytes, kind);
      const ratio = size ? aspectRatio(size.width, size.height) : null;
      const saved = await saveUploadedBuffer(bytes, kind, projectRoot, {
        prefix: 'feed',
        contentType: mime,
        fileName: file.name,
      });
      mediaItems.push({
        media_type: kind,
        media_url: saved.relativeUrl,
        media_width: size?.width ?? null,
        media_height: size?.height ?? null,
        aspect_ratio: ratio,
        thumbnail_width: kind === 'video' ? videoThumbnail?.width ?? null : null,
        thumbnail_height: kind === 'video' ? videoThumbnail?.height ?? null : null,
        media_order: order,
        storageKey: saved.storageKey,
        ...(kind === 'video' && videoThumbnail ? { thumbnail_url: videoThumbnail.url } : {}),
      });
    }

    const post = await createPost(
      {
        user_id: parsed.data.user_id,
        caption: parsed.data.caption,
        status: 'active',
        event_id: eventId ?? null,
        height: parsed.data.height ?? null,
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

    if (eventId) {
      const storageByOrder = new Map(mediaItems.map((item) => [item.media_order, item.storageKey]));
      await registerFeedPostMedia({
        eventId,
        userId: parsed.data.user_id,
        items: post.post_media.map((item) => ({
          id: item.id,
          media_type: item.media_type,
          media_url: item.media_url,
          storageKey: storageByOrder.get(item.media_order ?? 0) ?? null,
          thumbnailUrl: item.thumbnail_url,
          thumbnailStorageKey: item.media_type === 'video' ? videoThumbnail?.storageKey ?? null : null,
        })),
      });
    }

    return ok(post, 201);
  } catch (e) {
    if (e instanceof IncompleteUploadError) {
      return badRequest(e.message);
    }
    console.error(e);
    return serverError('Unable to create post');
  }
}
