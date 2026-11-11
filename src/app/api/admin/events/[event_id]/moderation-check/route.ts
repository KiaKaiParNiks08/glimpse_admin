import { z } from 'zod';
import { badRequest, forbidden, ok, serverError } from '@/lib/api-response';
import { parseParams } from '@/lib/validations';
import { uuidSchema } from '@/lib/validations/common';
import { canContextAccessEvent, getAdminContextFromRequest } from '@/server/access';
import { detectExplicit18PlusContent } from '@/server/moderation';

export const maxDuration = 60;

const paramsSchema = z.object({ event_id: uuidSchema });
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_FRAMES = 5;

/**
 * POST /api/admin/events/[event_id]/moderation-check
 * Multipart form-data containing up to 5 sampled JPEG frames ("frames" or "frame").
 * Returns { allowed: boolean, reason?: string | null, labels?: string[] }.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ event_id: string }> }
) {
  try {
    const [params, pathError] = parseParams(await context.params, paramsSchema);
    if (pathError) return pathError;

    const ctx = await getAdminContextFromRequest(request);
    if (!ctx) return forbidden('Not authenticated');
    if (!ctx.hasPermission('media.upload')) {
      return forbidden('Forbidden: media upload is disabled for your role or plan');
    }
    if (!(await canContextAccessEvent(ctx, params.event_id))) {
      return forbidden('Forbidden');
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return badRequest('Invalid multipart form-data');
    }

    const frameBlobs: Blob[] = [];
    for (const [key, value] of formData.entries()) {
      if (key !== 'frames' && key !== 'frame' && !key.startsWith('frames[')) continue;
      if (value instanceof Blob && value.size > 0) {
        if (value.size > MAX_FRAME_BYTES) {
          return badRequest('Moderation preview frame exceeds 4 MB');
        }
        frameBlobs.push(value);
        if (frameBlobs.length >= MAX_FRAMES) break;
      }
    }

    if (frameBlobs.length === 0) {
      return ok({ allowed: true, reason: null, labels: [] });
    }

    for (const blob of frameBlobs) {
      const buf = Buffer.from(await blob.arrayBuffer());
      const verdict = await detectExplicit18PlusContent(buf);
      if (verdict.blocked) {
        return ok({
          allowed: false,
          reason: verdict.reason,
          labels: verdict.labels,
        });
      }
    }

    return ok({ allowed: true, reason: null, labels: [] });
  } catch (err) {
    console.error('[POST moderation-check]', err);
    return serverError('Unable to check media safety');
  }
}
