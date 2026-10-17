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

    const guest = body.event_id
      ? await prisma.event_guests.findUnique({
          where: { event_id_user_id: { event_id: body.event_id, user_id: body.user_id } },
          select: { event_id: true },
        })
      : await prisma.event_guests.findFirst({
          where: { user_id: body.user_id },
          orderBy: { joined_at: 'desc' },
          select: { event_id: true },
        });

    if (!guest) {
      return badRequest('User event context not found. Please request OTP again.');
    }

    const { token, expires_at } = createUserJwtToken({
      user_id: body.user_id,
      event_id: guest.event_id,
    });

    return ok(
      {
        user_id: body.user_id,
        event_id: guest.event_id,
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
