import { parseQuery } from '@/lib/validations';
import { listEventHighlightsQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import { getEventHighlightsByEventId } from '@/server/event-highlights';

/**
 * GET /api/events/highlights
 * Returns the list of event highlights from the event_highlights table for the given event.
 * Query: event_id (required).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listEventHighlightsQuerySchema);
    if (err) return err;

    const highlights = await getEventHighlightsByEventId(query.event_id);
    return ok({ data: highlights });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event highlights');
  }
}
