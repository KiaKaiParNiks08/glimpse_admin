import { after } from 'next/server';
import { ok, serverError, unauthorized } from '@/lib/api-response';
import { isFaceWorkerAuthorized, isVercelCronAuthorized } from '@/lib/face-worker-auth';
import { processFaceQueue } from '@/server/people-media/process-batch';
import { continueRecognitionChain, getQueueHealth } from '@/server/people-media/queue';
import { MAX_WORKER_CHAIN } from '@/server/people-media/recognition-policy';

export const maxDuration = 60;

function authorized(request: Request): boolean {
  return isFaceWorkerAuthorized(request) || isVercelCronAuthorized(request);
}

async function runQueue(request: Request) {
  if (!authorized(request)) return unauthorized('Not authenticated');
  const url = new URL(request.url);
  const chain = Number(url.searchParams.get('chain') ?? '0');
  const stats = url.searchParams.get('stats') === '1';
  try {
    const result = await processFaceQueue({ timeBudgetMs: 45_000 });
    if (result.has_more && chain < MAX_WORKER_CHAIN) {
      after(() => continueRecognitionChain(Number.isFinite(chain) ? chain : 0));
    }
    if (stats) {
      const health = await getQueueHealth();
      return ok({ worker: result, queue: health }, 'Processed');
    }
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
