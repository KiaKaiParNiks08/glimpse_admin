import {
  GET as eventThemeGet,
  PUT as eventThemePut,
  POST as eventThemePost,
  DELETE as eventThemeDelete,
} from '@/app/api/events/[event_id]/theme/route';

type RouteContext = { params: Promise<{ event_id: string }> };

/**
 * GET /api/admin/events/[event_id]/theme
 * Admin alias for retrieving event theme with preview assets.
 */
export async function GET(request: Request, context: RouteContext) {
  return eventThemeGet(request, context);
}

/**
 * PUT /api/admin/events/[event_id]/theme
 * Admin alias for updating event theme colors.
 */
export async function PUT(request: Request, context: RouteContext) {
  return eventThemePut(request, context);
}

/**
 * POST /api/admin/events/[event_id]/theme
 * Admin alias for setting event theme colors.
 */
export async function POST(request: Request, context: RouteContext) {
  return eventThemePost(request, context);
}

/**
 * DELETE /api/admin/events/[event_id]/theme
 * Admin alias for resetting event theme to default.
 */
export async function DELETE(request: Request, context: RouteContext) {
  return eventThemeDelete(request, context);
}
