import { parseParams, parseBody } from '@/lib/validations';
import { deleteCommentPathSchema, deleteCommentBodySchema } from '@/lib/validations/comments';
import { forbidden, noContent, notFound, serverError } from '@/lib/api-response';
import { deleteCommentOwnedByUser } from '@/server/comments';
import { getPostEventFeedAllowed } from '@/server/access';

/**
 * DELETE /api/feed/[post_id]/comments/[comment_id] – Soft-delete a comment commented by self.
 * Body (JSON): { user_id: string (UUID) }
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ post_id: string; comment_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, deleteCommentPathSchema);
    if (pathErr) return pathErr;

    const [body, bodyErr] = await parseBody(request, deleteCommentBodySchema);
    if (bodyErr) return bodyErr;

    const feedAccess = await getPostEventFeedAllowed(path.post_id);
    if (!feedAccess.exists) return notFound('Post not found');
    if (!feedAccess.allowed) return forbidden('Social feed is disabled for this event');

    const result = await deleteCommentOwnedByUser(path.post_id, path.comment_id, body.user_id);
    if (result === 'not_found') return notFound('Comment not found');
    if (result === 'forbidden') return forbidden('You can only delete your own comments');

    return noContent();
  } catch (e) {
    console.error(e);
    return serverError('Unable to delete comment');
  }
}

