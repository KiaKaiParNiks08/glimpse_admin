import { z } from 'zod';
import { uuidSchema } from './common';

export const appInfoQuerySchema = z.object({
  event_id: uuidSchema,
  user_id: uuidSchema,
  platform: z.string().max(20).optional(),
});

export type AppInfoQuery = z.infer<typeof appInfoQuerySchema>;
