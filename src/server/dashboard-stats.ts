import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import type { AdminRoleName } from '@/lib/rbac';

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

function eventWhereForViewer(
  role_name: AdminRoleName,
  viewer_user_id: string
): Prisma.eventsWhereInput {
  if (role_name === 'event_admin') {
    return { event_admins: { some: { user_id: viewer_user_id } } };
  }
  return {};
}

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

/**
 * Aggregates for the admin dashboard. Event admins only see stats for events they are assigned to.
 */
export async function getDashboardStats(viewer: {
  id: string;
  role_name: AdminRoleName;
}, dateRange: DashboardDateRange): Promise<DashboardStats> {
  const eventWhere = eventWhereForViewer(viewer.role_name, viewer.id);
  const eventWhereWithDate: Prisma.eventsWhereInput = {
    ...eventWhere,
    created_at: { gte: dateRange.start, lte: dateRange.end },
  };

  const monthBins = monthBinsForRange(dateRange);

  const [
    statusGroups,
    monthCounts,
    totalEventsInRange,
    venuesInRange,
    exploreCategoriesInRange,
    exploreItemsInRange,
    eventsWithAdminCountsInRange,
    totalEventAdminAssignmentsInRange,
  ] = await Promise.all([
    prisma.events.groupBy({
      by: ['status'],
      where: eventWhereWithDate,
      _count: { _all: true },
    }),
    Promise.all(
      monthBins.map(async (bin) => {
        const count = await prisma.events.count({
          where: {
            ...eventWhere,
            created_at: { gte: bin.effectiveStart, lte: bin.effectiveEnd },
          },
        });
        return { month: bin.month, count };
      }),
    ),
    prisma.events.count({ where: eventWhereWithDate }),
    prisma.venues.count({
      where: {
        created_at: { gte: dateRange.start, lte: dateRange.end },
      },
    }),
    prisma.explore_categories.count({
      where: {
        created_at: { gte: dateRange.start, lte: dateRange.end },
      },
    }),
    prisma.explore_items.count({
      where: {
        created_at: { gte: dateRange.start, lte: dateRange.end },
      },
    }),
    prisma.events.findMany({
      where: eventWhereWithDate,
      select: {
        title: true,
        _count: { select: { event_admins: true } },
      },
    }),
    prisma.event_admins.count({
      where: { events: eventWhereWithDate },
    }),
  ]);

  const assignedAdminsPerEvent = eventsWithAdminCountsInRange
    .filter((e) => e._count.event_admins > 0)
    .map((e) => ({ title: e.title, count: e._count.event_admins }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const eventsByStatus = statusGroups
    .map((g) => ({ status: g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const totals: DashboardStats['totals'] = {
    events: totalEventsInRange,
    venues: venuesInRange,
    exploreCategories: exploreCategoriesInRange,
    exploreItems: exploreItemsInRange,
    totalEventAdminAssignments: totalEventAdminAssignmentsInRange,
  };

  if (viewer.role_name === 'super_admin') {
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
          roles: { name: 'event_admin' },
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
