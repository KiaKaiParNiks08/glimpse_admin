import { after } from 'next/server';
import { processFaceQueue } from './process-batch';

/**
 * Enqueue recognition without blocking the upload/profile response.
 * Cron and `npm run faces:process` drain the rest of the queue.
 */
export function scheduleFaceProcessing(): void {
  const run = () =>
    processFaceQueue({ timeBudgetMs: 8_000 }).catch((error) => {
      console.error('[people-media] processing failed', error);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}
