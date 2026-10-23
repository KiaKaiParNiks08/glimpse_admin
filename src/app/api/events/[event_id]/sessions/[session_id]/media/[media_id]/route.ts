import { badRequest, forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { deleteEventDayMediaById } from '@/server/event-day-media';
import { sessionIdsViewerCanUpload } from '@/server/session-uploaders';
import prisma from '@/server/prisma';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * DELETE /api/events/{event_id}/sessions/{session_id}/media/{media_id}
 * The signed-in uploader may delete only media they uploaded to a session they can upload to.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ event_id: string; session_id: string; media_id: string }> }
) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    if (!user) return forbidden('Not authenticated');

    const { event_id, session_id, media_id } = await context.params;
    if (!isUuid(event_id) || !isUuid(session_id) || !isUuid(media_id)) {
      return badRequest('Invalid event, session, or media id');
    }
    if (user.event_id !== event_id) return forbidden('This login is for a different event');

    const media = await prisma.event_day_media.findFirst({
      where: {
        id: media_id,
        event_session_id: session_id,
        event_days: { event_id },
      },
      select: { id: true, uploaded_by: true },
    });
    if (!media) return notFound('Media not found');

    const allowed = await sessionIdsViewerCanUpload([session_id], user.id);
    if (!allowed.has(session_id) || media.uploaded_by !== user.id) {
      return forbidden('You can only delete media you uploaded to this session');
    }

    await deleteEventDayMediaById(media.id);
    return ok({ id: media.id }, 'Media deleted');
  } catch (error) {
    console.error(error);
    return serverError('Unable to delete session media');
  }
}
