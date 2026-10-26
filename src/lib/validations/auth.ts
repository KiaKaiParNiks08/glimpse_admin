import { z } from 'zod';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().min(1).max(max).optional()
  );

/** Auth request. One identity: mobile, email, or event code. */
export const authRequestSchema = z
  .object({
    country_code: optionalText(20),
    mobile_number: optionalText(20),
    event_code: optionalText(20),
    event_id: z.preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      z.string().uuid().optional()
    ),
    email: z.preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      z.string().trim().email().max(150).optional()
    ),
    device_type: z.preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      z.enum(['android', 'ios', 'web']).optional()
    ),
    device_id: optionalText(255),
  })
  .superRefine((data, ctx) => {
    if (!data.mobile_number && !data.email && !data.event_code) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide mobile_number, email, or event_code',
        path: ['mobile_number'],
      });
    }
  });

export type AuthRequestInput = z.infer<typeof authRequestSchema>;

/** OTP verify request (POST body) – user_id, otp */
export const authVerifyRequestSchema = z.object({
  user_id: z.string().uuid(),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
  event_id: z.string().uuid().optional(),
});

export type AuthVerifyRequestInput = z.infer<typeof authVerifyRequestSchema>;

/** Resend OTP request (POST body) – user_id only */
export const authResendRequestSchema = z.object({
  user_id: z.string().uuid(),
});

export type AuthResendRequestInput = z.infer<typeof authResendRequestSchema>;

/** Switch the current event without a new OTP (profile account switch). */
export const authSwitchEventRequestSchema = z.object({
  event_id: z.string().uuid(),
});

/** Logged-in user joining another event from the in-app sheet or QR. */
export const authJoinEventRequestSchema = z
  .object({
    event_code: optionalText(500),
    event_id: z.preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      z.string().uuid().optional()
    ),
    device_type: z.preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      z.enum(['android', 'ios', 'web']).optional()
    ),
    device_id: optionalText(255),
  })
  .superRefine((data, ctx) => {
    if (!data.event_code && !data.event_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide event_code or event_id',
        path: ['event_code'],
      });
    }
  });

export type AuthJoinEventRequestInput = z.infer<typeof authJoinEventRequestSchema>;

export type AuthSwitchEventRequestInput = z.infer<typeof authSwitchEventRequestSchema>;

/** Admin login (SuperAdmin / Event Admin) – email and password */
export const adminLoginRequestSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export type AdminLoginRequestInput = z.infer<typeof adminLoginRequestSchema>;
