import crypto from 'crypto';
import prisma from '@/server/prisma';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function base64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64url');
}

/**
 * Obtain a Google OAuth2 access token for Firebase Cloud Messaging HTTP v1 API.
 * Uses native RS256 service account assertion signing without external dependencies.
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[fcm] Missing Firebase credentials in environment variables');
    return null;
  }

  // Handle escaped newlines in PEM string
  privateKey = privateKey.replace(/\\n/g, '\n');

  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  try {
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        exp: nowSec + 3600,
        iat: nowSec,
      })
    );

    const signable = `${header}.${claim}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signable);
    const signature = signer.sign(privateKey, 'base64url');
    const assertionJwt = `${signable}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: assertionJwt,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[fcm] Failed to exchange assertion for access token:', res.status, errText);
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      console.error('[fcm] OAuth response missing access_token:', data);
      return null;
    }

    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresInSec * 1000,
    };

    return cachedToken.accessToken;
  } catch (error) {
    console.error('[fcm] Error generating Google access token:', error);
    return null;
  }
}

export interface FcmPayload {
  tokens: string[];
  notification: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
}

export interface FcmSendResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

/**
 * Send push notifications via FCM HTTP v1 REST API.
 */
export async function sendFcmPush(payload: FcmPayload): Promise<FcmSendResult> {
  const result: FcmSendResult = {
    successCount: 0,
    failureCount: 0,
    invalidTokens: [],
  };

  const validTokens = [...new Set(payload.tokens.filter(Boolean))];
  if (validTokens.length === 0) {
    return result;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.warn('[fcm] FIREBASE_PROJECT_ID is not configured');
    return result;
  }

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    console.error('[fcm] Cannot send push notification: no valid Google access token');
    result.failureCount = validTokens.length;
    return result;
  }

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // FCM data values MUST all be strings
  const sanitizedData: Record<string, string> = {
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  };
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      if (v !== undefined && v !== null) {
        sanitizedData[k] = String(v);
      }
    }
  }

  // Send tokens concurrently in chunks of 25
  const CHUNK_SIZE = 25;
  for (let i = 0; i < validTokens.length; i += CHUNK_SIZE) {
    const chunk = validTokens.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(async (token) => {
      try {
        const body = {
          message: {
            token,
            notification: {
              title: payload.notification.title,
              body: payload.notification.body,
            },
            data: sanitizedData,
            android: {
              priority: 'high',
              notification: {
                channel_id: 'glimpse_notifications',
                sound: 'default',
                default_sound: true,
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                },
              },
            },
          },
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          result.successCount += 1;
        } else {
          result.failureCount += 1;
          const errorJson = (await res.json().catch(() => null)) as {
            error?: { code?: number; message?: string; status?: string };
          } | null;

          const errorStatus = errorJson?.error?.status || '';
          const errorCode = errorJson?.error?.code || res.status;
          const errorMessage = errorJson?.error?.message || '';

          // Check if token is invalid or unregistered
          if (
            errorCode === 404 ||
            errorStatus === 'NOT_FOUND' ||
            errorMessage.includes('UNREGISTERED') ||
            errorMessage.includes('registration-token-not-registered') ||
            errorMessage.includes('InvalidArgument')
          ) {
            result.invalidTokens.push(token);
          } else {
            console.warn('[fcm] Message delivery failed:', token.slice(0, 15) + '...', errorMessage);
          }
        }
      } catch (err) {
        result.failureCount += 1;
        console.error('[fcm] Network/send error for token:', token.slice(0, 15) + '...', err);
      }
    });

    await Promise.allSettled(promises);
  }

  // Deactivate expired or invalid device tokens
  if (result.invalidTokens.length > 0) {
    try {
      await prisma.user_devices.updateMany({
        where: { device_id: { in: result.invalidTokens } },
        data: { is_active: false, updated_at: new Date() },
      });
      console.info(`[fcm] Deactivated ${result.invalidTokens.length} invalid/unregistered device tokens`);
    } catch (dbErr) {
      console.error('[fcm] Error deactivating invalid device tokens:', dbErr);
    }
  }

  return result;
}
