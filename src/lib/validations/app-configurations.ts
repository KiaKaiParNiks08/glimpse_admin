import { z } from 'zod';
import { uuidSchema } from './common';

/** List app configurations query (filters, pagination) */
export const listAppConfigurationsQuerySchema = z.object({
  platform: z.string().max(20).optional(),
  is_active: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createAppConfigurationSchema = z.object({
  platform: z.string().max(20),
  app_name: z.string().max(150).optional(),
  store_url: z.string().url(),
  current_version: z.string().max(20).optional(),
  minimum_supported_version: z.string().max(20).optional(),
  force_update: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
});

export const updateAppConfigurationSchema = createAppConfigurationSchema.partial();

/** PATCH body: all fields optional; platform is immutable after create. */
export const patchAppConfigurationSchema = createAppConfigurationSchema.omit({ platform: true }).partial();

export const appConfigurationIdParamSchema = z.object({
  id: uuidSchema,
});

export type ListAppConfigurationsQuery = z.infer<typeof listAppConfigurationsQuerySchema>;
export type CreateAppConfigurationInput = z.infer<typeof createAppConfigurationSchema>;
export type UpdateAppConfigurationInput = z.infer<typeof updateAppConfigurationSchema>;
export type PatchAppConfigurationInput = z.infer<typeof patchAppConfigurationSchema>;
export type AppConfigurationIdParam = z.infer<typeof appConfigurationIdParamSchema>;
