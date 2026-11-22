import { parseParams, parseBody } from '@/lib/validations';
import {
  userIdPathSchema,
  confirmLoginChangeSchema,
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
import { verifyOtpForUser } from '@/server/otp/service';
import prisma from '@/server/prisma';
import type { Prisma } from '@prisma/client';

type RouteContext = { params: Promise<{ user_id: string }> };

/**
 * POST /api/users/[user_id]/login-change/confirm
 * Confirms changing the user's primary login identifier (email or mobile) with OTP.
 * On success, updates login and returns the user profile envelope.
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

    const [body, bodyErr] = await parseBody(request, confirmLoginChangeSchema);
    if (bodyErr) return bodyErr;

    const user = await prisma.users.findUnique({
      where: { id: path.user_id },
      select: {
        id: true,
        full_name: true,
        avatar_url: true,
        email: true,
        mobile_number: true,
        country_code: true,
        instagram_id: true,
        linkedin_url: true,
      },
    });
    if (!user) return notFound('User not found');

    if (body.email) {
      const normalizedEmail = body.email.trim().toLowerCase();
      const inUse = await findUserByEmail(normalizedEmail, path.user_id);
      if (inUse) {
        return conflict('Email is already in use by another account');
      }
    } else if (body.mobile_number) {
      const normalizedMobile = body.mobile_number.trim();
      const inUse = await findUserByMobileNumber(normalizedMobile, path.user_id);
      if (inUse) {
        return conflict('Mobile number is already in use by another account');
      }
    }

    const verification = await verifyOtpForUser({
      userId: user.id,
      otp: body.otp,
    });

    if (!verification.success) {
      return badRequest('Invalid or expired OTP');
    }

    const updateData: Prisma.usersUpdateInput = {};
    if (body.email) {
      updateData.email = body.email.trim().toLowerCase();
      updateData.primary_login_type = 'email';
    } else if (body.mobile_number) {
      updateData.mobile_number = body.mobile_number.trim();
      if (body.country_code) {
        updateData.country_code = body.country_code.trim();
      }
      updateData.primary_login_type = 'mobile';
    }

    const updatedUser = await prisma.users.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        full_name: true,
        avatar_url: true,
        email: true,
        mobile_number: true,
        country_code: true,
        instagram_id: true,
        linkedin_url: true,
      },
    });

    const faceRef = await prisma.user_face_references.findUnique({
      where: { user_id: user.id },
      select: { consent: true, storage_key: true, processing_status: true },
    });
    const hasEstablishedReference = Boolean(
      faceRef &&
        faceRef.consent &&
        faceRef.storage_key &&
        faceRef.processing_status !== 'failed'
    );
    const can_replace_profile_photo = !hasEstablishedReference;

    return ok({
      user_id: updatedUser.id,
      id: updatedUser.id,
      full_name: updatedUser.full_name,
      avatar_url: updatedUser.avatar_url,
      email: updatedUser.email,
      mobile_number: updatedUser.mobile_number,
      country_code: updatedUser.country_code,
      instagram_id: updatedUser.instagram_id,
      linkedin_url: updatedUser.linkedin_url,
      can_replace_profile_photo,
    }, 'Login updated successfully');
  } catch (e) {
    console.error('[login-change/confirm] Error:', e);
    return serverError('Unable to confirm login change');
  }
}
