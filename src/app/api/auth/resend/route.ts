import { authResendRequestSchema, parseBody } from '@/lib/validations';
import { ok, notFound, serverError, badRequest } from '@/lib/api-response';
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
    if (e instanceof Error) {
      if (e.message.startsWith('Please wait') || e.message.includes('Too many OTP requests')) {
        return badRequest(e.message);
      }
      if (
        e.message.includes('AWS') ||
        e.message.includes('Sandbox') ||
        e.message.includes('Configuration Error') ||
        e.message.includes('SES') ||
        e.message.includes('SMS') ||
        e.message.includes('E.164')
      ) {
        return badRequest(e.message);
      }
    }
    console.error(e);
    return serverError('Failed to resend OTP');
  }
}
