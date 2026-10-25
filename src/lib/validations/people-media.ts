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
    backfill: z.boolean().optional(),
    dry_run: z.boolean().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.backfill) || Boolean(value.media_asset_id) !== Boolean(value.user_id),
    { message: 'Send media_asset_id, user_id, or backfill: true' }
  );

export const myMediaQuerySchema = paginationSchema.extend({
  user_id: uuidSchema,
  /** When set, only face matches from this session. Omit for every session in the event. */
  event_session_id: uuidSchema.optional(),
});
