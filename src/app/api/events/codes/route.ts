import { ok, serverError } from '@/lib/api-response';
import prisma from '@/server/prisma';

/**
 * GET /api/events/codes
 * Returns a list of upcoming / ongoing events with their event codes.
 */
export async function GET() {
  try {
    const now = new Date();
    const events = await prisma.events.findMany({
      where: {
        start_date: { lte: now },
        end_date: { gte: now },
      },
      select: {
        id: true,
        event_code: true,
        title: true,
        start_date: true,
        end_date: true,
      },
      orderBy: { start_date: 'asc' },
    });

    return ok({ data: events });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event codes');
  }
}

