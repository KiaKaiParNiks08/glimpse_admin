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
  /** With viewer_user_id, adds is_favorite for the viewer's favorites in this event. */
  event_id: uuidSchema.optional(),
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

/** Body for deleting a post (self-owned) */
export const deletePostBodySchema = z.object({
  user_id: uuidSchema,
});

/** Path param for post delete route */
export const deletePostPathSchema = z.object({
  post_id: uuidSchema,
});

/** Form fields for feed post (multipart); media files are validated separately. Status is always active. */
export const createFeedPostFormSchema = z.object({
  user_id: uuidSchema,
  caption: z.string().optional(),
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
