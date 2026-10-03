import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { postSelect, type PostWithMedia } from '@/server/posts';
import type {
  FavoriteItemType,
  ListFavoritesQuery,
  SetFavoriteBody,
} from '@/lib/validations/favorites';

type FavoriteTarget = { event_day_media_id: string } | { post_id: string };

function toTarget(itemType: FavoriteItemType, itemId: string): FavoriteTarget {
  switch (itemType) {
    case 'day_media':
      return { event_day_media_id: itemId };
    case 'post':
      return { post_id: itemId };
  }
}

const notDeletedPost: Prisma.postsWhereInput = { OR: [{ status: 'active' }, { status: null }] };

/**
 * Whether the item can be favorited in this event: day media must belong to one of the event's days;
 * posts must exist and not be deleted.
 */
export async function favoriteTargetExists(
  eventId: string,
  itemType: FavoriteItemType,
  itemId: string
): Promise<boolean> {
  switch (itemType) {
    case 'day_media':
      return (
        (await prisma.event_day_media.count({
          where: { id: itemId, event_days: { event_id: eventId } },
        })) > 0
      );
    case 'post':
      return (await prisma.posts.count({ where: { id: itemId, ...notDeletedPost } })) > 0;
  }
}

/** Add or remove a favorite. Idempotent: adding twice or removing a missing favorite is a no-op. */
export async function setFavorite(input: SetFavoriteBody): Promise<{ is_favorite: boolean }> {
  const target = toTarget(input.item_type, input.item_id);
  const where = { user_id: input.user_id, event_id: input.event_id, ...target };

  if (input.add_favourite) {
    await prisma.user_favorites.createMany({
      data: [{ ...where, item_type: input.item_type }],
      skipDuplicates: true,
    });
    return { is_favorite: true };
  }

  await prisma.user_favorites.deleteMany({ where });
  return { is_favorite: false };
}

const favoriteMediaSelect = {
  id: true,
  event_day_id: true,
  media_url: true,
  media_type: true,
  display_order: true,
  created_at: true,
  event_days: { select: { id: true, title: true, date: true } },
} as const;

type FavoriteMedia = Omit<
  Prisma.event_day_mediaGetPayload<{ select: typeof favoriteMediaSelect }>,
  'event_days'
> & {
  day: { id: string; title: string | null; date: Date };
  is_favorite: true;
};

export type FavoriteItem = {
  favorite_id: string;
  item_type: FavoriteItemType;
  item_id: string;
  favorited_at: Date | null;
  media: FavoriteMedia | null;
  post: (PostWithMedia & { liked_by_viewer: boolean; is_favorite: true }) | null;
};

/** A user's favorites in one event, newest first. Favorites of deleted posts are hidden. */
export async function listFavorites(
  query: ListFavoritesQuery
): Promise<{ items: FavoriteItem[]; total: number }> {
  const { user_id, event_id, type, page, limit } = query;
  const where: Prisma.user_favoritesWhereInput = {
    user_id,
    event_id,
    ...(type !== 'all' && { item_type: type }),
    OR: [{ post_id: null }, { posts: { is: notDeletedPost } }],
  };

  const [rows, total] = await Promise.all([
    prisma.user_favorites.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        item_type: true,
        event_day_media_id: true,
        post_id: true,
        created_at: true,
        event_day_media: { select: favoriteMediaSelect },
        posts: {
          select: {
            ...postSelect,
            post_likes: { where: { user_id }, select: { id: true } },
          },
        },
      },
    }),
    prisma.user_favorites.count({ where }),
  ]);

  const items = rows.map((row): FavoriteItem => {
    let media: FavoriteItem['media'] = null;
    if (row.event_day_media) {
      const { event_days, ...rest } = row.event_day_media;
      media = { ...rest, day: event_days, is_favorite: true };
    }

    let post: FavoriteItem['post'] = null;
    if (row.posts) {
      const { post_likes, ...rest } = row.posts;
      post = {
        ...(rest as unknown as PostWithMedia),
        liked_by_viewer: post_likes.length > 0,
        is_favorite: true,
      };
    }

    return {
      favorite_id: row.id,
      item_type: row.item_type as FavoriteItemType,
      item_id: (row.event_day_media_id ?? row.post_id) as string,
      favorited_at: row.created_at,
      media,
      post,
    };
  });

  return { items, total };
}

/** Ids from `itemIds` that the user has favorited (optionally within one event). */
export async function getFavoritedItemIds(
  userId: string,
  itemType: FavoriteItemType,
  itemIds: string[],
  eventId?: string
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const base = { user_id: userId, item_type: itemType, ...(eventId && { event_id: eventId }) };
  const rows = await prisma.user_favorites.findMany({
    where:
      itemType === 'day_media'
        ? { ...base, event_day_media_id: { in: itemIds } }
        : { ...base, post_id: { in: itemIds } },
    select: { event_day_media_id: true, post_id: true },
  });
  return new Set(
    rows.map((r) => (itemType === 'day_media' ? r.event_day_media_id : r.post_id) as string)
  );
}
