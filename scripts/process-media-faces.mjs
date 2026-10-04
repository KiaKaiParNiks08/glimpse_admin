require('dotenv').config();

const secret = process.env.FACE_WORKER_SECRET;
const base = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

if (!secret) {
  console.error('Set FACE_WORKER_SECRET in the environment before running the face worker.');
  process.exit(1);
}

async function runBatch() {
  const response = await fetch(`${base}/api/internal/media/process`, {
    method: 'POST',
    headers: { 'x-face-worker-secret': secret },
  });
  const body = await response.json();
  if (!response.ok) {
    console.error(body);
    process.exit(1);
  }
  return body.data ?? {};
}

async function main() {
  for (let round = 0; round < 50; round += 1) {
    const data = await runBatch();
    const done = (data.media_processed ?? 0) + (data.references_processed ?? 0);
    const failed = (data.media_failed ?? 0) + (data.references_failed ?? 0);
    console.log(`batch ${round + 1}: processed ${done}, failed ${failed}`);
    if (done === 0 && failed === 0) return;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
