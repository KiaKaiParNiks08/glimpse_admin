import { z } from 'zod';

/** Auth request (POST body) – mobile + device. Event code / event_id / email are optional. */
export const authRequestSchema = z.object({
  country_code: z.string().min(1).max(20),
  mobile_number: z.string().min(1).max(20),
  event_code: z.string().min(1).max(20).optional(),
  event_id: z.string().uuid().optional(),
  email: z.string().trim().email().max(150).optional(),
  device_type: z.enum(['android', 'ios', 'web']),
  device_id: z.string().min(1).max(255),
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

export type AuthSwitchEventRequestInput = z.infer<typeof authSwitchEventRequestSchema>;

/** Admin login (SuperAdmin / Event Admin) – email and password */
export const adminLoginRequestSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export type AdminLoginRequestInput = z.infer<typeof adminLoginRequestSchema>;
