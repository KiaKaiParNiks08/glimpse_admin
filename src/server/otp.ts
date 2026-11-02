import prisma from '@/server/prisma';
import type {
  CreateOtpForUserOptions,
  CreateOtpForUserResult,
  VerifyOtpForUserOptions,
  VerifyOtpForUserResult,
} from '@/types';
import {
  sendOtpForUser,
  verifyOtpForUser as verifyOtpService,
  generateSecureOtp,
} from './otp/index';

export * from './otp/index';

export type {
  CreateOtpForUserOptions,
  CreateOtpForUserResult,
  VerifyOtpForUserOptions,
  VerifyOtpForUserResult,
} from '@/types';

/** Generate a cryptographically secure 6-digit OTP string */
export function generateOtp(): string {
  return generateSecureOtp(6);
}

/**
 * Creates, securely hashes, records, and dispatches an OTP via AWS SES (email) or AWS End User Messaging SMS.
 */
export async function createOtpForUser(
  options: CreateOtpForUserOptions
): Promise<CreateOtpForUserResult> {
  const { user_id, channel, destination, country_code, event_id, event_code } = options;

  let deliveryChannel = channel;
  let targetDestination = destination;
  let targetCountryCode = country_code;

  // If destination or channel is not specified, resolve from user profile
  if (!targetDestination || !deliveryChannel) {
    const user = await prisma.users.findUnique({
      where: { id: user_id },
      select: { email: true, mobile_number: true, country_code: true },
    });

    if (!user) {
      throw new Error('User not found for OTP dispatch');
    }

    if (deliveryChannel === 'sms' || (!deliveryChannel && user.mobile_number)) {
      deliveryChannel = 'sms';
      targetDestination = user.mobile_number || '';
      targetCountryCode = targetCountryCode || user.country_code;
    } else {
      deliveryChannel = 'email';
      targetDestination = user.email;
    }
  }

  const result = await sendOtpForUser({
    userId: user_id,
    channel: deliveryChannel,
    destination: targetDestination,
    countryCode: targetCountryCode,
    eventId: event_id,
    eventCode: event_code,
  });

  return {
    otp: result.otp || '******',
    expires_at: result.expiresAt,
  };
}

/**
 * Verify OTP using secure hash comparison and transactional state updates.
 */
export async function verifyOtpForUser(
  options: VerifyOtpForUserOptions
): Promise<VerifyOtpForUserResult> {
  const { user_id, otp } = options;
  const res = await verifyOtpService({
    userId: user_id,
    otp,
  });

  if (!res.success) {
    return { success: false, reason: 'invalid_or_expired' };
  }

  return { success: true };
}
