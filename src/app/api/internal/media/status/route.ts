import { ok, serverError, unauthorized } from '@/lib/api-response';
import { isFaceWorkerAuthorized, isVercelCronAuthorized } from '@/lib/face-worker-auth';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { ensurePeopleMediaSchema } from '@/server/people-media/ensure-schema';
import { getQueueHealth } from '@/server/people-media/queue';

export const maxDuration = 30;

/**
 * GET /api/internal/media/status
 * Queue health. FACE_WORKER_SECRET, CRON_SECRET, or admin JWT.
 */
export async function GET(request: Request) {
  if (!isFaceWorkerAuthorized(request) && !isVercelCronAuthorized(request) && !getAdminFromAuthorizationHeader(request)) {
    return unauthorized('Not authenticated');
  }
  try {
    await ensurePeopleMediaSchema();
    const queue = await getQueueHealth();
    return ok(queue);
  } catch (error) {
    console.error('GET /api/internal/media/status', error);
    return serverError('Unable to load recognition status');
  }
}
