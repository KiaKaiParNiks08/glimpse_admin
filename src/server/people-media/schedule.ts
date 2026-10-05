import { after } from 'next/server';
import { processFaceQueue } from './process-batch';

const MAX_ROUNDS = 20;
const TIME_BUDGET_MS = 25_000;

/**
 * Run the face queue after the upload response is sent.
 * Vercel has no long-running worker, so this replaces `npm run faces:process` for each upload.
 * A daily cron retries anything this pass does not finish.
 */
export function scheduleFaceProcessing(): void {
  after(async () => {
    const started = Date.now();
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        const result = await processFaceQueue();
        const done = result.media_processed + result.references_processed;
        const failed = result.media_failed + result.references_failed;
        if (done === 0 && failed === 0) break;
      }
    } catch (error) {
      console.error('[people-media] scheduled processing failed', error);
    }
  });
}
