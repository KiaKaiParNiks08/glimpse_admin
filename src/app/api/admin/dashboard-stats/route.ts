import { badRequest, forbidden, ok } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { getDashboardStats } from '@/server/dashboard-stats';
import { parseQuery } from '@/lib/validations';
import { z } from 'zod';

const dashboardStatsQuerySchema = z.object({
  range: z.enum(['last_1', 'last_3', 'last_6', 'custom']).optional().default('last_6'),
  from: z.string().optional(),
  to: z.string().optional(),
});

function parseUtcYmdToStartEnd(dateYmd: string): { start: Date; end: Date } {
  // Interpret YYYY-MM-DD as a UTC date (not local time).
  // Using Date.UTC avoids timezone shifts.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!match) return { start: new Date('Invalid'), end: new Date('Invalid') };

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  const start = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999));
  return { start, end };
}

export async function GET(request: Request) {
  const admin = getAdminFromAuthorizationHeader(request);
  if (!admin) return forbidden('Not authenticated');
  if (admin.role_name !== 'super_admin' && admin.role_name !== 'event_admin') {
    return forbidden('Forbidden');
  }

  const { searchParams } = new URL(request.url);
  const [query, err] = parseQuery(searchParams, dashboardStatsQuerySchema);
  if (err) return err;

  const { range, from, to } = query;

  let dateRange: { start: Date; end: Date };
  if (range === 'custom') {
    if (!from || !to) return badRequest('Custom range requires `from` and `to` (YYYY-MM-DD).');
    const parsedFrom = parseUtcYmdToStartEnd(from);
    const parsedTo = parseUtcYmdToStartEnd(to);
    if (Number.isNaN(parsedFrom.start.getTime()) || Number.isNaN(parsedTo.end.getTime())) {
      return badRequest('Invalid `from`/`to` date format. Expected YYYY-MM-DD.');
    }
    if (parsedFrom.start.getTime() > parsedTo.end.getTime()) {
      return badRequest('Invalid date range: `from` must be <= `to`.');
    }
    dateRange = { start: parsedFrom.start, end: parsedTo.end };
  } else {
    const months = range === 'last_1' ? 1 : range === 'last_3' ? 3 : 6;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    dateRange = { start, end };
  }

  const stats = await getDashboardStats({
    id: admin.id,
    role_name: admin.role_name,
  }, dateRange);

  return ok(stats, 'Success');
}
