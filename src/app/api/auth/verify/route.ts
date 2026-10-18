import { authVerifyRequestSchema, parseBody } from '@/lib/validations';
import { ok, badRequest, serverError } from '@/lib/api-response';
import { prisma, verifyOtpForUser } from '@/server';
import { createUserJwtToken } from '@/lib/jwt';
import { toAuthCategoryFields } from '@/server/auth-login';

type GuestEventRow = {
  event_id: string;
  event_category_id: string | null;
  event_category: string | null;
  event_type: string | null;
};

export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, authVerifyRequestSchema);
    if (err) return err;

    const [result, guestRows] = await Promise.all([
      verifyOtpForUser({
        user_id: body.user_id,
        otp: body.otp,
      }),
      body.event_id
        ? prisma.$queryRaw<GuestEventRow[]>`
            SELECT eg.event_id,
                   ec.id AS event_category_id,
                   ec.name AS event_category,
                   ec.slug AS event_type
            FROM event_guests eg
            JOIN events e ON e.id = eg.event_id
            JOIN event_categories ec ON ec.id = e.category_id
            WHERE eg.user_id = ${body.user_id}::uuid
              AND eg.event_id = ${body.event_id}::uuid
            LIMIT 1
          `
        : prisma.$queryRaw<GuestEventRow[]>`
            SELECT eg.event_id,
                   ec.id AS event_category_id,
                   ec.name AS event_category,
                   ec.slug AS event_type
            FROM event_guests eg
            JOIN events e ON e.id = eg.event_id
            JOIN event_categories ec ON ec.id = e.category_id
            WHERE eg.user_id = ${body.user_id}::uuid
            ORDER BY eg.joined_at DESC NULLS LAST
            LIMIT 1
          `,
    ]);

    if (!result.success) {
      return badRequest('Invalid or expired OTP. Please request a new one.');
    }

    const guest = guestRows[0];
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
        ...toAuthCategoryFields(
          guest.event_category_id && guest.event_category && guest.event_type
            ? { id: guest.event_category_id, name: guest.event_category, slug: guest.event_type }
            : null
        ),
      },
      'OTP verified successfully'
    );
  } catch (e) {
    console.error(e);
    return serverError('OTP verification failed');
  }
}
