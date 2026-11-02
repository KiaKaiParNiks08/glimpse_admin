import prisma from '../prisma';
import type { OtpDeliveryChannel } from './types';

export interface CreateAuditEntryInput {
  requestId: string;
  otpId?: string | null;
  userId?: string | null;
  eventId?: string | null;
  deliveryChannel: OtpDeliveryChannel;
  destinationMasked: string;
  destinationCountry?: string | null;
  provider: 'AWS_SES' | 'AWS_SMS';
}

export interface UpdateAuditProviderResponseInput {
  requestId: string;
  status: 'PROVIDER_ACCEPTED' | 'DELIVERY_FAILED';
  providerMessageId?: string | null;
  providerStatusCode?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface UpdateAuditOutcomeInput {
  requestId?: string | null;
  otpId?: string | null;
  userId?: string | null;
  outcome: 'VERIFIED' | 'FAILED' | 'EXPIRED' | 'MAX_ATTEMPTS_EXCEEDED';
  attemptsCount?: number;
}

/**
 * Record initial request creation in otp_audit_logs.
 * Never logs plaintext OTP or credentials.
 */
export async function recordAuditRequestAccepted(input: CreateAuditEntryInput): Promise<void> {
  try {
    await prisma.otp_audit_logs.create({
      data: {
        request_id: input.requestId,
        otp_id: input.otpId || null,
        user_id: input.userId || null,
        event_id: input.eventId || null,
        delivery_channel: input.deliveryChannel,
        destination_masked: input.destinationMasked,
        destination_country: input.destinationCountry || null,
        status: 'REQUEST_ACCEPTED',
        provider: input.provider,
        verification_outcome: 'PENDING',
        attempts_count: 0,
      },
    });
  } catch (err) {
    console.error('[otp_audit_logs] Failed to record request accepted:', err);
  }
}

/**
 * Record AWS provider acceptance or delivery failure.
 */
export async function recordAuditProviderResponse(input: UpdateAuditProviderResponseInput): Promise<void> {
  try {
    await prisma.otp_audit_logs.updateMany({
      where: { request_id: input.requestId },
      data: {
        status: input.status,
        provider_message_id: input.providerMessageId || null,
        provider_status_code: input.providerStatusCode || null,
        error_code: input.errorCode || null,
        error_message: input.errorMessage || null,
        updated_at: new Date(),
      },
    });
  } catch (err) {
    console.error('[otp_audit_logs] Failed to record provider response:', err);
  }
}

/**
 * Record verification attempt outcome (VERIFIED, FAILED, EXPIRED, MAX_ATTEMPTS_EXCEEDED).
 */
export async function recordAuditVerificationOutcome(input: UpdateAuditOutcomeInput): Promise<void> {
  try {
    const whereClause = input.requestId
      ? { request_id: input.requestId }
      : input.otpId
      ? { otp_id: input.otpId }
      : input.userId
      ? { user_id: input.userId }
      : null;

    if (!whereClause) return;

    await prisma.otp_audit_logs.updateMany({
      where: whereClause,
      data: {
        verification_outcome: input.outcome,
        ...(input.attemptsCount !== undefined ? { attempts_count: input.attemptsCount } : {}),
        updated_at: new Date(),
      },
    });
  } catch (err) {
    console.error('[otp_audit_logs] Failed to record verification outcome:', err);
  }
}
