import { z } from 'zod';
import { uuidSchema } from './common';
import { postStatusSchema } from './common';

export const createPostSchema = z.object({
  user_id: uuidSchema,
  caption: z.string().optional(),
  status: postStatusSchema.optional().default('active'),
});

export const updatePostSchema = createPostSchema.partial();

export const postIdParamSchema = z.object({
  id: uuidSchema,
});

export const listPostsQuerySchema = z.object({
  user_id: uuidSchema.optional(),
  viewer_user_id: uuidSchema.optional(),
  /** Return only posts stored for this event. Posts with no event_id are never included. */
  event_id: uuidSchema.optional(),
  /** Defaults to active so deleted posts stay out of the feed. */
  status: postStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Path param for post-scoped like route */
export const likePostPathSchema = z.object({
  post_id: uuidSchema,
});

/** Body for like/unlike a post */
export const likePostBodySchema = z.object({
  user_id: uuidSchema,
  action: z.enum(['toggle', 'like', 'unlike']).optional().default('toggle'),
});

/** Body or query for deleting a post (self-owned, one event). */
export const deletePostBodySchema = z.object({
  user_id: uuidSchema,
  event_id: uuidSchema.optional(),
});

/** Path param for post delete route */
export const deletePostPathSchema = z.object({
  post_id: uuidSchema,
});

/** Caption-only edit. Media, height, and event cannot change. */
export const updateFeedPostBodySchema = z.object({
  user_id: uuidSchema.optional(),
  event_id: uuidSchema.optional(),
  caption: z.string().max(5000),
});

/** Form fields for feed post (multipart); media files are validated separately. Status is always active. */
export const createFeedPostFormSchema = z.object({
  user_id: uuidSchema,
  caption: z.string().optional(),
  /** Event this post belongs to. Omit to keep the post out of every event feed. */
  event_id: uuidSchema.optional(),
  /** Tallest media height in pixels. One value for the whole post. */
  height: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : value;
  }, z.number().int().min(1).max(20000).optional()),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type PostIdParam = z.infer<typeof postIdParamSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
export type LikePostPath = z.infer<typeof likePostPathSchema>;
export type LikePostBody = z.infer<typeof likePostBodySchema>;
export type CreateFeedPostFormInput = z.infer<typeof createFeedPostFormSchema>;
export type DeletePostBody = z.infer<typeof deletePostBodySchema>;
export type DeletePostPath = z.infer<typeof deletePostPathSchema>;
export type UpdateFeedPostBody = z.infer<typeof updateFeedPostBodySchema>;
