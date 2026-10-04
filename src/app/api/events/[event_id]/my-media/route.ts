import { forbidden, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { myMediaQuerySchema } from '@/lib/validations/people-media';
import { parseParams, parseQuery } from '@/lib/validations/parse';
import { uuidSchema } from '@/lib/validations/common';
import { z } from 'zod';
import { listMyMedia } from '@/server/people-media/queries';

const paramsSchema = z.object({ event_id: uuidSchema });

/** GET /api/events/:eventId/my-media — photographer and user-post media where this user's face matched. */
export async function GET(request: Request, context: { params: Promise<{ event_id: string }> }) {
  const user = getUserFromAuthorizationHeader(request);
  if (!user) return forbidden('Not authenticated');
  try {
    const [params, pathError] = parseParams(await context.params, paramsSchema);
    if (pathError) return pathError;
    const [query, queryError] = parseQuery(new URL(request.url).searchParams, myMediaQuerySchema);
    if (queryError) return queryError;

    const limit = Math.min(query.limit, 50);
    const result = await listMyMedia({
      userId: user.id,
      eventId: params.event_id,
      page: query.page,
      limit,
    });
    if (!result) return forbidden('Forbidden');

    return ok({
      data: result.items,
      meta: {
        total: result.total,
        page: query.page,
        limit,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    });
  } catch (error) {
    console.error('GET /api/events/[event_id]/my-media', error);
    return serverError('Unable to load your media');
  }
}
