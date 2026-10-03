import {
  listFavoritesQuerySchema,
  parseBody,
  parseQuery,
  setFavoriteBodySchema,
} from '@/lib/validations';
import { ok, forbidden, notFound, serverError } from '@/lib/api-response';
import { isEventGuest } from '@/server/event-guests';
import { favoriteTargetExists, listFavorites, setFavorite } from '@/server/favorites';

/**
 * GET /api/favorites – The user's favorites (gallery media and posts) for one event, newest first.
 * Query: user_id, event_id (required), type (all | day_media | post), page, limit.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listFavoritesQuerySchema);
    if (err) return err;

    if (!(await isEventGuest(query.event_id, query.user_id))) {
      return forbidden('User is not a guest of this event');
    }

    const { items, total } = await listFavorites(query);
    return ok({
      data: items,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch favorites');
  }
}

/**
 * POST /api/favorites – Add or remove a favorite.
 * Body (JSON): { user_id, event_id, item_type: "day_media" | "post", item_id, add_favourite: true | false }
 */
export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, setFavoriteBodySchema);
    if (err) return err;

    if (!(await isEventGuest(body.event_id, body.user_id))) {
      return forbidden('User is not a guest of this event');
    }

    // Removing never needs the target to exist, so stale favorites can always be cleared.
    if (body.add_favourite && !(await favoriteTargetExists(body.event_id, body.item_type, body.item_id))) {
      return notFound(body.item_type === 'post' ? 'Post not found' : 'Media not found in this event');
    }

    const { is_favorite } = await setFavorite(body);
    return ok({
      is_favorite,
      item_type: body.item_type,
      item_id: body.item_id,
      event_id: body.event_id,
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to update favorite');
  }
}
