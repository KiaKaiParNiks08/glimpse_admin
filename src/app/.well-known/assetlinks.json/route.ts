import { buildAssetLinks, jsonAssociation } from '@/lib/app-share';

export const dynamic = 'force-dynamic';

/** Android App Links. No auth and no redirect. Fingerprint comes from env when it is a real SHA-256. */
export function GET() {
  return jsonAssociation(buildAssetLinks());
}
