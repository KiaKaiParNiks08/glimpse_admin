import { z } from 'zod';
import { uuidSchema } from './common';

/** Hex color #RRGGBB */
const hexColorSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{6})$/, 'Use #RRGGBB format (e.g. #1a2b3c)');

export const createAppThemeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  primary_color: hexColorSchema,
  secondary_color: hexColorSchema,
  button_primary_color: hexColorSchema,
  button_secondary_color: hexColorSchema,
});

export const listAppThemesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(150).optional(),
});

export const updateAppThemeSchema = createAppThemeSchema.partial();

export const appThemeIdParamSchema = z.object({
  id: uuidSchema,
});

export type CreateAppThemeInput = z.infer<typeof createAppThemeSchema>;
export type UpdateAppThemeInput = z.infer<typeof updateAppThemeSchema>;
export type ListAppThemesQuery = z.infer<typeof listAppThemesQuerySchema>;
