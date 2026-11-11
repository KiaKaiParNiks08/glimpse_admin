import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { canContextAccessEvent, getAdminAccessContext } from '@/server/access';
import { isFaceWorkerAuthorized, isVercelCronAuthorized } from '@/lib/face-worker-auth';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';

function isUuidLike(val: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(val);
}

function isPublicApiPath(pathname: string): boolean {
  if (pathname === '/api/admin/login') return true;
  if (pathname === '/api/docs/openapi') return true;
  if (pathname === '/api/auth') return true;
  if (pathname.startsWith('/api/auth/')) return true;

  // Public media proxy: client uses opaque tokens in query params.
  if (pathname.startsWith('/api/upload/signed')) return true;
  if (pathname === '/api/app-configurations') return true;

  return false;
}

function getEventIdFromRequest(request: NextRequest): string | null {
  const { pathname, searchParams } = request.nextUrl;
  const segments = pathname.split('/').filter(Boolean);

  const eventIdFromPath =
    segments.length >= 3 && segments[0] === 'api' && segments[1] === 'events'
      ? segments[2]
      : null;

  const eventIdFromQuery = searchParams.get('event_id');

  if (eventIdFromPath && isUuidLike(eventIdFromPath)) return eventIdFromPath;
  if (eventIdFromQuery && isUuidLike(eventIdFromQuery)) return eventIdFromQuery;
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api');
  const isEventsApi = pathname.startsWith('/api/events');

  if (!isApi) return NextResponse.next();

  if (isPublicApiPath(pathname)) return NextResponse.next();

  if (pathname.startsWith('/api/internal/media/')) {
    if (!isFaceWorkerAuthorized(request) && !isVercelCronAuthorized(request) && !getAdminFromAuthorizationHeader(request)) {
      return NextResponse.json({ message: 'Not authenticated', data: null }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Require Bearer JWT for all protected API routes.
  const adminUser = getAdminFromAuthorizationHeader(request);
  const userAuth = adminUser ?? getUserFromAuthorizationHeader(request);

  if (!userAuth) {
    return NextResponse.json({ message: 'Not authenticated', data: null }, { status: 401 });
  }

  if (isEventsApi && adminUser) {
    // Non-super-admin accounts can only access event APIs within their tenant / assignments.
    const eventIdCandidate = getEventIdFromRequest(request);
    if (eventIdCandidate && adminUser.role_name !== 'super_admin') {
      const ctx = await getAdminAccessContext(adminUser.id);
      if (!ctx || !(await canContextAccessEvent(ctx, eventIdCandidate))) {
        return NextResponse.json({ message: 'Forbidden', data: null }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
  runtime: 'nodejs',
};
