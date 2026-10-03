import { parseParams, parseQuery, parseBody } from '@/lib/validations';
import {
  venueIdPathSchema,
  getVenueDetailsQuerySchema,
  updateVenueSchema,
} from '@/lib/validations/venues';
import { ok, notFound, serverError, noContent } from '@/lib/api-response';
import {
  getVenueDetailsById,
  getVenueContactForUser,
  updateVenue,
  deleteVenue,
} from '@/server/venues';

/**
 * GET /api/venues/[venue_id]
 * Returns full venue details for the given venue_id (UUID).
 * Optional query: user_id — when provided, venue_contacts contains only the contact assigned to this user via event_guests.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ venue_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, venueIdPathSchema);
    if (pathErr) return pathErr;

    const [query, queryErr] = parseQuery(
      new URL(request.url).searchParams,
      getVenueDetailsQuerySchema
    );
    if (queryErr) return queryErr;

    const venue = await getVenueDetailsById(path.venue_id);
    if (!venue) return notFound('Venue not found');

    let data = venue;
    if (query.user_id != null) {
      const assignedContact = await getVenueContactForUser(
        path.venue_id,
        query.user_id
      );
      data = {
        ...venue,
        venue_contacts: assignedContact ? [assignedContact] : [],
      };
    }

    return ok({ data });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch venue details');
  }
}

/**
 * PATCH /api/venues/[venue_id]
 * Update venue and optionally replace contacts, facilities, photos, sub-venues.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ venue_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, venueIdPathSchema);
    if (pathErr) return pathErr;

    const [body, bodyErr] = await parseBody(request, updateVenueSchema);
    if (bodyErr) return bodyErr;

    const venue = await updateVenue(path.venue_id, body);
    if (!venue) return notFound('Venue not found');
    return ok({ data: venue });
  } catch (e) {
    console.error(e);
    return serverError('Unable to update venue');
  }
}

/**
 * DELETE /api/venues/[venue_id]
 * Delete venue (cascades to contacts, facilities, photos).
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ venue_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, venueIdPathSchema);
    if (pathErr) return pathErr;

    const deleted = await deleteVenue(path.venue_id);
    if (!deleted) return notFound('Venue not found');
    return noContent();
  } catch (e) {
    console.error(e);
    return serverError('Unable to delete venue');
  }
}
