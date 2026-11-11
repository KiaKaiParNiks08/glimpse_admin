import { parseQuery } from '@/lib/validations';
import { listExploreItemsQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import { getExploreItemsByEventAndCategory } from '@/server/explore-items';
import { getEventEffectiveFeatures } from '@/server/access';

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

    const features = await getEventEffectiveFeatures(query.event_id);
    if (!features.event_explore) {
      return ok({ data: [] });
    }

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
