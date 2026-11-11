import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import {
  buildAccessibleEventsWhere,
  buildMasterDataWhere,
  type AdminAccessContext,
} from '@/server/access';

export type DashboardStats = {
  eventsByStatus: { status: string; count: number }[];
  eventsCreatedByMonth: { month: string; count: number }[];
  /** Events with at least one assigned event admin, highest counts first (max 15). */
  assignedAdminsPerEvent: { title: string; count: number }[];
  totals: {
    events: number;
    venues: number;
    exploreCategories: number;
    exploreItems: number;
    /** Rows in `event_admins` for events in this dashboard scope. */
    totalEventAdminAssignments: number;
    superAdmins?: number;
    eventAdmins?: number;
  };
};

export type DashboardDateRange = {
  start: Date;
  end: Date;
};

function monthStartUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function monthEndUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function monthLabelForDateUTC(date: Date): string {
  const monthStart = monthStartUTC(date);
  return monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function monthBinsForRange(dateRange: DashboardDateRange): {
  month: string;
  effectiveStart: Date;
  effectiveEnd: Date;
}[] {
  const { start, end } = dateRange;
  const bins: { month: string; effectiveStart: Date; effectiveEnd: Date }[] = [];

  let cursor = monthStartUTC(start);
  // Ensure at least one iteration even if `start` and `end` are in the same month.
  while (cursor.getTime() <= end.getTime()) {
    const binStart = cursor;
    const binEnd = monthEndUTC(cursor);

    const effectiveStart = new Date(Math.max(binStart.getTime(), start.getTime()));
    const effectiveEnd = new Date(Math.min(binEnd.getTime(), end.getTime()));

    if (effectiveStart.getTime() <= effectiveEnd.getTime()) {
      bins.push({
        month: monthLabelForDateUTC(cursor),
        effectiveStart,
        effectiveEnd,
      });
    }

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  }

  return bins;
}

function andWhere<T extends Record<string, unknown>>(
  base: T,
  extra: T
): T {
  const baseKeys = Object.keys(base);
  const extraKeys = Object.keys(extra);
  if (baseKeys.length === 0) return extra;
  if (extraKeys.length === 0) return base;
  return { AND: [base, extra] } as unknown as T;
}

/**
 * Aggregates for the admin dashboard scoped to the authenticated admin's tier, tenant, and assignments.
 */
export async function getDashboardStats(
  viewer: AdminAccessContext,
  dateRange: DashboardDateRange
): Promise<DashboardStats> {
  const eventWhere = buildAccessibleEventsWhere(viewer);
  const createdRange: Prisma.eventsWhereInput = {
    created_at: { gte: dateRange.start, lte: dateRange.end },
  };
  const eventWhereWithDate = andWhere(eventWhere, createdRange);

  const masterWhere = buildMasterDataWhere(viewer);
  const venuesWhere = andWhere(
    masterWhere as Prisma.venuesWhereInput,
    { created_at: { gte: dateRange.start, lte: dateRange.end } }
  );
  const categoriesWhere = andWhere(
    masterWhere as Prisma.explore_categoriesWhereInput,
    { created_at: { gte: dateRange.start, lte: dateRange.end } }
  );

  const monthBins = monthBinsForRange(dateRange);

  const [
    eventsInRange,
    venuesInRange,
    exploreCategoriesInRange,
    exploreItemsInRange,
    totalEventAdminAssignmentsInRange,
  ] = await Promise.all([
    prisma.events.findMany({
      where: eventWhereWithDate,
      select: {
        title: true,
        status: true,
        created_at: true,
        _count: { select: { event_admins: true } },
      },
    }),
    prisma.venues.count({ where: venuesWhere }),
    prisma.explore_categories.count({ where: categoriesWhere }),
    prisma.explore_items.count({
      where: {
        created_at: { gte: dateRange.start, lte: dateRange.end },
        ...(Object.keys(masterWhere).length > 0 ? { explore_categories: masterWhere } : {}),
      },
    }),
    prisma.event_admins.count({
      where: { events: eventWhereWithDate },
    }),
  ]);

  const statusMap = new Map<string, number>();
  const monthBuckets = monthBins.map((bin) => ({
    month: bin.month,
    startMs: bin.effectiveStart.getTime(),
    endMs: bin.effectiveEnd.getTime(),
    count: 0,
  }));
  const adminCounts: { title: string; count: number }[] = [];

  for (const ev of eventsInRange) {
    statusMap.set(ev.status, (statusMap.get(ev.status) ?? 0) + 1);
    if (ev.created_at) {
      const ts = ev.created_at.getTime();
      for (const bucket of monthBuckets) {
        if (ts >= bucket.startMs && ts <= bucket.endMs) {
          bucket.count += 1;
          break;
        }
      }
    }
    if (ev._count.event_admins > 0) {
      adminCounts.push({ title: ev.title, count: ev._count.event_admins });
    }
  }

  const totalEventsInRange = eventsInRange.length;
  const monthCounts = monthBuckets.map(({ month, count }) => ({ month, count }));
  const assignedAdminsPerEvent = adminCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const eventsByStatus = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const totals: DashboardStats['totals'] = {
    events: totalEventsInRange,
    venues: venuesInRange,
    exploreCategories: exploreCategoriesInRange,
    exploreItems: exploreItemsInRange,
    totalEventAdminAssignments: totalEventAdminAssignmentsInRange,
  };

  if (viewer.tier === 'super_admin') {
    const [superAdmins, eventAdmins] = await Promise.all([
      prisma.users.count({
        where: {
          is_active: true,
          created_at: { gte: dateRange.start, lte: dateRange.end },
          roles: { name: 'super_admin' },
        },
      }),
      prisma.users.count({
        where: {
          is_active: true,
          created_at: { gte: dateRange.start, lte: dateRange.end },
          roles: { name: { in: ['client_admin', 'event_admin'] } },
        },
      }),
    ]);
    totals.superAdmins = superAdmins;
    totals.eventAdmins = eventAdmins;
  }

  return {
    eventsByStatus,
    eventsCreatedByMonth: monthCounts,
    assignedAdminsPerEvent,
    totals,
  };
}
