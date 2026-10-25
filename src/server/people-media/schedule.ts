import { after } from 'next/server';
import { processFaceQueue } from './process-batch';
import { continueRecognitionChain, hasPendingRecognitionWork } from './queue';

/**
 * Kick the durable Postgres queue after a response. Remaining work is chained
 * to POST /api/internal/media/process so one request does not run every comparison.
 */
export function scheduleFaceProcessing(): void {
  const run = async () => {
    try {
      const result = await processFaceQueue({ timeBudgetMs: 12_000 });
      if (result.has_more || (await hasPendingRecognitionWork())) {
        await continueRecognitionChain(0);
      }
    } catch (error) {
      console.error('[people-media] processing failed', error);
    }
  };
  try {
    after(run);
  } catch (error) {
    console.error('[people-media] after() unavailable; cron/worker must drain the queue', error);
  }
}
