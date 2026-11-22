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

/** PATCH /api/users/[user_id] — supports global update or event preferences */
export const patchUserBodySchema = z
  .object({
    full_name: z.string().trim().min(1).max(100).optional(),
    instagram_id: optionalInstagramSchema,
    linkedin_url: optionalLinkedInSchema,
    avatar_url: z.string().max(1000).optional().nullable(),
    email: z.string().optional(),
    mobile_number: z.string().optional(),
    country_code: z.string().optional(),
    password: z.string().optional(),
    wedding_side: z
      .preprocess(
        (val) => (typeof val === 'string' ? val.toLowerCase().trim() : val),
        z.enum(['groom', 'bride']).nullable()
      )
      .optional(),
    is_instagram_visible: z.boolean().optional(),
    is_linkedin_visible: z.boolean().optional(),
    show_instagram: z.boolean().optional(),
    show_linkedin: z.boolean().optional(),
    event_id: uuidSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // 1. If event_id is absent: Global profile update
    if (!data.event_id) {
      if (data.email !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'Email cannot be updated via PATCH users/{user_id}. Use login-change endpoints instead.',
        });
      }
      if (data.mobile_number !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mobile_number'],
          message: 'Mobile number cannot be updated via PATCH users/{user_id}. Use login-change endpoints instead.',
        });
      }
      if (data.avatar_url !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['avatar_url'],
          message: 'Profile photo cannot be updated via PATCH users/{user_id}. Use POST users/{user_id}/profile-picture instead.',
        });
      }
      if (
        data.wedding_side !== undefined ||
        data.is_instagram_visible !== undefined ||
        data.is_linkedin_visible !== undefined ||
        data.show_instagram !== undefined ||
        data.show_linkedin !== undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['event_id'],
          message: 'event_id is required when updating event preferences.',
        });
      }
    } else {
      // 2. If event_id is present: Event preferences update
      if (data.email !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'Email cannot be updated via event preferences.',
        });
      }
      if (data.mobile_number !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mobile_number'],
          message: 'Mobile number cannot be updated via event preferences.',
        });
      }
      if (data.avatar_url !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['avatar_url'],
          message: 'Profile photo cannot be updated via event preferences.',
        });
      }
    }
  });

/** POST /api/users/[user_id]/login-change/request */
export const requestLoginChangeSchema = z
  .object({
    email: z.string().trim().email('Invalid email address').max(150).optional(),
    country_code: z.string().trim().max(10).optional(),
    mobile_number: z.string().trim().max(20).optional(),
  })
  .superRefine((data, ctx) => {
    const hasEmail = Boolean(data.email);
    const hasMobile = Boolean(data.mobile_number);
    if (!hasEmail && !hasMobile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either email or mobile_number must be provided.',
      });
    }
    if (hasEmail && hasMobile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one channel: email OR mobile_number.',
      });
    }
  });

/** POST /api/users/[user_id]/login-change/confirm */
export const confirmLoginChangeSchema = z
  .object({
    email: z.string().trim().email('Invalid email address').max(150).optional(),
    country_code: z.string().trim().max(10).optional(),
    mobile_number: z.string().trim().max(20).optional(),
    otp: z.string().trim().min(4, 'OTP must be at least 4 digits').max(10),
  })
  .superRefine((data, ctx) => {
    const hasEmail = Boolean(data.email);
    const hasMobile = Boolean(data.mobile_number);
    if (!hasEmail && !hasMobile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either email or mobile_number must be provided.',
      });
    }
    if (hasEmail && hasMobile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one channel: email OR mobile_number.',
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
export type RequestLoginChangeInput = z.infer<typeof requestLoginChangeSchema>;
export type ConfirmLoginChangeInput = z.infer<typeof confirmLoginChangeSchema>;

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
