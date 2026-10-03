import { parseParams, parseBody } from '@/lib/validations';
import { deletePostPathSchema, deletePostBodySchema } from '@/lib/validations/posts';
import { forbidden, notFound, noContent, serverError, ok } from '@/lib/api-response';
import { deletePostOwnedByUser, getPostLikedUsers } from '@/server/posts';

/**
 * DELETE /api/feed/[post_id] – Soft-delete a post created by self.
 * Body (JSON): { user_id: string (UUID) }
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ post_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, deletePostPathSchema);
    if (pathErr) return pathErr;

    const [body, bodyErr] = await parseBody(request, deletePostBodySchema);
    if (bodyErr) return bodyErr;

    const result = await deletePostOwnedByUser(path.post_id, body.user_id);
    if (result === 'not_found') return notFound('Post not found');
    if (result === 'forbidden') return forbidden('You can only delete your own posts');

    return noContent('Post deleted');
  } catch (e) {
    console.error(e);
    return serverError('Unable to delete post');
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

