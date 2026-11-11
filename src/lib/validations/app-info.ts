import { z } from 'zod';
import { uuidSchema } from './common';
import { FCM_TOKEN_MAX_LENGTH } from './auth';

export const appInfoQuerySchema = z
  .object({
    event_id: uuidSchema.optional(),
    user_id: uuidSchema.optional(),
    device_id: z.string().min(1).max(255).optional(),
    platform: z.string().max(20).optional(),
    fcm_token: z.string().trim().min(1).max(FCM_TOKEN_MAX_LENGTH).optional(),
  })
  .superRefine((query, ctx) => {
    if (!query.event_id && !query.device_id && !query.user_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide event_id, user_id, or device_id',
        path: ['event_id'],
      });
    }
  });

export type AppInfoQuery = z.infer<typeof appInfoQuerySchema>;
