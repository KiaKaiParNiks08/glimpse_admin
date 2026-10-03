import { authVerifyRequestSchema, parseBody } from '@/lib/validations';
import { ok, badRequest, serverError } from '@/lib/api-response';
import { prisma, verifyOtpForUser } from '@/server';
import { createUserJwtToken } from '@/lib/jwt';

export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, authVerifyRequestSchema);
    if (err) return err;
    const result = await verifyOtpForUser({
      user_id: body.user_id,
      otp: body.otp,
    });

    if (!result.success) {
      return badRequest('Invalid or expired OTP. Please request a new one.');
    }

    // Resolve the user's latest event context so we can include `event_id` in the JWT.
    const latestGuest = await prisma.event_guests.findFirst({
      where: { user_id: body.user_id },
      orderBy: { joined_at: 'desc' },
      select: { event_id: true },
    });

    if (!latestGuest) {
      return badRequest('User event context not found. Please request OTP again.');
    }

    const { token, expires_at } = createUserJwtToken({
      user_id: body.user_id,
      event_id: latestGuest.event_id,
    });

    return ok(
      {
        user_id: body.user_id,
        event_id: latestGuest.event_id,
        token,
        expires_at,
      },
      'OTP verified successfully'
    );
  } catch (e) {
    console.error(e);
    return serverError('OTP verification failed');
  }
}
