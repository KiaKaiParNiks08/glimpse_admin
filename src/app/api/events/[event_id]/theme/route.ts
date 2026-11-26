import { parseParams, parseBody } from '@/lib/validations';
import { eventIdPathSchema } from '@/lib/validations/events';
import {
  setEventThemeBodySchema,
  normalizeEventThemeInput,
} from '@/lib/validations/event-theme';
import {
  ok,
  notFound,
  forbidden,
  unauthorized,
  serverError,
} from '@/lib/api-response';
import {
  getEventTheme,
  saveEventTheme,
  deleteEventTheme,
  CustomThemeEntitlementError,
} from '@/server/event-theme';
import {
  getAdminContextFromRequest,
  canContextAccessEvent,
} from '@/server/access';

type RouteContext = { params: Promise<{ event_id: string }> };

/**
 * GET /api/events/[event_id]/theme
 * Retrieve the resolved dynamic theme and preview assets for an event.
 * If the event has no custom theme or is not entitled to Custom App Themes,
 * returns the default theme with `is_custom: false`.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const [path, err] = parseParams(params, eventIdPathSchema);
    if (err) return err;

    const theme = await getEventTheme(path.event_id);
    if (!theme) {
      return notFound('Event not found');
    }

    const res = ok(theme);
    // Cache strictly by event_id, prevent cross-event contamination
    res.headers.set('Cache-Control', 'private, no-cache, no-transform');
    return res;
  } catch (e) {
    console.error('[GET /api/events/[event_id]/theme] Error:', e);
    return serverError('Unable to fetch event theme');
  }
}

/**
 * Helper to handle theme save / update (PUT and POST)
 */
async function handleSave(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const [path, err] = parseParams(params, eventIdPathSchema);
    if (err) return err;

    const adminCtx = await getAdminContextFromRequest(request);
    if (!adminCtx) {
      return unauthorized('Authentication required');
    }

    const canAccess = await canContextAccessEvent(adminCtx, path.event_id);
    if (!canAccess) {
      return forbidden('You do not have permission to manage this event');
    }

    if (adminCtx.tier !== 'super_admin' && !adminCtx.hasPermission('app_themes.manage')) {
      return forbidden('Permission app_themes.manage required');
    }

    const [body, bodyErr] = await parseBody(request, setEventThemeBodySchema);
    if (bodyErr) return bodyErr;

    const normalized = normalizeEventThemeInput(body);

    const updatedTheme = await saveEventTheme(
      path.event_id,
      normalized,
      adminCtx.tenant_owner_id ?? adminCtx.id,
      adminCtx.tier === 'super_admin'
    );

    const res = ok(updatedTheme);
    res.headers.set('Cache-Control', 'private, no-cache, no-transform');
    return res;
  } catch (e) {
    if (e instanceof CustomThemeEntitlementError) {
      return forbidden(e.message);
    }
    console.error('[PUT/POST /api/events/[event_id]/theme] Error:', e);
    return serverError('Unable to update event theme');
  }
}

/**
 * PUT /api/events/[event_id]/theme
 * Update or set an event's theme (colors or preset).
 * Strictly gated by purchase plan entitlement (`app_themes_manage`).
 */
export async function PUT(request: Request, context: RouteContext) {
  return handleSave(request, context);
}

/**
 * POST /api/events/[event_id]/theme
 * Alias for PUT.
 */
export async function POST(request: Request, context: RouteContext) {
  return handleSave(request, context);
}

/**
 * DELETE /api/events/[event_id]/theme
 * Reverts the event's theme to the default platform theme.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const [path, err] = parseParams(params, eventIdPathSchema);
    if (err) return err;

    const adminCtx = await getAdminContextFromRequest(request);
    if (!adminCtx) {
      return unauthorized('Authentication required');
    }

    const canAccess = await canContextAccessEvent(adminCtx, path.event_id);
    if (!canAccess) {
      return forbidden('You do not have permission to manage this event');
    }

    if (adminCtx.tier !== 'super_admin' && !adminCtx.hasPermission('app_themes.manage')) {
      return forbidden('Permission app_themes.manage required');
    }

    const defaultTheme = await deleteEventTheme(path.event_id);
    const res = ok(defaultTheme);
    res.headers.set('Cache-Control', 'private, no-cache, no-transform');
    return res;
  } catch (e) {
    if (e instanceof CustomThemeEntitlementError) {
      return forbidden(e.message);
    }
    console.error('[DELETE /api/events/[event_id]/theme] Error:', e);
    return serverError('Unable to reset event theme');
  }
}
