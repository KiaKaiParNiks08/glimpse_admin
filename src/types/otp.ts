/**
 * Shared types for OTP (reusable in server and frontend).
 */

export interface CreateOtpForUserOptions {
  user_id: string;
  expiry_minutes?: number;
}

export interface CreateOtpForUserResult {
  otp: string;
  expires_at: Date;
}

export interface VerifyOtpForUserOptions {
  user_id: string;
  otp: string;
}

export type VerifyOtpForUserResult =
  | { success: true }
  | { success: false; reason: 'invalid_or_expired' };
