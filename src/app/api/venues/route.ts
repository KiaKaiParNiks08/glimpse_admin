import { parseQuery, parseBody } from '@/lib/validations';
import { listVenuesQuerySchema, createVenueSchema } from '@/lib/validations/venues';
import { ok, serverError } from '@/lib/api-response';
import { listVenues, createVenue } from '@/server/venues';

/**
 * GET /api/venues
 * List venues with optional search and pagination.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listVenuesQuerySchema);
    if (err) return err;

    const { venues, total } = await listVenues(query);
    return ok({
      data: venues,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch venues');
  }
}

/**
 * POST /api/venues
 * Create a venue with optional contacts, facilities, and photos.
 */
export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, createVenueSchema);
    if (err) return err;

    const venue = await createVenue(body);
    return ok({ data: venue }, 201);
  } catch (e) {
    console.error(e);
    return serverError('Unable to create venue');
  }
}
