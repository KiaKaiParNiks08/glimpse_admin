import { ok, serverError } from '@/lib/api-response';
import { isFaceWorkerAuthorized } from '@/lib/face-worker-auth';
import { processFaceQueue } from '@/server/people-media/process-batch';

/** POST /api/internal/media/process — worker entry. Header x-face-worker-secret. */
export async function POST(request: Request) {
  if (!isFaceWorkerAuthorized(request)) {
    return new Response(JSON.stringify({ message: 'Not authenticated', data: null }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    const result = await processFaceQueue();
    return ok(result, 'Processed');
  } catch (error) {
    console.error('POST /api/internal/media/process', error);
    return serverError('Unable to process media faces');
  }
}
