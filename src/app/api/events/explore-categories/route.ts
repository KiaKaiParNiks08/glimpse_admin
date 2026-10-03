import { parseQuery } from '@/lib/validations';
import { listEventExploreCategoriesQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import { getEventExploreCategoryNames } from '@/server/event-explore-categories';

/**
 * GET /api/events/explore-categories
 * Returns distinct explore category names (before-event) for the given event.
 * Categories are derived from event_explore_items → explore_items → explore_categories.
 * Query: event_id (required).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listEventExploreCategoriesQuerySchema);
    if (err) return err;

    const categories = await getEventExploreCategoryNames(query.event_id);
    return ok({ data: categories });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event explore categories');
  }
}
