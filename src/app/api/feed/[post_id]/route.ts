import { parseParams } from '@/lib/validations';
import {
  deletePostPathSchema,
  deletePostBodySchema,
  updateFeedPostBodySchema,
} from '@/lib/validations/posts';
import { forbidden, notFound, badRequest, serverError, ok } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { deletePostOwnedByUser, getPostLikedUsers, updatePostCaption } from '@/server/posts';

async function readDeleteInput(request: Request) {
  const url = new URL(request.url);
  const queryUser = url.searchParams.get('user_id')?.trim() || undefined;
  const queryEvent = url.searchParams.get('event_id')?.trim() || undefined;

  let bodyUser: string | undefined;
  let bodyEvent: string | undefined;
  try {
    const raw = await request.json();
    if (raw && typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      if (typeof record.user_id === 'string' && record.user_id.trim()) bodyUser = record.user_id.trim();
      if (typeof record.event_id === 'string' && record.event_id.trim()) bodyEvent = record.event_id.trim();
    }
  } catch {
    // Flutter often sends DELETE with no body. Query and JWT are enough.
  }

  const tokenUser = getUserFromAuthorizationHeader(request);
  const user_id = bodyUser || queryUser || tokenUser?.id;
  const event_id =
    bodyEvent ||
    queryEvent ||
    (tokenUser && tokenUser.id === user_id ? tokenUser.event_id : undefined);

  return deletePostBodySchema.safeParse({ user_id, event_id });
}

/**
 * DELETE /api/feed/[post_id] – Soft-delete a post created by self in that event.
 * user_id and event_id may be JSON body, query, or the app-user JWT.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ post_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, deletePostPathSchema);
    if (pathErr) return pathErr;

    const parsed = await readDeleteInput(request);
    if (!parsed.success) {
      return badRequest('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const result = await deletePostOwnedByUser(path.post_id, parsed.data.user_id, parsed.data.event_id);
    if (result === 'not_found') return notFound('Post not found');
    if (result === 'forbidden') return forbidden('You can only delete your own posts');

    return ok({ id: path.post_id, status: 'deleted' }, 'Post deleted');
  } catch (e) {
    console.error(e);
    return serverError('Unable to delete post');
  }
}

/**
 * PATCH /api/feed/[post_id] – Update only the caption of a post created by self.
 * Media is not changed. user_id and event_id may be body, query, or the app-user JWT.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ post_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, deletePostPathSchema);
    if (pathErr) return pathErr;

    const url = new URL(request.url);
    let raw: Record<string, unknown> = {};
    try {
      const parsedJson = await request.json();
      if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
        raw = parsedJson as Record<string, unknown>;
      }
    } catch {
      return badRequest('Invalid JSON');
    }

    const tokenUser = getUserFromAuthorizationHeader(request);
    const user_id =
      (typeof raw.user_id === 'string' && raw.user_id.trim()) ||
      url.searchParams.get('user_id')?.trim() ||
      tokenUser?.id;
    const event_id =
      (typeof raw.event_id === 'string' && raw.event_id.trim()) ||
      url.searchParams.get('event_id')?.trim() ||
      (tokenUser && tokenUser.id === user_id ? tokenUser.event_id : undefined);
    const parsed = updateFeedPostBodySchema.safeParse({
      caption: raw.caption,
      user_id,
      event_id,
    });
    if (!parsed.success) {
      return badRequest('Validation failed', parsed.error.flatten().fieldErrors);
    }
    if (!parsed.data.user_id) {
      return badRequest('Validation failed', { user_id: ['Required'] });
    }

    const result = await updatePostCaption({
      postId: path.post_id,
      userId: parsed.data.user_id,
      eventId: parsed.data.event_id,
      caption: parsed.data.caption,
    });
    if (result === 'not_found') return notFound('Post not found');
    if (result === 'forbidden') return forbidden('You can only edit your own posts');

    return ok(result.post, 'Post updated');
  } catch (e) {
    console.error(e);
    return serverError('Unable to update post');
  }
}

/**
 * GET /api/feed/[post_id] – List users who liked this post (display name and avatar).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ post_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, deletePostPathSchema);
    if (pathErr) return pathErr;

    const result = await getPostLikedUsers(path.post_id);
    if (result === 'not_found') return notFound('Post not found');

    return ok({ data: result.likes });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch post likes');
  }
}
