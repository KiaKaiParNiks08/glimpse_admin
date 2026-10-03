import { z } from 'zod';
import { uuidSchema } from './common';

/** Kinds of content a user can favorite. Add new kinds here (e.g. single post media) together with a DB column. */
export const FAVORITE_ITEM_TYPES = ['day_media', 'post'] as const;
export const favoriteItemTypeSchema = z.enum(FAVORITE_ITEM_TYPES);

/** Body for POST /api/favorites */
export const setFavoriteBodySchema = z.object({
  user_id: uuidSchema,
  event_id: uuidSchema,
  item_type: favoriteItemTypeSchema,
  item_id: uuidSchema,
  /** true = add to favourites, false = remove from favourites */
  add_favourite: z.boolean({ error: 'add_favourite must be true or false' }),
});

/** Query for GET /api/favorites */
export const listFavoritesQuerySchema = z.object({
  user_id: uuidSchema,
  event_id: uuidSchema,
  type: z.enum(['all', ...FAVORITE_ITEM_TYPES]).optional().default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type FavoriteItemType = z.infer<typeof favoriteItemTypeSchema>;
export type SetFavoriteBody = z.infer<typeof setFavoriteBodySchema>;
export type ListFavoritesQuery = z.infer<typeof listFavoritesQuerySchema>;
