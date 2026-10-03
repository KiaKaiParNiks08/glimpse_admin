import { parseQuery } from '@/lib/validations';
import { listCmsPagesQuerySchema } from '@/lib/validations/cms-pages';
import { ok, serverError } from '@/lib/api-response';
import { getCmsPages } from '@/server/cms-pages';

/**
 * GET /api/cms-pages
 * Returns a paginated list of CMS pages.
 * Query: status (optional), page, limit.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listCmsPagesQuerySchema);
    if (err) return err;

    const result = await getCmsPages(query);
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
    return serverError('Unable to fetch CMS pages');
  }
}
