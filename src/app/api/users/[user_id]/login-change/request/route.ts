import { parseParams, parseBody } from '@/lib/validations';
import {
  userIdPathSchema,
  requestLoginChangeSchema,
} from '@/lib/validations/users';
import {
  ok,
  notFound,
  conflict,
  unauthorized,
  forbidden,
  badRequest,
  serverError,
} from '@/lib/api-response';
import { getUserFromAuthorizationHeader, getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { findUserByEmail, findUserByMobileNumber } from '@/server/users';
import { sendOtpForUser } from '@/server/otp/service';
import prisma from '@/server/prisma';

type RouteContext = { params: Promise<{ user_id: string }> };

/**
 * POST /api/users/[user_id]/login-change/request
 * Initiates changing the user's primary login identifier (email or mobile).
 * Sends a one-time OTP to the new identifier.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, userIdPathSchema);
    if (pathErr) return pathErr;

    const tokenUser = getUserFromAuthorizationHeader(request);
    const adminUser = getAdminFromAuthorizationHeader(request);

    if (!tokenUser && !adminUser) {
      return unauthorized('Authentication required');
    }
    if (tokenUser && tokenUser.id !== path.user_id && !adminUser) {
      return forbidden('You can only change login credentials for your own account');
    }

    const [body, bodyErr] = await parseBody(request, requestLoginChangeSchema);
    if (bodyErr) return bodyErr;

    const user = await prisma.users.findUnique({
      where: { id: path.user_id },
      select: { id: true, email: true, mobile_number: true, country_code: true },
    });
    if (!user) return notFound('User not found');

    let sendResult;

    if (body.email) {
      const normalizedEmail = body.email.trim().toLowerCase();
      const inUse = await findUserByEmail(normalizedEmail, path.user_id);
      if (inUse) {
        return conflict('Email is already in use by another account');
      }

      sendResult = await sendOtpForUser({
        userId: user.id,
        channel: 'email',
        destination: normalizedEmail,
      });
    } else if (body.mobile_number) {
      const normalizedMobile = body.mobile_number.trim();
      const inUse = await findUserByMobileNumber(normalizedMobile, path.user_id);
      if (inUse) {
        return conflict('Mobile number is already in use by another account');
      }

      const countryCode = body.country_code?.trim() || user.country_code || '+91';

      sendResult = await sendOtpForUser({
        userId: user.id,
        channel: 'sms',
        destination: normalizedMobile,
        countryCode,
      });
    } else {
      return badRequest('Provide either email or mobile_number');
    }

    return ok({
      message: 'OTP sent to new destination',
      otp_expires_at: sendResult.expiresAt.toISOString(),
      delivery_channel: sendResult.deliveryChannel,
      destination_masked: sendResult.destinationMasked,
    });
  } catch (e) {
    console.error('[login-change/request] Error:', e);
    const message = e instanceof Error ? e.message : 'Unable to request login change';
    return serverError(message);
  }
}
