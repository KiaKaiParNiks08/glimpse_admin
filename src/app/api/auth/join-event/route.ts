import { NextResponse } from 'next/server';
import { authJoinEventRequestSchema, parseBody } from '@/lib/validations';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { joinAuthenticatedUserToEvent } from '@/server/auth-join';

function joinEventJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/auth/join-event
 * Logged-in guest joins (or switches to) an event from the in-app sheet or QR. No OTP.
 * Does not change POST /api/auth, /api/auth/verify, or /api/auth/switch-event.
 */
export async function POST(request: Request) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    if (!user) {
      return joinEventJson(401, { success: false, message: 'Not authenticated' });
    }

    const [body, err] = await parseBody(request, authJoinEventRequestSchema);
    if (err) {
      const parsed = (await err.json()) as { message?: string };
      return joinEventJson(err.status, { success: false, message: parsed.message || 'Validation failed' });
    }

    const result = await joinAuthenticatedUserToEvent({
      userId: user.id,
      event_code: body.event_code,
      event_id: body.event_id,
      device_type: body.device_type,
      device_id: body.device_id,
    });
    if (!result.ok) {
      return joinEventJson(result.status, { success: false, message: result.message });
    }

    return joinEventJson(200, {
      success: true,
      message: 'Joined event',
      data: result.data,
    });
  } catch (error) {
    console.error('POST /api/auth/join-event', error);
    return joinEventJson(500, { success: false, message: 'Unable to join event' });
  }
}
