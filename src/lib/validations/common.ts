import { z } from 'zod';

/** UUID v4 format */
export const uuidSchema = z.string().uuid();

/** Pagination query params */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Prisma enums as Zod schemas */
export const commentStatusSchema = z.enum(['active', 'deleted']);
export const mediaTypeSchema = z.enum(['image', 'video']);
export const notificationTypeSchema = z.enum([
  'post_like',
  'post_comment',
  'event_invite',
  'event_update',
  'event_reminder',
  'general',
]);
export const pageStatusSchema = z.enum(['draft', 'published']);
export const postStatusSchema = z.enum(['active', 'deleted']);

export type CommentStatus = z.infer<typeof commentStatusSchema>;
export type MediaType = z.infer<typeof mediaTypeSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type PageStatus = z.infer<typeof pageStatusSchema>;
export type PostStatus = z.infer<typeof postStatusSchema>;
