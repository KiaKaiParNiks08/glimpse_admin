import { ok, serverError } from '@/lib/api-response';
import { isFaceWorkerAuthorized, isVercelCronAuthorized } from '@/lib/face-worker-auth';
import { processFaceQueue } from '@/server/people-media/process-batch';

export const maxDuration = 60;

async function runQueue(request: Request) {
  if (!isFaceWorkerAuthorized(request) && !isVercelCronAuthorized(request)) {
    return new Response(JSON.stringify({ message: 'Not authenticated', data: null }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    const result = await processFaceQueue();
    return ok(result, 'Processed');
  } catch (error) {
    console.error('/api/internal/media/process', error);
    return serverError('Unable to process media faces');
  }
}

/** POST /api/internal/media/process — worker entry. Header x-face-worker-secret. */
export async function POST(request: Request) {
  return runQueue(request);
}

/** GET /api/internal/media/process — Vercel Cron. Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request) {
  return runQueue(request);
}
