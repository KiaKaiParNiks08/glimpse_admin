import { parseQuery } from '@/lib/validations';
import { listEventDayMediaQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import {
  getEventDayMediaByEventDayId,
  getEventDayMediaBySessionId,
} from '@/server/event-day-media';
import { getFavoritedItemIds } from '@/server/favorites';

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
    if (!query.viewer_user_id) return ok({ data });

    const favorited = await getFavoritedItemIds(
      query.viewer_user_id,
      'day_media',
      data.map((m) => m.id)
    );
    return ok({ data: data.map((m) => ({ ...m, is_favorite: favorited.has(m.id) })) });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event day media');
  }
}
