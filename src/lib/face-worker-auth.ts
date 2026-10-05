import { timingSafeEqual } from 'crypto';

function secretsMatch(secret: string, presented: string): boolean {
  if (!secret || !presented) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(presented);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Shared by middleware and the worker route. Does not import the database client. */
export function isFaceWorkerAuthorized(request: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.FACE_WORKER_SECRET ?? '';
  const header = request.headers.get('x-face-worker-secret') ?? '';
  return secretsMatch(secret, header);
}

/** Vercel Cron sends Authorization: Bearer <CRON_SECRET>. It cannot set a custom header. */
export function isVercelCronAuthorized(request: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  return secretsMatch(secret, token);
}
