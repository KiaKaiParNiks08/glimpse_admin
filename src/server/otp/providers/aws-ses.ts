import { SESClient, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-ses';
import { getOtpConfig, validateOtpDeliveryConfig } from '../config';
import type { EventBranding, ProviderDeliveryResult } from '../types';
import { renderOtpEmail } from '../templates/email-template';

let cachedSesClient: SESClient | null = null;
let cachedClientRegion: string | null = null;

function getSesClient(): SESClient {
  const config = getOtpConfig();
  if (cachedSesClient && cachedClientRegion === config.awsRegion) {
    return cachedSesClient;
  }

  cachedSesClient = new SESClient({
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

  return cachedSesClient;
}

export interface SendSesEmailOtpInput {
  toEmail: string;
  otp: string;
  branding: EventBranding;
  expiryMinutes?: number;
}

/**
 * Send an OTP verification email using Amazon SES HTTP v3 SDK.
 */
export async function sendSesEmailOtp(input: SendSesEmailOtpInput): Promise<ProviderDeliveryResult> {
  const config = getOtpConfig();

  // Validate configuration before dispatching
  validateOtpDeliveryConfig('email');

  const { toEmail, otp, branding, expiryMinutes = config.otpExpiryMinutes } = input;
  const { subject, html, text } = renderOtpEmail({ otp, branding, expiryMinutes });

  const client = getSesClient();

  const sourceHeader = config.sesFromName
    ? `"${config.sesFromName.replace(/"/g, '')}" <${config.sesFromEmail}>`
    : config.sesFromEmail;

  const commandInput: SendEmailCommandInput = {
    Source: sourceHeader,
    Destination: {
      ToAddresses: [toEmail.trim()],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: html,
          Charset: 'UTF-8',
        },
        Text: {
          Data: text,
          Charset: 'UTF-8',
        },
      },
    },
    ...(config.sesConfigurationSet ? { ConfigurationSetName: config.sesConfigurationSet } : {}),
  };

  try {
    const response = await client.send(new SendEmailCommand(commandInput));

    return {
      success: true,
      messageId: response.MessageId,
      statusCode: '200',
    };
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string; Code?: string; code?: string };
    const errCode = error.name || error.Code || error.code || 'SES_DELIVERY_ERROR';
    const rawMessage = error.message || String(err);

    // Sandbox restriction handling
    const isSandboxRestriction =
      errCode === 'MessageRejected' &&
      (rawMessage.includes('Email address is not verified') ||
        rawMessage.includes('not verified') ||
        rawMessage.includes('domain is not verified'));

    let diagnosticMessage = rawMessage;
    if (isSandboxRestriction) {
      diagnosticMessage = `AWS SES Sandbox Restriction: Recipient "${toEmail}" is not verified in the AWS SES account. In sandbox mode, you must verify destination email addresses in the AWS SES console or request SES production access.`;
    } else if (errCode === 'ConfigurationSetDoesNotExistException') {
      diagnosticMessage = `AWS SES Configuration Set "${config.sesConfigurationSet}" does not exist in region "${config.awsRegion}".`;
    } else if (errCode === 'InvalidClientTokenId' || errCode === 'SignatureDoesNotMatch') {
      diagnosticMessage = 'AWS Authentication Failed: Invalid AWS access key or secret key for SES.';
    }

    console.error(`[AWS SES Error] [${errCode}]:`, diagnosticMessage);

    return {
      success: false,
      errorCode: errCode,
      errorMessage: diagnosticMessage,
      isSandboxRestriction,
    };
  }
}
