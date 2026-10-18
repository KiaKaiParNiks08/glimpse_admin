import { parseQuery } from '@/lib/validations';
import { listEventDayMediaQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import {
  getEventDayMediaByEventDayId,
  getEventDayMediaBySessionId,
} from '@/server/event-day-media';
import { getFavoritedItemIds } from '@/server/favorites';
import { sessionIdsViewerCanUpload } from '@/server/session-uploaders';
import prisma from '@/server/prisma';

/**
 * GET /api/events/day-media
 * Returns gallery media rows of one session (event_session_id) or of a whole day (event_day_id).
 * Query: event_session_id or event_day_id (one required), viewer_user_id (optional, adds is_favorite per item).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listEventDayMediaQuerySchema);
    if (err) return err;

    const rows = query.event_session_id
      ? await getEventDayMediaBySessionId(query.event_session_id)
      : await getEventDayMediaByEventDayId(query.event_day_id!);
    const data = rows.map(({ media_key, ...row }) => row);

    if (!query.viewer_user_id) {
      return ok({ data, meta: { can_upload: false } });
    }

    const sessionIds = query.event_session_id
      ? [query.event_session_id]
      : (
          await prisma.event_sessions.findMany({
            where: { event_day_id: query.event_day_id },
            select: { id: true },
          })
        ).map((row) => row.id);
    const canUploadIds = await sessionIdsViewerCanUpload(sessionIds, query.viewer_user_id);
    const can_upload = query.event_session_id
      ? canUploadIds.has(query.event_session_id)
      : canUploadIds.size > 0;

    const favorited = await getFavoritedItemIds(
      query.viewer_user_id,
      'day_media',
      data.map((m) => m.id)
    );
    return ok({
      data: data.map((m) => ({ ...m, is_favorite: favorited.has(m.id) })),
      meta: { can_upload },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event day media');
  }
}
