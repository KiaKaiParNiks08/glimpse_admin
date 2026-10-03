import { parseQuery } from '@/lib/validations';
import { listExploreItemsQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import { getExploreItemsByEventAndCategory } from '@/server/explore-items';

/**
 * GET /api/events/explore-items
 * Returns explore item list for the given event and explore category.
 * Query: event_id (required), explore_category_id (required).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listExploreItemsQuerySchema);
    if (err) return err;

    const items = await getExploreItemsByEventAndCategory(
      query.event_id,
      query.explore_category_id
    );
    return ok({ data: items });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch explore items');
  }
}
