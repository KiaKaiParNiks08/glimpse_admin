import { parseParams, parseBody } from '@/lib/validations';
import { likePostPathSchema, likePostBodySchema } from '@/lib/validations/posts';
import { ok, notFound, serverError } from '@/lib/api-response';
import { setPostLike } from '@/server/posts';
import { postExists } from '@/server/comments';

/**
 * POST /api/feed/[post_id]/like – Like/Unlike a post.
 * Body (JSON): { user_id: string (UUID), action?: "toggle" | "like" | "unlike" }
 * Returns the current liked status and updated like_count.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ post_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, likePostPathSchema);
    if (pathErr) return pathErr;

    const [body, bodyErr] = await parseBody(request, likePostBodySchema);
    if (bodyErr) return bodyErr;

    const exists = await postExists(path.post_id);
    if (!exists) return notFound('Post not found');

    const { liked, like_count } = await setPostLike(path.post_id, body.user_id, body.action);
    return ok({ liked, like_count }, 200);
  } catch (e) {
    console.error(e);
    return serverError('Unable to like post');
  }
}
