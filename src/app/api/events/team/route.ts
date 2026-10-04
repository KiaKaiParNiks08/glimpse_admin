import { parseQuery } from '@/lib/validations';
import { eventTeamQuerySchema } from '@/lib/validations/events';
import { notFound, ok, serverError } from '@/lib/api-response';
import { getEventTeam } from '@/server/event-team';

/**
 * GET /api/events/team?event_id=
 * Event planner and photographer for the mobile app. Either side is null when it has not been saved.
 */
export async function GET(request: Request) {
  try {
    const [query, err] = parseQuery(new URL(request.url).searchParams, eventTeamQuerySchema);
    if (err) return err;
    const team = await getEventTeam(query.event_id);
    if (!team) return notFound('Event not found');
    return ok(team);
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event team');
  }
}
