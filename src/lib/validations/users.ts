import { z } from 'zod';
import { uuidSchema } from './common';
import { normalizeInstagramInput, normalizeLinkedInInput } from '@/lib/user-event-profile';

/** Create user (API body) – password sent as plain text, hashed on server */
export const createUserSchema = z.object({
  full_name: z.string().min(1).max(100),
  email: z.string().email().max(150),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role_id: z.number().int().positive(),
  country_code: z.string().max(100).optional(),
  mobile_number: z.string().max(20).optional(),
  is_active: z.boolean().optional().default(true),
});

const optionalInstagramSchema = z
  .string()
  .max(255)
  .nullable()
  .superRefine((val, ctx) => {
    if (val === null) return;
    if (!normalizeInstagramInput(val).valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Instagram handle or URL must not contain spaces',
      });
    }
  })
  .transform((val) => normalizeInstagramInput(val).value)
  .optional();

const optionalLinkedInSchema = z
  .string()
  .max(500)
  .nullable()
  .superRefine((val, ctx) => {
    if (val === null) return;
    if (!normalizeLinkedInInput(val).valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LinkedIn URL must contain linkedin.com or be a valid profile slug',
      });
    }
  })
  .transform((val) => normalizeLinkedInInput(val).value)
  .optional();

/** Update user (partial) – profile and optional password */
export const updateUserSchema = createUserSchema.partial().extend({
  password: z.string().min(8).optional(),
  // Stored avatar may be an absolute URL or an internal media key/path.
  avatar_url: z.string().max(1000).optional().nullable(),
  instagram_id: optionalInstagramSchema,
  linkedin_url: optionalLinkedInSchema,
});

/** PATCH /api/users/[user_id] — per-event profile when event_id is sent */
export const patchUserBodySchema = updateUserSchema.extend({
  full_name: z.string().max(100).optional(),
  wedding_side: z.enum(['groom', 'bride']).nullable().optional(),
  event_id: uuidSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.wedding_side !== undefined && data.event_id === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'event_id is required when wedding_side is provided',
      path: ['event_id'],
    });
  }
});

/** User ID path/query param */
export const userIdPathParamSchema = z.object({
  id: uuidSchema,
});
export const userIdParamSchema = userIdPathParamSchema;

/** Path param for /api/users/[user_id] */
export const userIdPathSchema = z.object({
  user_id: uuidSchema,
});

/** Optional query for /api/users/[user_id]: event context */
export const getUserByIdQuerySchema = z.object({
  event_id: uuidSchema.optional(),
});

/** User list query (filters, pagination) */
export const listUsersQuerySchema = z.object({
  search: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
  role_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type PatchUserBodyInput = z.infer<typeof patchUserBodySchema>;

/** Fields consumed by updateUser(); omit event-scoped profile keys when event_id is set. */
export function toUpdateUserInput(body: PatchUserBodyInput): UpdateUserInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { wedding_side: _ws, event_id, full_name, instagram_id, linkedin_url, avatar_url, ...rest } = body;
  if (event_id) return rest;
  return {
    ...rest,
    ...(full_name !== undefined ? { full_name } : {}),
    ...(instagram_id !== undefined ? { instagram_id } : {}),
    ...(linkedin_url !== undefined ? { linkedin_url } : {}),
    ...(avatar_url !== undefined ? { avatar_url } : {}),
  };
}
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type UserIdPath = z.infer<typeof userIdPathSchema>;
export type GetUserByIdQuery = z.infer<typeof getUserByIdQuerySchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
