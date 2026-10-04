import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';

export const faceReferenceRevokeSchema = z.object({
  consent: z.literal(false),
});

export const mediaAssetIdSchema = z.object({
  id: uuidSchema,
});

export const eventPeopleMediaQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
});

export const peopleMediaRetrySchema = z
  .object({
    media_asset_id: uuidSchema.optional(),
    user_id: uuidSchema.optional(),
  })
  .refine((value) => Boolean(value.media_asset_id) !== Boolean(value.user_id), {
    message: 'Send media_asset_id or user_id',
  });

export const myMediaQuerySchema = paginationSchema;
