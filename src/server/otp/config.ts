import type { OtpConfig, OtpDeliveryChannel } from './types';

/**
 * Read and parse OTP and AWS delivery configuration from environment variables.
 */
export function getOtpConfig(): OtpConfig {
  const otpLength = Number.parseInt(process.env.OTP_LENGTH || '6', 10);
  const otpExpiryMinutes = Number.parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
  const otpMaxAttempts = Number.parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
  const otpResendCooldownSeconds = Number.parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10);

  return {
    awsRegion: process.env.AWS_REGION?.trim() || 'us-east-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),

    // SES Email
    sesFromEmail: process.env.AWS_SES_FROM_EMAIL?.trim() || 'noreply@glimpseapp.com',
    sesFromName: process.env.AWS_SES_FROM_NAME?.trim() || 'Glimpse Verification',
    sesConfigurationSet: process.env.AWS_SES_CONFIGURATION_SET?.trim() || undefined,
    sesSandbox: process.env.AWS_SES_SANDBOX !== 'false',

    // End User Messaging SMS
    smsEnabled: process.env.AWS_SMS_ENABLED === 'true',
    smsSenderId: process.env.AWS_SMS_SENDER_ID?.trim() || undefined,
    smsOriginationIdentity: process.env.AWS_SMS_ORIGINATION_IDENTITY?.trim() || undefined,
    smsPoolId: process.env.AWS_SMS_POOL_ID?.trim() || undefined,
    smsSandbox: process.env.AWS_SMS_SANDBOX !== 'false',
    smsDltEntityId: process.env.AWS_SMS_DLT_ENTITY_ID?.trim() || undefined,
    smsDltTemplateId: process.env.AWS_SMS_DLT_TEMPLATE_ID?.trim() || undefined,

    // OTP Settings
    otpLength: Number.isFinite(otpLength) && otpLength >= 4 && otpLength <= 8 ? otpLength : 6,
    otpExpiryMinutes: Number.isFinite(otpExpiryMinutes) && otpExpiryMinutes >= 1 ? otpExpiryMinutes : 5,
    otpMaxAttempts: Number.isFinite(otpMaxAttempts) && otpMaxAttempts >= 1 ? otpMaxAttempts : 5,
    otpResendCooldownSeconds:
      Number.isFinite(otpResendCooldownSeconds) && otpResendCooldownSeconds >= 10
        ? otpResendCooldownSeconds
        : 60,
    otpHashSecret:
      process.env.OTP_HASH_SECRET?.trim() ||
      process.env.UPLOAD_TOKEN_SECRET?.trim() ||
      'glimpse-production-otp-hmac-sha256-default-secret',
    otpAllowTestMode: process.env.OTP_ALLOW_TEST_MODE === 'true',
  };
}

/**
 * Validates configuration for AWS OTP delivery.
 * Throws a specific configuration error without exposing secret credentials.
 */
export function validateOtpDeliveryConfig(channel?: OtpDeliveryChannel): void {
  const config = getOtpConfig();
  const errors: string[] = [];

  if (!config.awsRegion) {
    errors.push('AWS_REGION is required');
  }

  if (!config.awsAccessKeyId || config.awsAccessKeyId.length < 5) {
    errors.push('AWS_ACCESS_KEY_ID is missing or invalid');
  }

  if (!config.awsSecretAccessKey || config.awsSecretAccessKey.length < 10) {
    errors.push('AWS_SECRET_ACCESS_KEY is missing or invalid');
  }

  if (!config.otpHashSecret || config.otpHashSecret.length < 16) {
    errors.push('OTP_HASH_SECRET must be at least 16 characters long');
  }

  if (!channel || channel === 'email') {
    if (!config.sesFromEmail || !config.sesFromEmail.includes('@')) {
      errors.push('AWS_SES_FROM_EMAIL must be a valid email address');
    }
  }

  if (!channel || channel === 'sms') {
    if (config.smsEnabled) {
      if (!config.smsOriginationIdentity && !config.smsPoolId && !config.smsSenderId) {
        errors.push(
          'AWS SMS is enabled, but none of AWS_SMS_ORIGINATION_IDENTITY, AWS_SMS_POOL_ID, or AWS_SMS_SENDER_ID are configured'
        );
      }
    } else if (channel === 'sms') {
      errors.push('AWS SMS delivery is disabled in environment configuration (AWS_SMS_ENABLED is false)');
    }
  }

  if (errors.length > 0) {
    const errorMsg = `[AWS OTP Configuration Error] The following configuration issues were found:\n- ${errors.join(
      '\n- '
    )}`;
    throw new Error(errorMsg);
  }
}
