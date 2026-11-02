import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
  type SendTextMessageCommandInput,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { getOtpConfig, validateOtpDeliveryConfig } from '../config';
import type { ProviderDeliveryResult } from '../types';
import { maskPhone, normalizeE164 } from '../crypto';

let cachedSmsClient: PinpointSMSVoiceV2Client | null = null;
let cachedClientRegion: string | null = null;

function getSmsClient(): PinpointSMSVoiceV2Client {
  const config = getOtpConfig();
  if (cachedSmsClient && cachedClientRegion === config.awsRegion) {
    return cachedSmsClient;
  }

  cachedSmsClient = new PinpointSMSVoiceV2Client({
    region: config.awsRegion,
    credentials:
      config.awsAccessKeyId && config.awsSecretAccessKey
        ? {
            accessKeyId: config.awsAccessKeyId,
            secretAccessKey: config.awsSecretAccessKey,
          }
        : undefined,
    maxAttempts: 3,
  });
  cachedClientRegion = config.awsRegion;

  return cachedSmsClient;
}

export interface SendSmsOtpInput {
  destinationPhone: string;
  countryCode?: string | null;
  otp: string;
  brandName?: string;
  expiryMinutes?: number;
}

/**
 * Send an OTP verification SMS using AWS End User Messaging SMS (Pinpoint SMS Voice v2).
 */
export async function sendAwsSmsOtp(input: SendSmsOtpInput): Promise<ProviderDeliveryResult> {
  const config = getOtpConfig();

  // Validate configuration before dispatching
  validateOtpDeliveryConfig('sms');

  const {
    destinationPhone,
    countryCode,
    otp,
    brandName = 'Glimpse',
    expiryMinutes = config.otpExpiryMinutes,
  } = input;

  // 1. Strictly normalize destination to E.164
  const e164 = normalizeE164(destinationPhone, countryCode);
  const maskedPhone = maskPhone(e164);

  // 2. Build short transactional message (guaranteed <= 160 characters for single-segment GSM-7 delivery)
  // e.g. "Glimpse: Your verification code is 123456. Valid for 5 minutes. Do not share this code."
  const cleanBrand = (brandName || 'Glimpse').replace(/[^\w\s-]/g, '').trim().slice(0, 20);
  const messageBody = `${cleanBrand}: Your verification code is ${otp}. Valid for ${expiryMinutes} minutes. Do not share this code.`;

  const client = getSmsClient();

  // 3. Sender Identity & Origination Configuration
  const commandInput: SendTextMessageCommandInput = {
    DestinationPhoneNumber: e164,
    MessageBody: messageBody,
    MessageType: 'TRANSACTIONAL',
    ...(config.smsPoolId
      ? { OriginationIdentity: config.smsPoolId }
      : config.smsOriginationIdentity
      ? { OriginationIdentity: config.smsOriginationIdentity }
      : {}),
    ...(config.smsSenderId ? { SenderId: config.smsSenderId } : {}),
    ...(config.sesConfigurationSet ? { ConfigurationSetName: config.sesConfigurationSet } : {}),
  };

  // 4. India DLT (Telecom Regulatory Authority of India) Entity & Template ID Support
  // Required when destination country is India (+91)
  if (e164.startsWith('+91') && config.smsDltEntityId && config.smsDltTemplateId) {
    commandInput.Context = {
      'aws:dlt:entity-id': config.smsDltEntityId,
      'aws:dlt:template-id': config.smsDltTemplateId,
    };
  }

  try {
    const response = await client.send(new SendTextMessageCommand(commandInput));

    return {
      success: true,
      messageId: response.MessageId,
      statusCode: '200',
    };
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string; Code?: string; code?: string };
    const errCode = error.name || error.Code || error.code || 'SMS_DELIVERY_ERROR';
    const rawMessage = error.message || String(err);

    // Sandbox restriction handling
    const isSandboxRestriction =
      rawMessage.toLowerCase().includes('not verified in the sms sandbox') ||
      rawMessage.toLowerCase().includes('not verified in the sandbox') ||
      rawMessage.toLowerCase().includes('is not verified in this account');

    let diagnosticMessage = rawMessage;
    if (isSandboxRestriction) {
      diagnosticMessage = `AWS SMS Sandbox Restriction: Destination number ${maskedPhone} is not verified in the AWS End User Messaging SMS sandbox. In sandbox mode, destination numbers must be verified in the AWS console before sending.`;
    } else if (errCode === 'AccessDeniedException') {
      diagnosticMessage = `AWS SMS Access Denied: Ensure IAM credentials have permissions for "sms-voice:SendTextMessage" in region "${config.awsRegion}".`;
    } else if (errCode === 'ValidationException') {
      diagnosticMessage = `AWS SMS Validation Error: ${rawMessage}`;
    }

    console.error(`[AWS SMS Error] [${errCode}]:`, diagnosticMessage);

    return {
      success: false,
      errorCode: errCode,
      errorMessage: diagnosticMessage,
      isSandboxRestriction,
    };
  }
}
