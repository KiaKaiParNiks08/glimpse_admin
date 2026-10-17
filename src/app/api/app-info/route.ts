import { parseQuery } from '@/lib/validations';
import { appInfoQuerySchema } from '@/lib/validations/app-info';
import { ok, notFound, serverError } from '@/lib/api-response';
import { getAppInfo } from '@/server/app-info';

/**
 * GET /api/app-info?event_id=&user_id=&device_id=&platform=
 * Theme + store config. With device_id (or user_id), also returns previous_events this install/user joined.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, appInfoQuerySchema);
    if (err) return err;

    const result = await getAppInfo(query);
    if (!result) {
      return notFound('Event or user not found');
    }

    return ok({ data: result });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch app info');
  }
}
