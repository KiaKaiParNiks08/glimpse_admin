import { parseQuery } from '@/lib/validations';
import { listCurrentHappeningQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import { getCurrentHappeningByEventId } from '@/server/current-happening';

/**
 * GET /api/events/current-happening
 * Returns current happening rows for the given event.
 * Query: event_id (required).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listCurrentHappeningQuerySchema);
    if (err) return err;

    const rows = await getCurrentHappeningByEventId(query.event_id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const data = rows.map(({ happening_photos, ...row }) => row);
    return ok({ data });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch current happening');
  }
}
