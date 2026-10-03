import { parseQuery } from '@/lib/validations';
import { listAppConfigurationsQuerySchema } from '@/lib/validations/app-configurations';
import { ok, serverError } from '@/lib/api-response';
import { getAppConfigurations } from '@/server/app-configurations';

/**
 * GET /api/app-configurations
 * Public endpoint. Paginated list of app configurations.
 * Query: platform (optional), is_active (optional), page, limit.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listAppConfigurationsQuerySchema);
    if (err) return err;

    const result = await getAppConfigurations(query);
    return ok({
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch app configurations');
  }
}
