import { parseParams, parseQuery } from '@/lib/validations';
import { eventIdPathSchema, listEventDaysQuerySchema } from '@/lib/validations/events';
import { ok, notFound, serverError } from '@/lib/api-response';
import { getEventDaysByEventId } from '@/server/event-days';
import { eventExists, formatSessionTimeToHHmm } from '@/server/events';

/**
 * GET /api/events/[event_id]/days
 * Returns event days for the given event_id (UUID), or 404 if event does not exist.
 * Query params (all optional): date (exact day), start_date, end_date (range).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ event_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, eventIdPathSchema);
    if (pathErr) return pathErr;

    const { searchParams } = new URL(request.url);
    const [query, queryErr] = parseQuery(searchParams, listEventDaysQuerySchema);
    if (queryErr) return queryErr;

    const exists = await eventExists(path.event_id);
    if (!exists) return notFound('Event not found');

    const dateFilter =
      query.date || query.start_date || query.end_date
        ? {
            date: query.date,
            start_date: query.start_date,
            end_date: query.end_date,
          }
        : undefined;

    const days = await getEventDaysByEventId(path.event_id, dateFilter);
    const data = days.map((day) => {
      const { event_sessions, ...rest } = day;
      delete (rest as { event_day_media?: unknown }).event_day_media;
      return {
        ...rest,
        event_sessions: event_sessions.map((s) => ({
          ...s,
          date: day.date,
          start_time: formatSessionTimeToHHmm(s.start_time),
          end_time: formatSessionTimeToHHmm(s.end_time),
        })),
      };
    });
    return ok({ data });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event days');
  }
}
