/** Column width in the people-in-media migration. Changing it needs a new migration. */
export const FACE_EMBEDDING_DIM = 128;

export const FACE_CONSENT_VERSION = 'v1';

export function faceMatchMinSimilarity(): number {
  const n = Number(process.env.FACE_MATCH_MIN_SIMILARITY ?? '0.6');
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0.6;
  return n;
}

export function faceMaxAttempts(): number {
  const n = Number(process.env.FACE_MAX_ATTEMPTS ?? '3');
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(10, Math.floor(n));
}

export function faceWorkerBatchSize(): number {
  const n = Number(process.env.FACE_WORKER_BATCH ?? '2');
  if (!Number.isFinite(n) || n < 1) return 2;
  return Math.min(10, Math.floor(n));
}

export function faceProviderKind(): 'local' | 'http' {
  return process.env.FACE_PROVIDER === 'http' ? 'http' : 'local';
}

export function assertEmbeddingConfig(): void {
  const configured = Number(process.env.FACE_EMBEDDING_DIM ?? String(FACE_EMBEDDING_DIM));
  if (configured !== FACE_EMBEDDING_DIM) {
    throw new Error(
      `FACE_EMBEDDING_DIM must be ${FACE_EMBEDDING_DIM}. The vector column is fixed until a new migration.`
    );
  }
}
