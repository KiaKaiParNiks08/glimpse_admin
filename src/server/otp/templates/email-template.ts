import type { EventBranding } from '../types.ts';

export const DEFAULT_BRANDING: EventBranding = {
  eventName: 'Glimpse',
  eventLogo: null,
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  buttonColor: '#2563eb',
  backgroundColor: '#f8fafc',
  footerText: 'Glimpse • Your Event Memory Platform',
};

/**
 * Resolve event branding from the database using event_id or event_code.
 * Falls back to default company branding if the event has no custom theme.
 */
export async function resolveEventBranding(
  eventId?: string | null,
  eventCode?: string | null
): Promise<EventBranding> {
  if (!eventId && !eventCode) {
    return DEFAULT_BRANDING;
  }

  try {
    const { default: prisma } = await import('../../prisma');
    const event = await prisma.events.findFirst({
      where: {
        ...(eventId ? { id: eventId } : {}),
        ...(eventCode ? { event_code: eventCode } : {}),
      },
      select: {
        title: true,
        cover_image: true,
        app_themes: {
          select: {
            primary_color: true,
            secondary_color: true,
            button_primary_color: true,
            button_secondary_color: true,
          },
        },
      },
    });

    if (!event) {
      return DEFAULT_BRANDING;
    }

    const theme = event.app_themes;
    return {
      eventName: event.title || DEFAULT_BRANDING.eventName,
      eventLogo: event.cover_image || null,
      primaryColor: theme?.primary_color || DEFAULT_BRANDING.primaryColor,
      secondaryColor: theme?.secondary_color || DEFAULT_BRANDING.secondaryColor,
      buttonColor: theme?.button_primary_color || DEFAULT_BRANDING.buttonColor,
      backgroundColor: '#f8fafc',
      footerText: `Powered by Glimpse • ${event.title}`,
    };
  } catch (error) {
    console.warn('[resolveEventBranding] Error querying event theme, using default:', error);
    return DEFAULT_BRANDING;
  }
}

/**
 * Escape HTML special characters to prevent injection.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderOtpEmailInput {
  otp: string;
  branding: EventBranding;
  expiryMinutes?: number;
}

export interface RenderOtpEmailOutput {
  subject: string;
  html: string;
  text: string;
}

/**
 * Renders a responsive, client-compatible HTML email and a plain text equivalent.
 */
export function renderOtpEmail(input: RenderOtpEmailInput): RenderOtpEmailOutput {
  const { otp, branding, expiryMinutes = 5 } = input;
  const escapedEventName = escapeHtml(branding.eventName);
  const primaryColor = escapeHtml(branding.primaryColor);
  const secondaryColor = escapeHtml(branding.secondaryColor);
  const footerText = escapeHtml(branding.footerText);

  const subject = `${branding.eventName}: Your Verification Code is ${otp}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapedEventName} Verification Code</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .otp-display { font-size: 28px !important; letter-spacing: 6px !important; padding: 16px 8px !important; }
    }
  </style>
</head>
<body style="background-color: #f8fafc; margin: 0; padding: 24px 0;">
  <center style="width: 100%; background-color: #f8fafc;">
    <div class="email-container" style="max-width: 540px; margin: 0 auto; padding: 20px;">
      
      <!-- Card Container -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        
        <!-- Header Banner with Brand Color Accent -->
        <tr>
          <td style="height: 6px; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>

        <!-- Branding / Header -->
        <tr>
          <td style="padding: 32px 32px 16px 32px; text-align: center;">
            ${
              branding.eventLogo
                ? `<img src="${escapeHtml(
                    branding.eventLogo
                  )}" alt="${escapedEventName}" style="max-height: 48px; max-width: 180px; object-fit: contain; margin-bottom: 12px; display: inline-block;" />`
                : ''
            }
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
              ${escapedEventName}
            </h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #64748b;">
              Verification Code Request
            </p>
          </td>
        </tr>

        <!-- Main Body -->
        <tr>
          <td style="padding: 16px 32px 24px 32px; text-align: center;">
            <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.5;">
              Use the single-use verification code below to log in and access your event photos and memories.
            </p>

            <!-- OTP Box -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 20px auto;">
              <tr>
                <td class="otp-display" style="background-color: #f0f7ff; border: 2px dashed ${primaryColor}; border-radius: 10px; padding: 18px 28px; font-family: 'SF Pro Display', Consolas, Menlo, Monaco, monospace; font-size: 34px; font-weight: 700; color: ${secondaryColor}; letter-spacing: 8px; text-align: center;">
                  ${otp}
                </td>
              </tr>
            </table>

            <!-- Expiry Notice -->
            <p style="margin: 0 0 24px 0; font-size: 13px; color: #64748b; display: flex; align-items: center; justify-content: center;">
              ⏱️ Valid for <strong>&nbsp;${expiryMinutes} minutes</strong>
            </p>

            <!-- Security Notice Box -->
            <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 12px 14px; text-align: left; margin: 0 0 8px 0;">
              <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.45;">
                <strong style="color: #0f172a;">🔒 Security Warning:</strong> Do not share this code with anyone. Glimpse and event administrators will never contact you to ask for this code. If you did not initiate this request, you can safely ignore this email.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
            <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #64748b;">
              ${footerText}
            </p>
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
              This is an automated transactional security message. Please do not reply directly to this email.
            </p>
          </td>
        </tr>

      </table>

    </div>
  </center>
</body>
</html>`;

  const text = `${branding.eventName} Verification Code

Your single-use verification code is: ${otp}

This code is valid for ${expiryMinutes} minutes.

SECURITY WARNING:
Do not share this code with anyone. Glimpse and event administrators will never ask for this code. If you did not request this verification code, you can safely ignore this message.

${branding.footerText}
(This is an automated security notification.)`;

  return { subject, html, text };
}
