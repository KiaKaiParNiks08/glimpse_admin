import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { eventPeopleMediaQuerySchema, peopleMediaRetrySchema } from '@/lib/validations/people-media';
import { parseBody, parseParams, parseQuery } from '@/lib/validations/parse';
import { uuidSchema } from '@/lib/validations/common';
import { z } from 'zod';
import prisma from '@/server/prisma';
import { adminCanManageEvent, listEventPeopleMedia, requeueFaceReference, requeueMediaAsset } from '@/server/people-media/queries';

const paramsSchema = z.object({ event_id: uuidSchema });

async function requireAdmin(request: Request, eventId: string) {
  const admin = getAdminFromAuthorizationHeader(request);
  if (!admin) return { error: forbidden('Not authenticated'), event: null };
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true, title: true } });
  if (!event) return { error: notFound('Event not found'), event: null };
  if (!(await adminCanManageEvent(admin, eventId))) return { error: forbidden('Forbidden'), event: null };
  return { error: null, event };
}

/** GET /api/admin/events/:eventId/people-media */
export async function GET(request: Request, context: { params: Promise<{ event_id: string }> }) {
  try {
    const [params, pathError] = parseParams(await context.params, paramsSchema);
    if (pathError) return pathError;
    const auth = await requireAdmin(request, params.event_id);
    if (auth.error || !auth.event) return auth.error;

    const [query, queryError] = parseQuery(new URL(request.url).searchParams, eventPeopleMediaQuerySchema);
    if (queryError) return queryError;
    const result = await listEventPeopleMedia({
      eventId: params.event_id,
      page: query.page,
      limit: query.limit,
      status: query.status ?? null,
    });
    return ok({
      data: {
        event: auth.event,
        counts: result.counts,
        media: result.items,
        face_references: result.face_references,
      },
      meta: {
        total: result.total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.max(1, Math.ceil(result.total / query.limit)),
      },
    });
  } catch (error) {
    console.error('GET /api/admin/events/[event_id]/people-media', error);
    return serverError('Unable to load people media');
  }
}

/** POST /api/admin/events/:eventId/people-media — requeue one failed asset or face reference. */
export async function POST(request: Request, context: { params: Promise<{ event_id: string }> }) {
  try {
    const [params, pathError] = parseParams(await context.params, paramsSchema);
    if (pathError) return pathError;
    const auth = await requireAdmin(request, params.event_id);
    if (auth.error) return auth.error;
    const [body, bodyError] = await parseBody(request, peopleMediaRetrySchema);
    if (bodyError) return bodyError;

    if (body.media_asset_id) {
      const queued = await requeueMediaAsset(params.event_id, body.media_asset_id);
      if (!queued) return notFound('Media not found');
      return ok({ media_asset_id: body.media_asset_id, processing_status: 'pending' }, 'Media queued', 202);
    }
    const queued = await requeueFaceReference(params.event_id, body.user_id!);
    if (!queued) return notFound('Face reference not found');
    return ok({ user_id: body.user_id, processing_status: 'pending' }, 'Face reference queued', 202);
  } catch (error) {
    console.error('POST /api/admin/events/[event_id]/people-media', error);
    return serverError('Unable to queue processing');
  }
}
