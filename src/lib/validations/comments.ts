import { z } from 'zod';
import { uuidSchema } from './common';
import { paginationSchema } from './common';
import { commentStatusSchema } from './common';

/** Path param for post-scoped comment routes */
export const postIdPathSchema = z.object({
  post_id: uuidSchema,
});

/** Body for creating a comment on a post */
export const createCommentBodySchema = z.object({
  user_id: uuidSchema,
  comment_text: z.string().min(1, 'Comment text is required').max(2000),
  parent_comment_id: uuidSchema.optional(),
});

/** Query params for listing post comments */
export const listCommentsQuerySchema = paginationSchema.extend({
  status: commentStatusSchema.optional(),
  parent_comment_id: z.enum(['root', 'all']).optional().default('root'),
});

/** Path params for deleting a specific comment under a post */
export const deleteCommentPathSchema = z.object({
  post_id: uuidSchema,
  comment_id: uuidSchema,
});

/** Body for deleting a comment (self-owned) */
export const deleteCommentBodySchema = z.object({
  user_id: uuidSchema,
});

/** root = only top-level comments (parent_comment_id is null), all = include replies */
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
export type PostIdPath = z.infer<typeof postIdPathSchema>;
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>;
export type DeleteCommentPath = z.infer<typeof deleteCommentPathSchema>;
export type DeleteCommentBody = z.infer<typeof deleteCommentBodySchema>;
