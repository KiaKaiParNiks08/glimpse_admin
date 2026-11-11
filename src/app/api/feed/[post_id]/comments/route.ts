import { parseParams, parseQuery } from '@/lib/validations';
import {
  postIdPathSchema,
  createCommentBodySchema,
  listCommentsQuerySchema,
} from '@/lib/validations/comments';
import { parseBody } from '@/lib/validations';
import { ok, forbidden, notFound, serverError } from '@/lib/api-response';
import { createComment, listComments, postExists } from '@/server/comments';
import { getPostEventFeedAllowed } from '@/server/access';
import { notifyCommentAdded } from '@/server/notifications/service';

/**
 * GET /api/feed/[post_id]/comments – List comments for a post.
 * Query: page, limit, status (optional). Each comment includes its replies.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ post_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, postIdPathSchema);
    if (pathErr) return pathErr;

    const { searchParams } = new URL(request.url);
    const [query, queryErr] = parseQuery(searchParams, listCommentsQuerySchema);
    if (queryErr) return queryErr;

    const feedAccess = await getPostEventFeedAllowed(path.post_id);
    if (!feedAccess.exists) return notFound('Post not found');
    if (!feedAccess.allowed) return forbidden('Social feed is disabled for this event');

    const exists = await postExists(path.post_id);
    if (!exists) return notFound('Post not found');

    const { comments, total } = await listComments(path.post_id, query);
    const { page, limit } = query;
    return ok({
      data: comments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch comments');
  }
}

/**
 * POST /api/feed/[post_id]/comments – Add a comment on a post.
 * Body (JSON): { user_id: string (UUID), comment_text: string, parent_comment_id?: string (UUID, optional for replies) }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ post_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, postIdPathSchema);
    if (pathErr) return pathErr;

    const [body, bodyErr] = await parseBody(request, createCommentBodySchema);
    if (bodyErr) return bodyErr;

    const feedAccess = await getPostEventFeedAllowed(path.post_id);
    if (!feedAccess.exists) return notFound('Post not found');
    if (!feedAccess.allowed) return forbidden('Social feed is disabled for this event');

    const exists = await postExists(path.post_id);
    if (!exists) return notFound('Post not found');

    const comment = await createComment(path.post_id, body);

    void notifyCommentAdded({
      postId: path.post_id,
      commentId: comment.id,
      commentText: body.comment_text,
      authorUserId: body.user_id,
      parentCommentId: body.parent_comment_id,
    }).catch((err) => console.error('[notifications] notifyCommentAdded failed:', err));

    return ok(comment, 201);
  } catch (e) {
    console.error(e);
    return serverError('Unable to add comment');
  }
}
