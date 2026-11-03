import { z } from 'zod';
import { ok, serverError } from '@/lib/api-response';
import { parseParams, parseQuery } from '@/lib/validations';
import { listSessionMediaQuerySchema } from '@/lib/validations/events';
import { uuidSchema } from '@/lib/validations/common';
import { getFavoritedItemIds } from '@/server/favorites';
import { SESSION_MEDIA_PAGE_SIZE, listSessionMediaPage } from '@/server/event-day-media';
import prisma from '@/server/prisma';
import { sessionIdsViewerCanUpload } from '@/server/session-uploaders';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';

const paramsSchema = z.object({ event_id: uuidSchema });

/**
 * GET /api/events/{event_id}/session-media?page=1
 * Every session gallery item for the event, 15 per page. Optional event_session_id limits one session.
 */
export async function GET(request: Request, context: { params: Promise<{ event_id: string }> }) {
  try {
    const [params, pathError] = parseParams(await context.params, paramsSchema);
    if (pathError) return pathError;
    const [query, queryError] = parseQuery(new URL(request.url).searchParams, listSessionMediaQuerySchema);
    if (queryError) return queryError;

    const userFromToken = getUserFromAuthorizationHeader(request);
    const adminFromToken = getAdminFromAuthorizationHeader(request);
    const effectiveUserId = userFromToken?.id || query.viewer_user_id;
    const isAdmin = Boolean(adminFromToken);

    const { total, rows } = await listSessionMediaPage({
      eventId: params.event_id,
      eventSessionId: query.event_session_id,
      page: query.page,
    });

    const sessionRows =
      effectiveUserId || isAdmin
        ? await prisma.event_sessions.findMany({
            where: query.event_session_id
              ? { id: query.event_session_id, event_days: { event_id: params.event_id } }
              : { event_days: { event_id: params.event_id } },
            select: { id: true },
          })
        : [];

    const [canUploadIds, favorited] = await Promise.all([
      isAdmin
        ? Promise.resolve(new Set(sessionRows.map((row) => row.id)))
        : sessionIdsViewerCanUpload(
            sessionRows.map((row) => row.id),
            effectiveUserId
          ),
      effectiveUserId
        ? getFavoritedItemIds(effectiveUserId, 'day_media', rows.map((row) => row.id))
        : Promise.resolve(null),
    ]);

    const data = rows.map(({ media_key: _key, uploaded_by, ...row }) => {
      const canUpload = row.event_session_id ? canUploadIds.has(row.event_session_id) : false;
      const isOwner = Boolean(effectiveUserId && uploaded_by && uploaded_by === effectiveUserId);
      const canDelete = Boolean(isAdmin || isOwner);

      return {
        ...row,
        thumbnail_url: row.thumbnail_url,
        ...(favorited && { is_favorite: favorited.has(row.id) }),
        can_upload: canUpload,
        can_delete: canDelete,
      };
    });

    return ok({
      data,
      meta: {
        page: query.page,
        limit: SESSION_MEDIA_PAGE_SIZE,
        total,
        total_pages: Math.max(1, Math.ceil(total / SESSION_MEDIA_PAGE_SIZE)),
        can_upload: query.event_session_id
          ? canUploadIds.has(query.event_session_id)
          : canUploadIds.size > 0,
      },
    });
  } catch (error) {
    console.error(error);
    return serverError('Unable to fetch session media');
  }
}
