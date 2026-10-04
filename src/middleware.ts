import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isEventAdminAssigned } from '@/server/events';
import { isFaceWorkerAuthorized } from '@/lib/face-worker-auth';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';

function isUuidLike(val: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(val);
}


function isPublicApiPath(pathname: string): boolean {
  // Public endpoints (no admin JWT required).
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

  // Matches:
  // - /api/events/<eventId>
  // - /api/events/<eventId>/days
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

  if (pathname === '/api/internal/media/process') {
    if (!isFaceWorkerAuthorized(request)) {
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

  if (isEventsApi) {
    // event_admin can only access event APIs for events they are assigned to.
    const eventIdCandidate = getEventIdFromRequest(request);

    // If no eventId can be determined, allow request and let route validation handle it.
    if (eventIdCandidate && userAuth.role_name === 'event_admin') {
      const allowed = await isEventAdminAssigned(eventIdCandidate, userAuth.id);
      if (!allowed) {
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

