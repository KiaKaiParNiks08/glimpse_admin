import crypto from 'crypto';
import prisma from '../prisma';
import { getOtpConfig } from './config';
import {
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
  maskEmail,
  maskPhone,
  normalizeE164,
  extractCallingCode,
} from './crypto';
import { resolveEventBranding } from './templates/email-template';
import { sendSesEmailOtp } from './providers/aws-ses';
import { sendAwsSmsOtp } from './providers/aws-sms';
import {
  recordAuditRequestAccepted,
  recordAuditProviderResponse,
  recordAuditVerificationOutcome,
} from './audit';
import type {
  OtpDeliveryChannel,
  SendOtpOptions,
  SendOtpResult,
  VerifyOtpOptions,
  VerifyOtpResult,
} from './types';

/**
 * Request, generate, store, and dispatch a secure OTP via AWS SES (email) or AWS End User Messaging SMS.
 */
export async function sendOtpForUser(options: SendOtpOptions): Promise<SendOtpResult> {
  const config = getOtpConfig();
  const { userId, channel, destination, countryCode, eventId, eventCode } = options;
  const requestId = crypto.randomUUID();

  // 1. Enforce Resend Cooldown (60 seconds)
  const activeOtp = await prisma.user_otps.findFirst({
    where: {
      user_id: userId,
      is_verified: false,
      consumed_at: null,
      resend_available_at: { gt: new Date() },
    },
    select: { id: true, resend_available_at: true },
    orderBy: { created_at: 'desc' },
  });

  if (activeOtp && activeOtp.resend_available_at) {
    const remainingSec = Math.ceil((activeOtp.resend_available_at.getTime() - Date.now()) / 1000);
    if (remainingSec > 0) {
      throw new Error(`Please wait ${remainingSec} second(s) before requesting a new OTP.`);
    }
  }

  // 2. Rate Limiting Check (max 10 requests per user in 15 minutes)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const recentOtpCount = await prisma.user_otps.count({
    where: {
      user_id: userId,
      created_at: { gte: fifteenMinutesAgo },
    },
  });

  if (recentOtpCount >= 10) {
    throw new Error('Too many OTP requests. Please wait a few minutes before trying again.');
  }

  // 3. Resolve Destination & Formatting
  let destinationMasked = '';
  let destinationCountry: string | null = null;
  let formattedDestination = destination.trim();

  if (channel === 'email') {
    if (!formattedDestination.includes('@')) {
      throw new Error(`Invalid email address destination: "${destination}"`);
    }
    destinationMasked = maskEmail(formattedDestination);
  } else if (channel === 'sms') {
    formattedDestination = normalizeE164(formattedDestination, countryCode);
    destinationMasked = maskPhone(formattedDestination);
    destinationCountry = extractCallingCode(formattedDestination);
  } else {
    throw new Error(`Unsupported delivery channel: ${channel}`);
  }

  // 4. Resolve Trusted Event Branding Server-Side
  const branding = await resolveEventBranding(eventId, eventCode);

  // 5. Generate Cryptographic 6-digit OTP & HMAC-SHA256 Hash
  const plainOtp = generateSecureOtp(config.otpLength);
  const otpHmacHash = hashOtp(plainOtp, config.otpHashSecret);

  const now = Date.now();
  const expiresAt = new Date(now + config.otpExpiryMinutes * 60 * 1000);
  const resendAvailableAt = new Date(now + config.otpResendCooldownSeconds * 1000);

  // 6. Invalidate previous active unverified OTPs for this user
  await prisma.user_otps.updateMany({
    where: {
      user_id: userId,
      is_verified: false,
      consumed_at: null,
    },
    data: {
      expires_at: new Date(now),
    },
  });

  // 7. Store securely in user_otps: only the HMAC hash is stored, never plaintext!
  const createdRecord = await prisma.user_otps.create({
    data: {
      user_id: userId,
      otp: otpHmacHash, // Column widened to VARCHAR(128)
      otp_hash: otpHmacHash,
      expires_at: expiresAt,
      resend_available_at: resendAvailableAt,
      is_verified: false,
      attempts: 0,
      max_attempts: config.otpMaxAttempts,
      delivery_channel: channel,
      destination_masked: destinationMasked,
      destination_country: destinationCountry,
      request_id: requestId,
    },
  });

  // 8. Record audit log: Request Accepted
  const provider = channel === 'email' ? 'AWS_SES' : 'AWS_SMS';
  await recordAuditRequestAccepted({
    requestId,
    otpId: createdRecord.id,
    userId,
    eventId: eventId || null,
    deliveryChannel: channel,
    destinationMasked,
    destinationCountry,
    provider,
  });

  // 9. Dispatch to AWS Provider (SES for Email, End User Messaging for SMS)
  let deliveryResult;
  if (channel === 'email') {
    deliveryResult = await sendSesEmailOtp({
      toEmail: formattedDestination,
      otp: plainOtp,
      branding,
      expiryMinutes: config.otpExpiryMinutes,
    });
  } else {
    deliveryResult = await sendAwsSmsOtp({
      destinationPhone: formattedDestination,
      countryCode,
      otp: plainOtp,
      brandName: branding.eventName,
      expiryMinutes: config.otpExpiryMinutes,
    });
  }

  // 10. Record provider response in audit log
  if (deliveryResult.success) {
    await recordAuditProviderResponse({
      requestId,
      status: 'PROVIDER_ACCEPTED',
      providerMessageId: deliveryResult.messageId,
      providerStatusCode: deliveryResult.statusCode,
    });
  } else {
    await recordAuditProviderResponse({
      requestId,
      status: 'DELIVERY_FAILED',
      errorCode: deliveryResult.errorCode,
      errorMessage: deliveryResult.errorMessage,
    });

    // Invalidate the OTP row since delivery failed
    await prisma.user_otps.update({
      where: { id: createdRecord.id },
      data: { expires_at: new Date() },
    });

    // Throw the delivery error - do not silently pretend it succeeded!
    throw new Error(deliveryResult.errorMessage || 'Failed to deliver OTP via AWS provider');
  }

  return {
    requestId,
    expiresAt,
    resendAvailableAt,
    deliveryChannel: channel,
    destinationMasked,
    otp: config.otpAllowTestMode ? plainOtp : undefined,
  };
}

