import { NextResponse } from 'next/server';
import { badRequest, forbidden, notFound, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { getUploadSession, MAX_CHUNK_SIZE, saveUploadChunk } from '@/server/upload-sessions';

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

/**
 * PUT /api/events/{event_id}/upload-sessions/{upload_id}/chunks/{chunk_index}
 * Uploads a single raw binary chunk (application/octet-stream).
 * Idempotent: re-sending the same chunk_index overwrites/keeps without corruption.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ event_id: string; upload_id: string; chunk_index: string }> }
) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    const admin = getAdminFromAuthorizationHeader(request);
    if (!user && !admin) return forbidden('Not authenticated');

    const { event_id, upload_id, chunk_index } = await context.params;
    if (!isUuid(event_id) || !upload_id) {
      return badRequest('Invalid event or upload id');
    }

    const chunkIdx = Number.parseInt(chunk_index, 10);
    if (Number.isNaN(chunkIdx) || chunkIdx < 0) {
      return badRequest('chunk_index must be a non-negative integer');
    }

    const session = await getUploadSession(upload_id);
    if (!session || session.event_id !== event_id) {
      return notFound('Upload session not found');
    }

    const callerId = user ? user.id : admin!.id;
    if (session.user_id !== callerId && !admin) {
      return forbidden('Not your upload session');
    }

    if (chunkIdx >= session.total_chunks) {
      return badRequest(`chunk_index ${chunkIdx} exceeds total_chunks ${session.total_chunks}`);
    }

    const arrayBuffer = await request.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    if (bytes.length === 0) {
      return badRequest('Chunk payload is empty');
    }

    if (bytes.length > MAX_CHUNK_SIZE) {
      return NextResponse.json(
        { message: `Chunk size ${bytes.length} bytes exceeds maximum allowed ${MAX_CHUNK_SIZE} bytes`, data: null },
        { status: 413 }
      );
    }

    const result = await saveUploadChunk({
      uploadId: upload_id,
      chunkIndex: chunkIdx,
      bytes,
    });

    return NextResponse.json({
      received_bytes: result.received_bytes,
      next_chunk_index: result.next_chunk_index,
    });
  } catch (error) {
    console.error('[PUT upload chunk]', error);
    return serverError('Unable to process chunk');
  }
}
