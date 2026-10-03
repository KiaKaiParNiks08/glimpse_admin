import { NextRequest } from 'next/server';
import { ok, badRequest, forbidden, notFound, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import prisma from '@/server/prisma';
import { isEventAdminAssigned } from '@/server/events';
import { deleteEventDayMediaById } from '@/server/event-day-media';

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * DELETE /api/admin/events/[event_id]/days/[event_day_id]/media/[media_id]
 * Deletes the DB row + underlying S3 object (by media_key).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ event_id: string; event_day_id: string; media_id: string }> }
) {
  try {
    const admin = getAdminFromAuthorizationHeader(request);
    if (!admin) return forbidden('Not authenticated');

    const params = await context.params;
    const eventId = params.event_id;
    const eventDayId = params.event_day_id;
    const mediaId = params.media_id;
    if (!isUuid(eventId) || !isUuid(eventDayId) || !isUuid(mediaId)) return badRequest('Invalid id');

    if (admin.role_name === 'event_admin') {
      const allowed = await isEventAdminAssigned(eventId, admin.id);
      if (!allowed) return notFound('Event not found');
    }

    // Validate nested ownership: media -> day -> event
    const media = await prisma.event_day_media.findFirst({
      where: { id: mediaId, event_day_id: eventDayId, event_days: { event_id: eventId } },
      select: { id: true },
    });
    if (!media) return notFound('Media not found');

    const deleted = await deleteEventDayMediaById(mediaId);
    if (!deleted) return notFound('Media not found');
    return ok({});
  } catch (e) {
    console.error(e);
    return serverError('Unable to delete media');
  }
}