/**
 * Verify an OTP for a user inside an atomic database transaction.
 * Enforces:
 * - One-time use
 * - 5-minute expiration
 * - Maximum attempts (5)
 * - Timing-safe HMAC hash comparison
 * - Invalidation of concurrent/previous OTPs
 */
export async function verifyOtpForUser(options: VerifyOtpOptions): Promise<VerifyOtpResult> {
  const config = getOtpConfig();
  const { userId, otp } = options;

  return await prisma.$transaction(async (tx) => {
    // 1. Retrieve the latest unverified, unconsumed OTP record for this user
    const record = await tx.user_otps.findFirst({
      where: {
        user_id: userId,
        is_verified: false,
        consumed_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!record) {
      await recordAuditVerificationOutcome({
        userId,
        outcome: 'FAILED',
      });
      return { success: false, reason: 'not_found' };
    }

    // 2. Check Expiration
    if (record.expires_at < new Date()) {
      await recordAuditVerificationOutcome({
        requestId: record.request_id,
        otpId: record.id,
        outcome: 'EXPIRED',
        attemptsCount: record.attempts,
      });
      return { success: false, reason: 'expired' };
    }

    // 3. Check Attempts Cap
    if (record.attempts >= record.max_attempts) {
      await recordAuditVerificationOutcome({
        requestId: record.request_id,
        otpId: record.id,
        outcome: 'MAX_ATTEMPTS_EXCEEDED',
        attemptsCount: record.attempts,
      });
      return { success: false, reason: 'max_attempts_exceeded', remainingAttempts: 0 };
    }

    // 4. Secure Timing-Safe Hash Verification
    const expectedHash = record.otp_hash || record.otp;
    const isMatch = verifyOtpHash(otp, expectedHash, config.otpHashSecret);

    if (!isMatch) {
      const newAttempts = record.attempts + 1;
      const isNowMax = newAttempts >= record.max_attempts;

      await tx.user_otps.update({
        where: { id: record.id },
        data: {
          attempts: newAttempts,
          ...(isNowMax ? { expires_at: new Date() } : {}),
        },
      });

      await recordAuditVerificationOutcome({
        requestId: record.request_id,
        otpId: record.id,
        outcome: isNowMax ? 'MAX_ATTEMPTS_EXCEEDED' : 'FAILED',
        attemptsCount: newAttempts,
      });

      return {
        success: false,
        reason: isNowMax ? 'max_attempts_exceeded' : 'invalid',
        remainingAttempts: Math.max(0, record.max_attempts - newAttempts),
      };
    }

    // 5. Verification Successful: Mark consumed and verified
    const now = new Date();
    await tx.user_otps.update({
      where: { id: record.id },
      data: {
        is_verified: true,
        consumed_at: now,
        attempts: record.attempts + 1,
      },
    });

    // Invalidate any other pending OTP rows for this user to prevent replay attacks
    await tx.user_otps.updateMany({
      where: {
        user_id: userId,
        id: { not: record.id },
        is_verified: false,
      },
      data: {
        expires_at: now,
        consumed_at: now,
      },
    });

    // 6. Record Audit Outcome: VERIFIED
    await recordAuditVerificationOutcome({
      requestId: record.request_id,
      otpId: record.id,
      outcome: 'VERIFIED',
      attemptsCount: record.attempts + 1,
    });

    return { success: true };
  });
}
