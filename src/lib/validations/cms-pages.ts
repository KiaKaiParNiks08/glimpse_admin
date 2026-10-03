import { z } from 'zod';
import { pageStatusSchema, uuidSchema } from './common';

/** List CMS pages query (filters, pagination) */
export const listCmsPagesQuerySchema = z.object({
  status: pageStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createCmsPageSchema = z.object({
  slug: z.string().max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title: z.string().max(200),
  content: z.string(),
  status: pageStatusSchema.optional().default('draft'),
});

export const updateCmsPageSchema = createCmsPageSchema.partial();

export const cmsPageIdParamSchema = z.object({
  id: uuidSchema,
});

export const cmsPageSlugParamSchema = z.object({
  slug: z.string().max(100),
});

export type ListCmsPagesQuery = z.infer<typeof listCmsPagesQuerySchema>;
export type CreateCmsPageInput = z.infer<typeof createCmsPageSchema>;
export type UpdateCmsPageInput = z.infer<typeof updateCmsPageSchema>;
export type CmsPageIdParam = z.infer<typeof cmsPageIdParamSchema>;
export type CmsPageSlugParam = z.infer<typeof cmsPageSlugParamSchema>;
