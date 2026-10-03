import { parseQuery } from '@/lib/validations';
import { appInfoQuerySchema } from '@/lib/validations/app-info';
import { ok, notFound, serverError } from '@/lib/api-response';
import { getAppInfo } from '@/server/app-info';

/**
 * GET /api/app-info?event_id=&user_id=&platform=
 * Returns event theme colors, event status, and active app_configuration rows (platform, store_url, current_version, force_update).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, appInfoQuerySchema);
    if (err) return err;

    const result = await getAppInfo(query.event_id, query.user_id, query.platform);
    if (!result) {
      return notFound('Event or user not found');
    }

    return ok({ data: result });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch app info');
  }
}
