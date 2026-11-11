import { NextRequest } from 'next/server';
import { getObjectStream } from '@/lib/s3-presign';
import { decryptToken } from '@/lib/upload-token';
import { badRequest, notFound, serverError } from '@/lib/api-response';

const ALLOWED_PREFIXES = ['venues/', 'uploads/', 'feed/', 'contacts/', 'explore/', 'events/', 'profile-pictures/'];

function isValidKey(key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * GET /api/upload/signed?t=TOKEN or ?key=...
 * Proxies private S3 media objects with Edge CDN caching and HTTP Range (206) support for smooth mobile video playback.
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

    const range = request.headers.get('range');
    let result;
    try {
      result = await getObjectStream(key, range);
    } catch (err: unknown) {
      const s3Err = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (s3Err?.name === 'NoSuchKey' || s3Err?.$metadata?.httpStatusCode === 404) {
        return notFound('Object not found');
      }
      if (s3Err?.$metadata?.httpStatusCode === 416) {
        return new Response(null, { status: 416 });
      }
      throw err;
    }

    if (!result) {
      return notFound('Object not found');
    }

    const ifNoneMatch = request.headers.get('if-none-match');
    if (result.etag && ifNoneMatch && ifNoneMatch === result.etag && result.statusCode === 200) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: result.etag,
          'Cache-Control': result.cacheControl ?? 'public, max-age=31536000, s-maxage=31536000, immutable',
        },
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': result.contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control':
        result.statusCode === 206
          ? 'public, max-age=3600, s-maxage=3600'
          : result.cacheControl ?? 'public, max-age=31536000, s-maxage=31536000, immutable',
      Vary: 'Range',
    };
    if (result.contentLength != null) {
      headers['Content-Length'] = String(result.contentLength);
    }
    if (result.contentRange) {
      headers['Content-Range'] = result.contentRange;
    }
    if (result.etag) {
      headers['ETag'] = result.etag;
    }

    return new Response(result.body, { status: result.statusCode, headers });
  } catch (e) {
    console.error(e);
    return serverError('Failed to load object');
  }
}
