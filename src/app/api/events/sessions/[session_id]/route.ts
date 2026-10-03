import { parseParams } from '@/lib/validations';
import { eventSessionIdPathSchema } from '@/lib/validations/events';
import { ok, notFound, serverError } from '@/lib/api-response';
import { getEventSessionDetailsById } from '@/server/events';

/**
 * GET /api/events/sessions/[session_id]
 * Returns one event session with its day (and parent event_id), venue, sub-venue, organizer, and offerings.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ session_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, err] = parseParams(params, eventSessionIdPathSchema);
    if (err) return err;

    const data = await getEventSessionDetailsById(path.session_id);
    if (!data) return notFound('Session not found');

    return ok({ data });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch session details');
  }
}
