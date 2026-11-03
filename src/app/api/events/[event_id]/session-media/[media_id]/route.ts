import { badRequest, forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { deleteEventDayMediaById } from '@/server/event-day-media';
import prisma from '@/server/prisma';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * DELETE /api/events/{event_id}/session-media/{media_id}
 * Alias endpoint allowing deletion by event_id and media_id directly.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ event_id: string; media_id: string }> }
) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    const admin = getAdminFromAuthorizationHeader(request);
    if (!user && !admin) return forbidden('Not authenticated');

    const { event_id, media_id } = await context.params;
    if (!isUuid(event_id) || !isUuid(media_id)) {
      return badRequest('Invalid event or media id');
    }
    if (user && user.event_id !== event_id) return forbidden('This login is for a different event');

    const media = await prisma.event_day_media.findFirst({
      where: {
        id: media_id,
        event_days: { event_id },
      },
      select: { id: true, uploaded_by: true, event_session_id: true },
    });
    if (!media) return notFound('Media not found');

    const isOwner = Boolean(user && media.uploaded_by === user.id);
    const isAdmin = Boolean(admin);

    if (!isOwner && !isAdmin) {
      return forbidden('You can only delete media you uploaded');
    }

    await deleteEventDayMediaById(media.id);
    return ok({ id: media.id }, 'Media deleted');
  } catch (error) {
    console.error(error);
    return serverError('Unable to delete session media');
  }
}
