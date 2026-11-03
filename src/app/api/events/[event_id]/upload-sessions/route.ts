import { z } from 'zod';
import { badRequest, forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { uuidSchema } from '@/lib/validations/common';
import { parseParams } from '@/lib/validations';
import { createUploadSession } from '@/server/upload-sessions';
import prisma from '@/server/prisma';

const paramsSchema = z.object({
  event_id: uuidSchema,
});

const createUploadSessionSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  file_size: z.coerce.number().int().min(1).max(100 * 1024 * 1024), // Up to 100 MB
  content_type: z.string().trim().min(1).max(100),
  purpose: z.enum(['feed_media', 'feed_thumbnail', 'session_media', 'session_thumbnail']),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/events/{event_id}/upload-sessions
 * Initializes a new chunked upload session for a file.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ event_id: string }> }
) {
  try {
    const [params, pathErr] = parseParams(await context.params, paramsSchema);
    if (pathErr) return pathErr;

    const user = getUserFromAuthorizationHeader(request);
    const admin = getAdminFromAuthorizationHeader(request);
    if (!user && !admin) return forbidden('Not authenticated');

    if (user && user.event_id !== params.event_id) {
      return forbidden('This login is for a different event');
    }

    const event = await prisma.events.findUnique({
      where: { id: params.event_id },
      select: { id: true },
    });
    if (!event) return notFound('Event not found');

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return badRequest('Expected JSON body');
    }

    const parsed = createUploadSessionSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return badRequest('Invalid upload session parameters', parsed.error.flatten().fieldErrors);
    }

    const session = await createUploadSession({
      userId: user ? user.id : admin!.id,
      eventId: params.event_id,
      filename: parsed.data.filename,
      fileSizeBytes: parsed.data.file_size,
      contentType: parsed.data.content_type,
      purpose: parsed.data.purpose,
      meta: parsed.data.meta,
    });

    return ok(
      {
        upload_id: session.upload_id,
        chunk_size: session.chunk_size,
        next_chunk_index: session.next_chunk_index,
        data: {
          upload_id: session.upload_id,
          chunk_size: session.chunk_size,
        },
      },
      'Upload session created'
    );
  } catch (error) {
    console.error('[POST upload-sessions]', error);
    return serverError('Unable to create upload session');
  }
}
