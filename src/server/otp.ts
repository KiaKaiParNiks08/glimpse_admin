import prisma from '@/server/prisma';
import type {
  CreateOtpForUserOptions,
  CreateOtpForUserResult,
  VerifyOtpForUserOptions,
  VerifyOtpForUserResult,
} from '@/types';

export type {
  CreateOtpForUserOptions,
  CreateOtpForUserResult,
  VerifyOtpForUserOptions,
  VerifyOtpForUserResult,
} from '@/types';

const DEFAULT_OTP_EXPIRY_MINUTES = 10;

/** Generate a random 6-digit OTP string */
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Generate a 6-digit OTP, persist it in user_otps for the given user, and return the OTP and expiry.
 */
export async function createOtpForUser(
  options: CreateOtpForUserOptions
): Promise<CreateOtpForUserResult> {
  const { user_id, expiry_minutes = DEFAULT_OTP_EXPIRY_MINUTES } = options;
  const otp = generateOtp();
  const expires_at = new Date(Date.now() + expiry_minutes * 60 * 1000);

  await prisma.user_otps.create({
    data: {
      user_id,
      otp,
      expires_at,
      is_verified: false,
    },
  });

  return { otp, expires_at };
}

/**
 * Verify the given OTP for the user. Finds the latest unverified, non-expired OTP
 * for the user; if it matches, marks it verified and returns success.
 */
export async function verifyOtpForUser(
  options: VerifyOtpForUserOptions
): Promise<VerifyOtpForUserResult> {
  const { user_id, otp } = options;
  const now = new Date();

  const record = await prisma.user_otps.findFirst({
    where: {
      user_id,
      otp,
      is_verified: false,
      expires_at: { gt: now },
    },
    orderBy: { created_at: 'desc' },
  });

  if (!record) {
    return { success: false, reason: 'invalid_or_expired' };
  }

  await prisma.user_otps.update({
    where: { id: record.id },
    data: { is_verified: true },
  });

  return { success: true };
}
