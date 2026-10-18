/**
 * First-party event share links. The QR contains only our /join URL.
 * Store addresses come from env and are never sent to a QR vendor.
 */

const EVENT_CODE_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
const DEFAULT_ANDROID_STORE = 'https://play.google.com/store/apps/details?id=app.glimps';
const DEFAULT_IOS_STORE = 'https://apps.apple.com/app/id0000000000';

export function isShareEventCode(value: string): boolean {
  return EVENT_CODE_PATTERN.test(value);
}

export function appPublicOrigin(): string {
  const configured = process.env.APP_PUBLIC_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, '')}`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:3000';
}

export function appUrlScheme(): string {
  const scheme = process.env.APP_URL_SCHEME?.trim() || 'glimps';
  return scheme.replace(/[^a-z0-9+.-]/gi, '') || 'glimps';
}

export function androidPackageName(): string {
  return process.env.ANDROID_PACKAGE_NAME?.trim() || 'app.glimps';
}

export function iosBundleId(): string {
  return process.env.IOS_BUNDLE_ID?.trim() || 'app.glimps';
}

export function iosTeamId(): string {
  return process.env.IOS_TEAM_ID?.trim() || '';
}

export function androidCertFingerprints(): string[] {
  return (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Not a real certificate hash. Replaced only when ANDROID_SHA256_CERT_FINGERPRINTS is set. */
export const ANDROID_SHA256_PLACEHOLDER = 'REPLACE_WITH_REAL_PLAY_APP_SIGNING_SHA256';
/** Not a real Apple Team ID. Replaced only when IOS_TEAM_ID is a 10-character Team ID. */
export const IOS_TEAM_ID_PLACEHOLDER = 'REPLACE_WITH_REAL_TEAM_ID';

const SHA256_FINGERPRINT = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}$/;
const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;

export function configuredAndroidFingerprints(): string[] {
  return androidCertFingerprints().filter((value) => SHA256_FINGERPRINT.test(value));
}

export function androidAppLinksReady(): boolean {
  return configuredAndroidFingerprints().length > 0;
}

export function iosUniversalLinksReady(): boolean {
  return APPLE_TEAM_ID.test(iosTeamId());
}

export type AssetLinksFile = Array<{
  relation: ['delegate_permission/common.handle_all_urls'];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}>;

/** Public Android App Links file. Placeholder fingerprint means it is not production-ready. */
export function buildAssetLinks(): AssetLinksFile {
  const fingerprints = configuredAndroidFingerprints();
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: androidPackageName(),
        sha256_cert_fingerprints: fingerprints.length > 0 ? fingerprints : [ANDROID_SHA256_PLACEHOLDER],
      },
    },
  ];
}

export type AppleAppSiteAssociationFile = {
  applinks: {
    details: Array<{
      appIDs: string[];
      components: Array<{ '/': '/join/*' }>;
    }>;
  };
};

/** Public iOS Universal Links file. A placeholder Team ID means it is not production-ready. */
export function buildAppleAppSiteAssociation(): AppleAppSiteAssociationFile {
  const bundle = iosBundleId();
  const team = iosTeamId();
  const appId = APPLE_TEAM_ID.test(team) ? `${team}.${bundle}` : `${IOS_TEAM_ID_PLACEHOLDER}.${bundle}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appId],
          components: [{ '/': '/join/*' }],
        },
      ],
    },
  };
}

export function jsonAssociation(body: unknown): Response {
  return Response.json(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function platformFromUserAgent(userAgent: string): 'android' | 'ios' | 'other' {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  return 'other';
}

/** Exact event code is required. Cancelled and archived events are not joinable. */
export function joinPageAccess(input: {
  code: string;
  event: { event_code: string; status: string } | null;
}): { ok: true; eventCode: string } | { ok: false } {
  let code = input.code;
  try {
    code = decodeURIComponent(code).trim();
  } catch {
    return { ok: false };
  }
  if (!isShareEventCode(code)) return { ok: false };
  if (!input.event || input.event.event_code !== code) return { ok: false };
  if (input.event.status === 'cancelled' || input.event.status === 'archived') return { ok: false };
  return { ok: true, eventCode: input.event.event_code };
}

export function joinUrl(eventCode: string): string {
  return `${appPublicOrigin()}/join/${encodeURIComponent(eventCode)}`;
}

export function customSchemeUrl(eventCode: string): string {
  return `${appUrlScheme()}://join?event_code=${encodeURIComponent(eventCode)}`;
}

function storeUrl(envName: 'ANDROID_PLAY_STORE_URL' | 'IOS_APP_STORE_URL', fallback: string): string {
  const value = process.env[envName]?.trim();
  return value || fallback;
}

/**
 * Play Store listing for this package, with event_code inside the Install Referrer.
 * The referrer is read on the device by the Play Install Referrer API after an eligible install.
 * It is not sent to an analytics service. A non-Play URL is returned unchanged.
 */
export function androidStoreUrl(eventCode: string): string {
  if (!isShareEventCode(eventCode)) {
    throw new Error('Invalid event code');
  }
  const raw = storeUrl('ANDROID_PLAY_STORE_URL', DEFAULT_ANDROID_STORE);
  const url = new URL(raw);
  if (url.hostname !== 'play.google.com') return url.toString();
  const current = url.searchParams.get('referrer');
  const already = current?.split('&').some((part) => part.startsWith('event_code='));
  const next = already ? current! : current ? `${current}&event_code=${eventCode}` : `event_code=${eventCode}`;
  url.searchParams.set('referrer', next);
  return url.toString();
}

export function iosStoreUrl(): string {
  return storeUrl('IOS_APP_STORE_URL', DEFAULT_IOS_STORE);
}

export function androidIntentUrl(eventCode: string): string {
  const fallback = encodeURIComponent(androidStoreUrl(eventCode));
  const scheme = appUrlScheme();
  const pkg = androidPackageName();
  return `intent://join?event_code=${encodeURIComponent(eventCode)}#Intent;scheme=${scheme};package=${pkg};S.browser_fallback_url=${fallback};end`;
}
