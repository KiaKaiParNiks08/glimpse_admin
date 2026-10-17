import { z } from 'zod';
import { uuidSchema } from './common';

export const appInfoQuerySchema = z
  .object({
    event_id: uuidSchema.optional(),
    user_id: uuidSchema.optional(),
    device_id: z.string().min(1).max(255).optional(),
    platform: z.string().max(20).optional(),
  })
  .superRefine((query, ctx) => {
    if (!!query.event_id !== !!query.user_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'event_id and user_id must be sent together',
        path: ['event_id'],
      });
    }
    if (!query.event_id && !query.device_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide event_id and user_id, or device_id',
        path: ['device_id'],
      });
    }
  });

export type AppInfoQuery = z.infer<typeof appInfoQuerySchema>;
