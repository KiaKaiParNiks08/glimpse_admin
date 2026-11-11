import { parseParams } from '@/lib/validations';
import { eventIdPathSchema } from '@/lib/validations/events';
import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getEventTeam } from '@/server/event-team';
import { getEventEffectiveFeatures } from '@/server/access';

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

    const [team, features] = await Promise.all([
      getEventTeam(path.event_id),
      getEventEffectiveFeatures(path.event_id),
    ]);
    if (!team) return notFound('Event not found');
    if (!features.event_team) return forbidden('Event team is disabled for this event');
    const res = ok(team);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event team');
  }
}
