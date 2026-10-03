import prisma from '@/server/prisma';
import type { Prisma } from '@prisma/client';

export interface ExploreItemRow {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
}

/**
 * Get explore item list for the given event_id and explore_category_id.
 * Returns items that are linked to the event (event_explore_items) and belong to the category.
 * Includes all explore_items columns except category_id, created_at, updated_at.
 */
export async function getExploreItemsByEventAndCategory(
  event_id: string,
  explore_category_id: string
): Promise<ExploreItemRow[]> {
  const rows = await prisma.event_explore_items.findMany({
    where: {
      event_id,
      is_active: true,
      explore_items: {
        category_id: explore_category_id,
      },
    },
    select: {
      explore_items: {
        select: {
          id: true,
          title: true,
          description: true,
          address: true,
          city: true,
          state: true,
          country: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });

  return rows
    .map((r) => r.explore_items)
    .filter((item): item is ExploreItemRow => item != null);
}
