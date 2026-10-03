import prisma from '@/server/prisma';
import type { EventHighlightRow } from '@/types';

export type { EventHighlightRow } from '@/types';

export type EventHighlightInsert = {
  title: string;
  description?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  display_order?: number | null;
};

/**
 * Get list of event highlights from event_highlights table for the given event_id.
 * Returns rows ordered by display_order then created_at.
 */
export async function getEventHighlightsByEventId(
  event_id: string
): Promise<EventHighlightRow[]> {
  const rows = await prisma.event_highlights.findMany({
    where: { event_id },
    orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
    select: {
      id: true,
      event_id: true,
      title: true,
      description: true,
      media_url: true,
      media_type: true,
      display_order: true,
    },
  });

  return rows;
}

/**
 * Replace all highlights for an event. Deletes existing and creates the given items.
 */
export async function setEventHighlights(
  event_id: string,
  items: EventHighlightInsert[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.event_highlights.deleteMany({ where: { event_id } });
    if (items.length === 0) return;
    await tx.event_highlights.createMany({
      data: items.map((item, index) => ({
        event_id,
        title: item.title,
        description: item.description ?? null,
        media_url: item.media_url ?? null,
        media_type: item.media_type ?? 'image',
        display_order: item.display_order ?? index,
      })),
    });
  });
}
