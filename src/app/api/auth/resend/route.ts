import { authResendRequestSchema, parseBody } from '@/lib/validations';
import { ok, notFound, serverError } from '@/lib/api-response';
import { createOtpForUser, findUserByIdMinimal } from '@/server';

export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, authResendRequestSchema);
    if (err) return err;

    const { user_id } = body;

    const user = await findUserByIdMinimal(user_id);
    if (!user) {
      return notFound('User not found');
    }

    const { otp, expires_at } = await createOtpForUser({
      user_id,
      expiry_minutes: 10,
    });

    return ok(
      {
        user_id,
        otp,
        otp_expires_at: expires_at.toISOString(),
      },
      'OTP resent successfully'
    );
  } catch (e) {
    console.error(e);
    return serverError('Failed to resend OTP');
  }
}
