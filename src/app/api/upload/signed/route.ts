import { NextRequest } from 'next/server';
import { getObjectStream } from '@/lib/s3-presign';
import { decryptToken } from '@/lib/upload-token';
import { badRequest, serverError } from '@/lib/api-response';

const ALLOWED_PREFIXES = ['venues/', 'uploads/', 'feed/', 'contacts/', 'explore/', 'events/', 'profile-pictures/'];

function isValidKey(key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * GET /api/upload/signed?t=TOKEN or ?key=...
 * Proxies the object from S3 to the browser. Client never sees S3 URLs or AWS credentials.
 * - ?t=TOKEN: opaque token (recommended); hides path structure.
 * - ?key=...: legacy; use only for existing stored URLs.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t');
    const keyParam = request.nextUrl.searchParams.get('key');

    let key: string;
    if (token && typeof token === 'string' && token.length > 0 && token.length <= 2048) {
      const decoded = decryptToken(token);
      if (!decoded || !isValidKey(decoded)) {
        return badRequest('Invalid or expired link');
      }
      key = decoded;
    } else if (keyParam && typeof keyParam === 'string' && keyParam.length <= 1024) {
      const decoded = decodeURIComponent(keyParam);
      if (!isValidKey(decoded)) {
        return badRequest('Invalid key prefix');
      }
      key = decoded;
    } else {
      return badRequest('Missing or invalid key or token');
    }

    const result = await getObjectStream(key);
    if (!result) {
      return serverError('Object not found');
    }

    const headers: Record<string, string> = {
      'Content-Type': result.contentType,
      'Cache-Control': result.cacheControl ?? 'private, max-age=3600',
    };
    if (result.contentLength != null) {
      headers['Content-Length'] = String(result.contentLength);
    }

    return new Response(result.body, { status: 200, headers });
  } catch (e) {
    console.error(e);
    return serverError('Failed to load object');
  }
}
