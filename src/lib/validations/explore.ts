import { z } from 'zod';
import { uuidSchema } from './common';

/** Path param for category id */
export const categoryIdPathSchema = z.object({
  category_id: uuidSchema,
});

/** Path param for item id */
export const itemIdPathSchema = z.object({
  item_id: uuidSchema,
});

/** List explore categories query (pagination, search) */
export const listExploreCategoriesQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Create/update explore category - background image (upload) is required */
export const createExploreCategorySchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(2000).optional().nullable(),
  background_url: z.string().min(1, 'Background image is required').max(2000),
});

export const updateExploreCategorySchema = createExploreCategorySchema.partial();

/** Create/update explore item - description, address, latitude, longitude required */
export const createExploreItemSchema = z.object({
  category_id: uuidSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  address: z.string().min(1, 'Address is required').max(300),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  latitude: z.number({ message: 'Latitude is required and must be a number' }),
  longitude: z.number({ message: 'Longitude is required and must be a number' }),
});

export const updateExploreItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  address: z.string().min(1).max(300).optional(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export type ListExploreCategoriesQuery = z.infer<typeof listExploreCategoriesQuerySchema>;
export type CreateExploreCategoryInput = z.infer<typeof createExploreCategorySchema>;
export type UpdateExploreCategoryInput = z.infer<typeof updateExploreCategorySchema>;
export type CreateExploreItemInput = z.infer<typeof createExploreItemSchema>;
export type UpdateExploreItemInput = z.infer<typeof updateExploreItemSchema>;
