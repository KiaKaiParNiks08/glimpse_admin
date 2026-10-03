import { parseQuery } from '@/lib/validations';
import { listHappeningPhotosQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import { getHappeningPhotosByHappeningId } from '@/server/current-happening';

/**
 * GET /api/events/current-happening/photos
 * Returns photos for a given current happening.
 * Query: happening_id (required).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listHappeningPhotosQuerySchema);
    if (err) return err;

    const photos = await getHappeningPhotosByHappeningId(query.happening_id);
    return ok({ data: photos });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch happening photos');
  }
}
