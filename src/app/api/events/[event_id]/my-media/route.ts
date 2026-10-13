import { forbidden, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { myMediaQuerySchema } from '@/lib/validations/people-media';
import { parseParams, parseQuery } from '@/lib/validations/parse';
import { uuidSchema } from '@/lib/validations/common';
import { z } from 'zod';
import { listMyMedia } from '@/server/people-media/queries';
import { backfillEventMedia } from '@/server/people-media/register';
import { rematchUserEventMedia } from '@/server/people-media/rekognition';
import { scheduleFaceProcessing } from '@/server/people-media/schedule';

export const maxDuration = 60;

const paramsSchema = z.object({ event_id: uuidSchema });

/**
 * GET /api/events/:eventId/my-media?user_id=&page=&limit=
 * Media where this user's face matched. user_id must be the signed-in app user.
 */
export async function GET(request: Request, context: { params: Promise<{ event_id: string }> }) {
  const user = getUserFromAuthorizationHeader(request);
  if (!user) return forbidden('Not authenticated');
  try {
    const [params, pathError] = parseParams(await context.params, paramsSchema);
    if (pathError) return pathError;
    const [query, queryError] = parseQuery(new URL(request.url).searchParams, myMediaQuerySchema);
    if (queryError) return queryError;
    if (query.user_id !== user.id) return forbidden('Forbidden');

    const limit = Math.min(query.limit, 50);
    let result = await listMyMedia({
      userId: query.user_id,
      eventId: params.event_id,
      page: query.page,
      limit,
    });
    if (!result) return forbidden('Forbidden');

    if (result.total === 0) {
      try {
        await backfillEventMedia(params.event_id);
        await scheduleFaceProcessing();
        await rematchUserEventMedia(query.user_id, params.event_id);
        result = await listMyMedia({
          userId: query.user_id,
          eventId: params.event_id,
          page: query.page,
          limit,
        });
      } catch (error) {
        console.error('[people-media] my-media backfill/match failed', error);
      }
    }

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
