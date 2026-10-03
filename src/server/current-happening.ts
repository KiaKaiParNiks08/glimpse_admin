import prisma from '@/server/prisma';
import type { CurrentHappeningRow, HappeningPhotoRow } from '@/types';

export type { CurrentHappeningRow, HappeningPhotoRow } from '@/types';

export type CurrentHappeningInsert = {
  title: string;
  description?: string | null;
  bg_image_url: string;
  happening_date: string;
  display_order?: number | null;
  is_active?: boolean | null;
};

function normalizeMediaType(value: string | null | undefined): 'image' | 'video' {
  return value === 'video' ? 'video' : 'image';
}

function mapHappeningRow(row: {
  happening_photos: Array<{
    id: string;
    happening_id: string;
    image_url: string;
    media_type: string | null;
    alt_text: string | null;
    sort_order: number | null;
  }>;
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  bg_image_url: string;
  happening_date: Date;
  is_active: boolean | null;
  display_order: number | null;
}): CurrentHappeningRow {
  return {
    ...row,
    happening_photos: row.happening_photos.map((p) => ({
      ...p,
      media_type: normalizeMediaType(p.media_type),
    })),
  };
}

/**
 * Get list of current happening rows for the given event_id.
 * Returns rows ordered by display_order then happening_date.
 */
export async function getCurrentHappeningByEventId(
  event_id: string
): Promise<CurrentHappeningRow[]> {
  const rows = await prisma.current_happening.findMany({
    where: { event_id },
    orderBy: [{ display_order: 'asc' }, { happening_date: 'desc' }, { created_at: 'asc' }],
    select: {
      id: true,
      event_id: true,
      title: true,
      description: true,
      bg_image_url: true,
      happening_date: true,
      is_active: true,
      display_order: true,
      happening_photos: {
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        select: {
          id: true,
          happening_id: true,
          image_url: true,
          media_type: true,
          alt_text: true,
          sort_order: true,
        },
      },
    },
  });
  return rows.map(mapHappeningRow);
}

/**
 * Replace all current happening items for an event.
 */
export async function setCurrentHappening(
  event_id: string,
  items: CurrentHappeningInsert[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.current_happening.deleteMany({ where: { event_id } });
    if (items.length === 0) return;

    await tx.current_happening.createMany({
      data: items.map((item, index) => ({
        event_id,
        title: item.title,
        description: item.description ?? null,
        bg_image_url: item.bg_image_url,
        happening_date: new Date(item.happening_date),
        display_order: item.display_order ?? index,
        is_active: item.is_active ?? true,
      })),
    });
  });
}

export async function createCurrentHappening(
  event_id: string,
  item: CurrentHappeningInsert
): Promise<CurrentHappeningRow> {
  return prisma.current_happening.create({
    data: {
      event_id,
      title: item.title,
      description: item.description ?? null,
      bg_image_url: item.bg_image_url,
      happening_date: new Date(item.happening_date),
      display_order: item.display_order ?? 0,
      is_active: item.is_active ?? true,
    },
    select: {
      id: true,
      event_id: true,
      title: true,
      description: true,
      bg_image_url: true,
      happening_date: true,
      is_active: true,
      display_order: true,
      happening_photos: {
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        select: {
          id: true,
          happening_id: true,
          image_url: true,
          media_type: true,
          alt_text: true,
          sort_order: true,
        },
      },
    },
  }).then(mapHappeningRow);
}

export async function updateCurrentHappening(
  happening_id: string,
  item: CurrentHappeningInsert
): Promise<CurrentHappeningRow | null> {
  const existing = await prisma.current_happening.findUnique({
    where: { id: happening_id },
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.current_happening.update({
    where: { id: happening_id },
    data: {
      title: item.title,
      description: item.description ?? null,
      bg_image_url: item.bg_image_url,
      happening_date: new Date(item.happening_date),
      display_order: item.display_order ?? 0,
      is_active: item.is_active ?? true,
    },
    select: {
      id: true,
      event_id: true,
      title: true,
      description: true,
      bg_image_url: true,
      happening_date: true,
      is_active: true,
      display_order: true,
      happening_photos: {
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        select: {
          id: true,
          happening_id: true,
          image_url: true,
          media_type: true,
          alt_text: true,
          sort_order: true,
        },
      },
    },
  }).then(mapHappeningRow);
}

export async function deleteCurrentHappening(happening_id: string): Promise<boolean> {
  try {
    await prisma.current_happening.delete({ where: { id: happening_id } });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return false;
    throw e;
  }
}

export async function addHappeningPhoto(
  happening_id: string,
  data: {
    image_url: string;
    media_type?: 'image' | 'video';
    alt_text?: string | null;
    sort_order?: number | null;
  }
): Promise<HappeningPhotoRow | null> {
  const existing = await prisma.current_happening.findUnique({
    where: { id: happening_id },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await prisma.happening_photos.create({
    data: {
      happening_id,
      image_url: data.image_url,
      media_type: data.media_type ?? 'image',
      alt_text: data.alt_text ?? null,
      sort_order: data.sort_order ?? 0,
    },
    select: {
      id: true,
      happening_id: true,
      image_url: true,
      media_type: true,
      alt_text: true,
      sort_order: true,
    },
  });
  return { ...row, media_type: normalizeMediaType(row.media_type) };
}

export async function getHappeningPhotosByHappeningId(
  happening_id: string
): Promise<HappeningPhotoRow[]> {
  const rows = await prisma.happening_photos.findMany({
    where: { happening_id },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    select: {
      id: true,
      happening_id: true,
      image_url: true,
      media_type: true,
      alt_text: true,
      sort_order: true,
    },
  });
  return rows.map((p) => ({ ...p, media_type: normalizeMediaType(p.media_type) }));
}

export async function deleteHappeningPhoto(photo_id: string): Promise<boolean> {
  try {
    await prisma.happening_photos.delete({ where: { id: photo_id } });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return false;
    throw e;
  }
}
