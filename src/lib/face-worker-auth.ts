import { timingSafeEqual } from 'crypto';

/** Shared by middleware and the worker route. Does not import the database client. */
export function isFaceWorkerAuthorized(request: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.FACE_WORKER_SECRET ?? '';
  const header = request.headers.get('x-face-worker-secret') ?? '';
  if (!secret || !header) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(header);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
