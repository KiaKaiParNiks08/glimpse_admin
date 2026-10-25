import prisma from '@/server/prisma';
import { MAX_WORKER_CHAIN } from './recognition-policy';
import type { ProcessBatchResult } from './process-batch';

export type QueueHealth = {
  rekognition_configured: boolean;
  media: { pending: number; processing: number; ready: number; failed: number; incomplete: number };
  references: { pending: number; processing: number; ready: number; failed: number; revoked: number };
  scans: { pending: number; processing: number; complete: number; failed: number };
  matches: { rekognition: number; legacy: number; uploader_attributed: number; vector: number };
  oldest_pending_age_seconds: number | null;
  last_errors: Array<{ kind: string; id: string; last_error: string; updated_at: Date | null }>;
  assets_without_complete_scan: number;
  pending_scans_without_ready_reference: number;
};

function isRekognitionConfigured(): boolean {
  return Boolean(
    process.env.AWS_REGION?.trim() && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );
}

export async function hasPendingRecognitionWork(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT (
      (SELECT COUNT(*) FROM media_assets
        WHERE match_complete = false
          AND processing_status IN ('pending', 'processing', 'failed')
          AND (next_retry_at IS NULL OR next_retry_at <= now()))
      + (SELECT COUNT(*) FROM user_face_references
        WHERE consent = true AND revoked_at IS NULL AND storage_key IS NOT NULL
          AND processing_status IN ('pending', 'processing', 'failed')
          AND (next_retry_at IS NULL OR next_retry_at <= now()))
      + (SELECT COUNT(*) FROM user_event_face_scans
        WHERE status IN ('pending', 'processing', 'failed')
          AND (next_retry_at IS NULL OR next_retry_at <= now()))
    )::int AS n
  `;
  return (rows[0]?.n ?? 0) > 0;
}

function countBy(rows: { status: string; n: number }[], status: string): number {
  return rows.find((row) => row.status === status)?.n ?? 0;
}

export async function getQueueHealth(): Promise<QueueHealth> {
  const [media, references, scans, matches, oldest, mediaErrors, refErrors, scanErrors, incomplete, scansMissingRef] =
    await Promise.all([
      prisma.$queryRaw<{ status: string; n: number }[]>`
        SELECT processing_status AS status, COUNT(*)::int AS n
        FROM media_assets GROUP BY processing_status
      `,
      prisma.$queryRaw<{ status: string; n: number }[]>`
        SELECT processing_status AS status, COUNT(*)::int AS n
        FROM user_face_references GROUP BY processing_status
      `,
      prisma.$queryRaw<{ status: string; n: number }[]>`
        SELECT status, COUNT(*)::int AS n FROM user_event_face_scans GROUP BY status
      `,
      prisma.$queryRaw<{ match_source: string; n: number }[]>`
        SELECT match_source, COUNT(*)::int AS n FROM media_matches GROUP BY match_source
      `,
      prisma.$queryRaw<{ age: number | null }[]>`
        SELECT MIN(EXTRACT(EPOCH FROM (now() - updated_at)))::int AS age
        FROM (
          SELECT updated_at FROM media_assets WHERE processing_status = 'pending'
          UNION ALL
          SELECT updated_at FROM user_face_references WHERE processing_status = 'pending'
          UNION ALL
          SELECT updated_at FROM user_event_face_scans WHERE status = 'pending'
        ) q
      `,
      prisma.$queryRaw<{ id: string; last_error: string; updated_at: Date | null }[]>`
        SELECT id::text, left(COALESCE(last_error, ''), 180) AS last_error, updated_at
        FROM media_assets WHERE last_error IS NOT NULL ORDER BY updated_at DESC NULLS LAST LIMIT 5
      `,
      prisma.$queryRaw<{ id: string; last_error: string; updated_at: Date | null }[]>`
        SELECT user_id::text AS id, left(COALESCE(last_error, ''), 180) AS last_error, updated_at
        FROM user_face_references WHERE last_error IS NOT NULL ORDER BY updated_at DESC NULLS LAST LIMIT 5
      `,
      prisma.$queryRaw<{ id: string; last_error: string; updated_at: Date | null }[]>`
        SELECT (user_id::text || ':' || event_id::text) AS id, left(COALESCE(last_error, ''), 180) AS last_error, updated_at
        FROM user_event_face_scans WHERE last_error IS NOT NULL ORDER BY updated_at DESC NULLS LAST LIMIT 5
      `,
      prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM media_assets WHERE match_complete = false
      `,
      prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n
        FROM user_event_face_scans s
        JOIN user_face_references r ON r.user_id = s.user_id
        WHERE s.status IN ('pending', 'failed') AND r.processing_status <> 'ready'
      `,
    ]);

  const matchCount = (source: string) => matches.find((row) => row.match_source === source)?.n ?? 0;
  const last_errors = [
    ...mediaErrors.map((row) => ({ kind: 'media', ...row })),
    ...refErrors.map((row) => ({ kind: 'reference', ...row })),
    ...scanErrors.map((row) => ({ kind: 'scan', ...row })),
  ]
    .sort((a, b) => (b.updated_at?.getTime() ?? 0) - (a.updated_at?.getTime() ?? 0))
    .slice(0, 8);

  return {
    rekognition_configured: isRekognitionConfigured(),
    media: {
      pending: countBy(media, 'pending'),
      processing: countBy(media, 'processing'),
      ready: countBy(media, 'ready'),
      failed: countBy(media, 'failed'),
      incomplete: incomplete[0]?.n ?? 0,
    },
    references: {
      pending: countBy(references, 'pending'),
      processing: countBy(references, 'processing'),
      ready: countBy(references, 'ready'),
      failed: countBy(references, 'failed'),
      revoked: countBy(references, 'revoked'),
    },
    scans: {
      pending: countBy(scans, 'pending'),
      processing: countBy(scans, 'processing'),
      complete: countBy(scans, 'complete'),
      failed: countBy(scans, 'failed'),
    },
    matches: {
      rekognition: matchCount('rekognition'),
      legacy: matchCount('legacy'),
      uploader_attributed: matchCount('uploader_attributed'),
      vector: matchCount('vector'),
    },
    oldest_pending_age_seconds: oldest[0]?.age ?? null,
    last_errors,
    assets_without_complete_scan: incomplete[0]?.n ?? 0,
    pending_scans_without_ready_reference: scansMissingRef[0]?.n ?? 0,
  };
}

export function workerHasMore(result: ProcessBatchResult & { has_more: boolean }): boolean {
  return result.has_more;
}

export function workerBaseUrl(): string | null {
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  const base = process.env.APP_BASE_URL?.trim() || process.env.APP_PUBLIC_URL?.trim();
  return base ? base.replace(/\/$/, '') : null;
}

export function workerAuthHeaders(): Record<string, string> {
  const secret = process.env.FACE_WORKER_SECRET?.trim();
  if (secret) return { 'x-face-worker-secret': secret };
  const cron = process.env.CRON_SECRET?.trim();
  if (cron) return { authorization: `Bearer ${cron}` };
  return {};
}

export async function continueRecognitionChain(chain: number): Promise<void> {
  if (chain >= MAX_WORKER_CHAIN) {
    console.error('[people-media] worker chain limit reached', chain);
    return;
  }
  if (!(await hasPendingRecognitionWork())) return;
  const base = workerBaseUrl();
  const headers = workerAuthHeaders();
  if (!base || Object.keys(headers).length === 0) {
    console.error('[people-media] cannot continue worker: missing APP_BASE_URL/VERCEL_URL or FACE_WORKER_SECRET/CRON_SECRET');
    return;
  }
  const response = await fetch(`${base}/api/internal/media/process?chain=${chain + 1}`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) {
    console.error('[people-media] worker continue failed', response.status);
  }
}
