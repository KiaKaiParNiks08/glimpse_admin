import { z } from 'zod';

/** Auth request (POST body) – country_code, mobile_number, event_code */
export const authRequestSchema = z.object({
  country_code: z.string().min(1).max(20),
  mobile_number: z.string().min(1).max(20),
  event_code: z.string().min(1).max(20),
  device_type: z.enum(['android', 'ios', 'web']),
  device_id: z.string().min(1).max(255),
});

export type AuthRequestInput = z.infer<typeof authRequestSchema>;

/** OTP verify request (POST body) – user_id, otp */
export const authVerifyRequestSchema = z.object({
  user_id: z.string().uuid(),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export type AuthVerifyRequestInput = z.infer<typeof authVerifyRequestSchema>;

/** Resend OTP request (POST body) – user_id only */
export const authResendRequestSchema = z.object({
  user_id: z.string().uuid(),
});

export type AuthResendRequestInput = z.infer<typeof authResendRequestSchema>;

/** Admin login (SuperAdmin / Event Admin) – email and password */
export const adminLoginRequestSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export type AdminLoginRequestInput = z.infer<typeof adminLoginRequestSchema>;
