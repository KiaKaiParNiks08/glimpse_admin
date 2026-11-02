export type OtpDeliveryChannel = 'email' | 'sms';

export interface EventBranding {
  eventName: string;
  eventLogo: string | null;
  primaryColor: string;
  secondaryColor: string;
  buttonColor: string;
  backgroundColor: string;
  footerText: string;
}

export interface OtpConfig {
  awsRegion: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  // SES Email
  sesFromEmail: string;
  sesFromName: string;
  sesConfigurationSet?: string;
  sesSandbox: boolean;
  // End User Messaging SMS
  smsEnabled: boolean;
  smsSenderId?: string;
  smsOriginationIdentity?: string;
  smsPoolId?: string;
  smsSandbox: boolean;
  smsDltEntityId?: string;
  smsDltTemplateId?: string;
  // OTP Settings
  otpLength: number;
  otpExpiryMinutes: number;
  otpMaxAttempts: number;
  otpResendCooldownSeconds: number;
  otpHashSecret: string;
  otpAllowTestMode: boolean;
}

export interface SendOtpOptions {
  userId: string;
  channel: OtpDeliveryChannel;
  destination: string; // email address or phone number
  countryCode?: string | null;
  eventId?: string | null;
  eventCode?: string | null;
  ipAddress?: string | null;
}

export interface SendOtpResult {
  requestId: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  deliveryChannel: OtpDeliveryChannel;
  destinationMasked: string;
  otp?: string; // Only populated when OTP_ALLOW_TEST_MODE is true
}

export interface VerifyOtpOptions {
  userId: string;
  otp: string;
  eventId?: string | null;
}

export interface VerifyOtpResult {
  success: boolean;
  reason?: 'invalid' | 'expired' | 'max_attempts_exceeded' | 'not_found' | 'already_consumed';
  remainingAttempts?: number;
}

export interface ProviderDeliveryResult {
  success: boolean;
  messageId?: string;
  statusCode?: string;
  errorCode?: string;
  errorMessage?: string;
  isSandboxRestriction?: boolean;
}
