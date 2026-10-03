import prisma from '@/server/prisma';

export interface EventExploreCategoryName {
  id: string;
  title: string;
  description: string | null;
  background_url: string | null;
}

/**
 * Get distinct explore category names for an event (before-event explore categories).
 * Uses event_explore_items → explore_items → explore_categories for the given event_id.
 * Returns only active event explore items.
 */
export async function getEventExploreCategoryNames(
  event_id: string
): Promise<EventExploreCategoryName[]> {
  const rows = await prisma.event_explore_items.findMany({
    where: { event_id, is_active: true },
    select: {
      explore_items: {
        select: {
          explore_categories: {
            select: { id: true, title: true, description: true, background_url: true },
          },
        },
      },
    },
  });

  const byId = new Map<string, EventExploreCategoryName>();
  for (const row of rows) {
    const cat = row.explore_items?.explore_categories;
    if (cat && !byId.has(cat.id)) {
      byId.set(cat.id, {
        id: cat.id,
        title: cat.title,
        description: cat.description,
        background_url: cat.background_url,
      });
    }
  }

  return Array.from(byId.values());
}
