import { processFaceQueue } from './process-batch';

const MAX_ROUNDS = 8;
const TIME_BUDGET_MS = 20_000;

async function drainFaceQueue(): Promise<void> {
  const started = Date.now();
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const result = await processFaceQueue();
    const done = result.media_processed + result.references_processed;
    const failed = result.media_failed + result.references_failed;
    if (done === 0 && failed === 0) break;
  }
}

/**
 * Run face matching before the upload response returns.
 * The free Vercel plan does not keep a separate worker running.
 */
export async function scheduleFaceProcessing(): Promise<void> {
  try {
    await drainFaceQueue();
  } catch (error) {
    console.error('[people-media] processing failed', error);
  }
}
