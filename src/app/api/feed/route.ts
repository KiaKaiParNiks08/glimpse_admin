import { NextRequest } from 'next/server';
import {
  createFeedPostFormSchema,
  listPostsQuerySchema,
  parseQuery,
} from '@/lib/validations';
import { ok, badRequest, serverError } from '@/lib/api-response';
import {
  getMediaKind,
  saveUploadedFile,
  validateMediaFile,
} from '@/lib/upload';
import { validateDeclaredVideoDuration } from '@/lib/upload-rules';
import { createPost, listPosts } from '@/server/posts';

/** Increase body size limit for multipart (images/videos). Default is 1MB. */
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
 * Fields: user_id (required), caption (optional), media (multiple). Max 1 video OR max 6 images per post (no mixing). Status is always active.
 * Files are saved under project uploads folder (uploads/YYYY/MM/).
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const user_id = formData.get('user_id');
    const caption = formData.get('caption');

    const formFields = {
      user_id: user_id === null || user_id === undefined ? undefined : String(user_id),
      caption:
        caption === null || caption === undefined ? undefined : (caption as string).trim() || undefined,
    };

    const parsed = createFeedPostFormSchema.safeParse(formFields);
    if (!parsed.success) {
      return badRequest('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const mediaItems: Array<{ media_type: 'image' | 'video'; media_url: string; media_order: number }> = [];
    let order = 0;

    // Collect all media files: "media", "media[]", or "media[0]", "media[1]" (Swagger UI array)
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (
        (key === 'media' || key === 'media[]' || key.startsWith('media[')) &&
        value instanceof File &&
        value.size > 0
      ) {
        files.push(value);
      }
    }

    // Validate type/size and collect kinds: max 1 video OR max 6 images (no mixing)
    const MAX_IMAGES = 6;
    const MAX_VIDEOS = 1;
    let imageCount = 0;
    let videoCount = 0;
    const validated: { file: File; kind: 'image' | 'video' }[] = [];

    const videoDurationField = formData.get('video_duration_sec');

    for (const file of files) {
      const kind = getMediaKind(file.type);
      if (!kind || kind === 'pdf') {
        return badRequest(
          `Invalid file type for "${file.name}". Allowed: images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV).`
        );
      }
      const validationError = validateMediaFile({ type: file.type, size: file.size }, kind);
      if (validationError) return badRequest(validationError);
      if (kind === 'video') {
        const durationError = validateDeclaredVideoDuration(videoDurationField);
        if (durationError) return badRequest(durationError);
      }
      if (kind === 'image') imageCount += 1;
      else videoCount += 1;
      validated.push({ file, kind });
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

    const projectRoot = process.cwd();
    for (const { file, kind } of validated) {
      order += 1;
      const { relativeUrl } = await saveUploadedFile(file, kind, projectRoot, { prefix: 'feed' });
      mediaItems.push({
        media_type: kind,
        media_url: relativeUrl,
        media_order: order,
      });
    }

    const post = await createPost(
      {
        user_id: parsed.data.user_id,
        caption: parsed.data.caption,
        status: 'active',
      },
      mediaItems
    );

    return ok(post, 201);
  } catch (e) {
    console.error(e);
    return serverError('Unable to create post');
  }
}
