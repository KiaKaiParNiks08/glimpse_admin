import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/api-response';
import { isFaceWorkerAuthorized, isVercelCronAuthorized } from '@/lib/face-worker-auth';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { uuidSchema } from '@/lib/validations/common';
import { backfillEventRecognition } from '@/server/people-media/event-backfill';
import { scheduleFaceProcessing } from '@/server/people-media/schedule';
import prisma from '@/server/prisma';

export const maxDuration = 60;

function authorized(request: Request): boolean {
  return Boolean(
    isFaceWorkerAuthorized(request) || isVercelCronAuthorized(request) || getAdminFromAuthorizationHeader(request)
  );
}

/**
 * POST /api/internal/media/backfill
 * Body: { event_id, dry_run?: boolean }. Queues work; does not run every CompareFaces call.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return unauthorized('Not authenticated');
  try {
    const body = (await request.json()) as { event_id?: string; dry_run?: boolean };
    const parsed = uuidSchema.safeParse(body.event_id);
    if (!parsed.success) return badRequest('Send event_id');
    const event = await prisma.events.findUnique({ where: { id: parsed.data }, select: { id: true } });
    if (!event) return notFound('Event not found');
    const summary = await backfillEventRecognition(parsed.data, { dryRun: body.dry_run === true });
    if (!summary.dry_run) scheduleFaceProcessing();
    return ok(summary, summary.dry_run ? 'Backfill dry run' : 'Backfill queued');
  } catch (error) {
    console.error('POST /api/internal/media/backfill', error);
    return serverError('Unable to backfill recognition');
  }
}
