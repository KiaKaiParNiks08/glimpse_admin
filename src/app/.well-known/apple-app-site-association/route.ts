import { buildAppleAppSiteAssociation, jsonAssociation } from '@/lib/app-share';

export const dynamic = 'force-dynamic';

/** iOS Universal Links. The public URL has no .json suffix. */
export function GET() {
  return jsonAssociation(buildAppleAppSiteAssociation());
}
