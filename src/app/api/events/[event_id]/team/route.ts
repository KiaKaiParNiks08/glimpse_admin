import { parseParams } from '@/lib/validations';
import { eventIdPathSchema } from '@/lib/validations/events';
import { notFound, ok, serverError } from '@/lib/api-response';
import { getEventTeam } from '@/server/event-team';

/**
 * GET /api/events/[event_id]/team
 * Event planner and photographer for the mobile app via path param.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ event_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, err] = parseParams(params, eventIdPathSchema);
    if (err) return err;

    const team = await getEventTeam(path.event_id);
    if (!team) return notFound('Event not found');
    return ok(team);
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event team');
  }
}
