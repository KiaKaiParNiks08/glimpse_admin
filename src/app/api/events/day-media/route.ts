import { parseQuery } from '@/lib/validations';
import { listEventDayMediaQuerySchema } from '@/lib/validations/events';
import { ok, serverError } from '@/lib/api-response';
import {
  getEventDayMediaByEventDayId,
  getEventDayMediaBySessionId,
} from '@/server/event-day-media';
import { getFavoritedItemIds } from '@/server/favorites';
import { sessionIdsViewerCanUpload } from '@/server/session-uploaders';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { getEventEffectiveFeatures, resolveSessionOrDayEventId } from '@/server/access';
import { ALL_FEATURES_ENABLED } from '@/lib/rbac';
import prisma from '@/server/prisma';

/**
 * GET /api/events/day-media
 * Returns gallery media rows of one session (event_session_id) or of a whole day (event_day_id).
 * Query: event_session_id or event_day_id (one required), viewer_user_id (optional, adds is_favorite per item).
 * Also inspects Bearer token for authenticated viewer.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listEventDayMediaQuerySchema);
    if (err) return err;

    const userFromToken = getUserFromAuthorizationHeader(request);
    const adminFromToken = getAdminFromAuthorizationHeader(request);
    const effectiveUserId = userFromToken?.id || query.viewer_user_id;
    const isAdmin = Boolean(adminFromToken);

    const rows = query.event_session_id
      ? await getEventDayMediaBySessionId(query.event_session_id)
      : await getEventDayMediaByEventDayId(query.event_day_id!);

    const sessionIds = query.event_session_id
      ? [query.event_session_id]
      : (
          await prisma.event_sessions.findMany({
            where: { event_day_id: query.event_day_id },
            select: { id: true },
          })
        ).map((row) => row.id);

    const eventId = await resolveSessionOrDayEventId({
      event_session_id: query.event_session_id,
      event_day_id: query.event_day_id,
    });
    const enabledFeatures = eventId
      ? await getEventEffectiveFeatures(eventId)
      : { ...ALL_FEATURES_ENABLED };

    const [canUploadIds, favorited] = await Promise.all([
      enabledFeatures.session_media_upload
        ? isAdmin
          ? Promise.resolve(new Set(sessionIds))
          : sessionIdsViewerCanUpload(sessionIds, effectiveUserId)
        : Promise.resolve(new Set<string>()),
      effectiveUserId && enabledFeatures.mobile_favorites
        ? getFavoritedItemIds(
            effectiveUserId,
            'day_media',
            rows.map((m) => m.id)
          )
        : Promise.resolve(null),
    ]);

    const can_upload = query.event_session_id
      ? canUploadIds.has(query.event_session_id)
      : canUploadIds.size > 0;

    const data = rows.map(({ media_key: _key, uploaded_by, ...m }) => {
      const canUploadItem = m.event_session_id ? canUploadIds.has(m.event_session_id) : false;
      const isOwner = Boolean(effectiveUserId && uploaded_by && uploaded_by === effectiveUserId);
      const canDelete = Boolean(isAdmin || isOwner);

      return {
        ...m,
        ...(favorited && { is_favorite: favorited.has(m.id) }),
        can_upload: canUploadItem,
        can_delete: canDelete,
      };
    });

    const res = ok({
      data,
      meta: { can_upload },
    });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event day media');
  }
}
