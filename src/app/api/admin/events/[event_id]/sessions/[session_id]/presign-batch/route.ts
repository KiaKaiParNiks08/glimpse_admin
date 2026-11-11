import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, badRequest, forbidden, notFound, serverError } from '@/lib/api-response';
import { canContextAccessEvent, getAdminContextFromRequest } from '@/server/access';
import { createPresignedUpload } from '@/lib/s3-presign';
import {
  getMediaKind,
  resolveUploadMime,
  validateDeclaredVideoDuration,
  validateMediaFile,
} from '@/lib/upload-rules';
import prisma from '@/server/prisma';

const itemSchema = z.object({
  filename: z.string().trim().min(1).max(500),
  contentType: z.string().trim().max(200).optional().default(''),
  fileSize: z.number().int().min(1),
  videoDurationSec: z.number().finite().optional(),
});

const batchSchema = z.object({
  files: z.array(itemSchema).min(1).max(30),
});

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * POST /api/admin/events/[event_id]/sessions/[session_id]/presign-batch
 * Validates permissions and session once, then signs up to 30 S3 upload URLs in parallel.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ event_id: string; session_id: string }> }
) {
  try {
    const ctx = await getAdminContextFromRequest(request);
    if (!ctx) return forbidden('Not authenticated');
    if (!ctx.hasPermission('media.upload')) {
      return forbidden('Forbidden: media upload is disabled for your role or plan');
    }

    const { event_id: eventId, session_id: sessionId } = await context.params;
    if (!isUuid(eventId) || !isUuid(sessionId)) {
      return badRequest('Invalid event or session id');
    }

    const [allowed, session] = await Promise.all([
      canContextAccessEvent(ctx, eventId),
      prisma.event_sessions.findFirst({
        where: { id: sessionId, event_days: { event_id: eventId } },
        select: { id: true },
      }),
    ]);
    if (!allowed) return notFound('Event not found');
    if (!session) return notFound('Session not found');

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return badRequest('Invalid JSON body');
    }

    const parsed = batchSchema.safeParse(json);
    if (!parsed.success) {
      return badRequest('Invalid batch presign payload');
    }

    const prefix = `events/${eventId}/sessions/${session.id}`;
    const results = await Promise.all(
      parsed.data.files.map(async (file) => {
        const mime = resolveUploadMime(file.contentType, file.filename);
        const kind = getMediaKind(mime);
        if (kind !== 'image' && kind !== 'video') {
          return { ok: false as const, error: `Unsupported file type: ${file.filename}` };
        }
        const sizeErr = validateMediaFile({ type: mime, size: file.fileSize }, kind);
        if (sizeErr) {
          return { ok: false as const, error: sizeErr };
        }
        if (kind === 'video') {
          const durErr = validateDeclaredVideoDuration(file.videoDurationSec);
          if (durErr) return { ok: false as const, error: durErr };
        }
        try {
          const signed = await createPresignedUpload(file.filename, mime, prefix);
          return { ok: true as const, ...signed };
        } catch (err) {
          return {
            ok: false as const,
            error: err instanceof Error ? err.message : 'Presign failed',
          };
        }
      })
    );

    return ok({ items: results });
  } catch (e) {
    console.error('[POST presign-batch]', e);
    return serverError('Batch presign failed');
  }
}
