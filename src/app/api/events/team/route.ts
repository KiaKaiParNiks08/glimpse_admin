import { parseQuery } from '@/lib/validations';
import { eventTeamQuerySchema } from '@/lib/validations/events';
import { badRequest, notFound, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { getEventTeam } from '@/server/event-team';

/**
 * GET /api/events/team?event_id=
 * Event planner and photographer for the mobile app.
 * Supports ?event_id= query param OR authenticated Bearer token with event_id scope.
 */
export async function GET(request: Request) {
  try {
    const [query, err] = parseQuery(new URL(request.url).searchParams, eventTeamQuerySchema);
    if (err) return err;

    const user = getUserFromAuthorizationHeader(request);
    const eventId = query.event_id || user?.event_id;

    if (!eventId) {
      return badRequest('event_id is required as a query parameter or via an authenticated Bearer token');
    }

    const team = await getEventTeam(eventId);
    if (!team) return notFound('Event not found');
    return ok(team);
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event team');
  }
}
