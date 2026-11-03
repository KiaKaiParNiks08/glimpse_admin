import { badRequest, forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { getUploadSession } from '@/server/upload-sessions';

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

/**
 * GET /api/events/{event_id}/upload-sessions/{upload_id}
 * Inspect upload session status and current contiguous chunk progress.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ event_id: string; upload_id: string }> }
) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    const admin = getAdminFromAuthorizationHeader(request);
    if (!user && !admin) return forbidden('Not authenticated');

    const { event_id, upload_id } = await context.params;
    if (!isUuid(event_id) || !upload_id) {
      return badRequest('Invalid event or upload id');
    }

    const session = await getUploadSession(upload_id);
    if (!session || session.event_id !== event_id) {
      return notFound('Upload session not found');
    }

    const callerId = user ? user.id : admin!.id;
    if (session.user_id !== callerId && !admin) {
      return forbidden('Not your upload session');
    }

    return ok({
      upload_id: session.id,
      chunk_size: session.chunk_size,
      total_chunks: session.total_chunks,
      received_bytes: Number(session.received_bytes),
      next_chunk_index: session.next_chunk_index,
      file_size: Number(session.file_size),
      status: session.status,
      filename: session.filename,
      content_type: session.content_type,
    });
  } catch (error) {
    console.error('[GET upload-session]', error);
    return serverError('Unable to fetch upload session');
  }
}
