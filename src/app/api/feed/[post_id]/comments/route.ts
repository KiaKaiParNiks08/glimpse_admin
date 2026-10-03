import { parseParams, parseQuery } from '@/lib/validations';
import {
  postIdPathSchema,
  createCommentBodySchema,
  listCommentsQuerySchema,
} from '@/lib/validations/comments';
import { parseBody } from '@/lib/validations';
import { ok, notFound, serverError } from '@/lib/api-response';
import { createComment, listComments, postExists } from '@/server/comments';

/**
 * GET /api/feed/[post_id]/comments – List comments for a post.
 * Query: page, limit, status (optional), parent_comment_id=root|all (default root = top-level only).
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

    const exists = await postExists(path.post_id);
    if (!exists) return notFound('Post not found');

    const comment = await createComment(path.post_id, body);
    return ok(comment, 201);
  } catch (e) {
    console.error(e);
    return serverError('Unable to add comment');
  }
}
