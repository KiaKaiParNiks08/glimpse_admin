import {
  parseParams,
  parseBody,
  parseQuery,
  patchUserBodySchema,
  toUpdateUserInput,
  userIdPathSchema,
  getUserByIdQuerySchema,
} from '@/lib/validations';
import { ok, notFound, serverError, noContent, conflict, forbidden, badRequest } from '@/lib/api-response';
import { getUserById, updateUser, deleteUser, findUserByMobileNumber } from '@/server/users';
import { updateGuestWeddingSide } from '@/server/event-guests';
import { prisma } from '@/server';
import { Prisma } from '@prisma/client';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';

/**
 * GET /api/users/[user_id]
 * Returns user details for the given user_id (UUID). Excludes password_hash.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ user_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, err] = parseParams(params, userIdPathSchema);
    if (err) return err;
    const { searchParams } = new URL(request.url);
    const [query, queryErr] = parseQuery(searchParams, getUserByIdQuerySchema);
    if (queryErr) return queryErr;

    const user = await getUserById(path.user_id);
    if (!user) return notFound('User not found');

    const role = await prisma.roles.findUnique({
      where: { id: user.role_id },
      select: { name: true },
    });

    // OTP verification status only (no device-based logic): if there's a non-expired verified OTP record.
    const verifiedNonExpiredOtp = await prisma.user_otps.findFirst({
      where: { user_id: user.id, is_verified: true, expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });
    const isVerified = Boolean(verifiedNonExpiredOtp);

    // For app "user" role, include e-invite PDF URL from requested event_id,
    // otherwise from the user's most recently joined event. Wedding events also expose
    // wedding_side (Groom/Bride) on the guest row for profile UI.
    if (role?.name === 'user') {
      const guestEvent = query.event_id
        ? await prisma.event_guests.findFirst({
            where: { user_id: user.id, event_id: query.event_id },
            select: { event_id: true },
          })
        : await prisma.event_guests.findFirst({
            where: { user_id: user.id },
            orderBy: [{ joined_at: 'desc' }, { created_at: 'desc' }],
            select: { event_id: true },
          });

      let invitePdfUrl: string | null = null;
      let wedding_side: string | null = null;
      let can_edit_wedding_side = false;

      if (guestEvent?.event_id) {
        const [inviteRows, weddingRows, eventDetail] = await Promise.all([
          prisma.$queryRaw<Array<{ e_invite_pdf_url: string | null }>>(
            Prisma.sql`SELECT e_invite_pdf_url FROM events WHERE id = ${guestEvent.event_id}::uuid LIMIT 1`
          ),
          prisma.$queryRaw<Array<{ wedding_side: string | null }>>(
            Prisma.sql`SELECT wedding_side FROM event_guests WHERE event_id = ${guestEvent.event_id}::uuid AND user_id = ${user.id}::uuid LIMIT 1`
          ),
          prisma.events.findUnique({
            where: { id: guestEvent.event_id },
            select: { event_categories: { select: { slug: true } } },
          }),
        ]);
        invitePdfUrl = inviteRows[0]?.e_invite_pdf_url ?? null;
        const isWedding = eventDetail?.event_categories.slug === 'wedding';
        can_edit_wedding_side = Boolean(isWedding);
        if (isWedding) {
          wedding_side = weddingRows[0]?.wedding_side ?? null;
        }
      }

      return ok({
        data: {
          ...user,
          e_invite_pdf_url: invitePdfUrl,
          wedding_side,
          can_edit_wedding_side,
          isVerified,
        },
      });
    }

    return ok({ data: { ...user, isVerified } });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch user details');
  }
}

/**
 * PATCH /api/users/[user_id]
 * Updates user profile. Only provided fields are updated. Password is hashed if sent.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ user_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, userIdPathSchema);
    if (pathErr) return pathErr;

    const [body, bodyErr] = await parseBody(request, patchUserBodySchema);
    if (bodyErr) return bodyErr;

    if (body.mobile_number !== undefined) {
      const mobile = typeof body.mobile_number === 'string' ? body.mobile_number.trim() : '';
      if (mobile) {
        const existing = await findUserByMobileNumber(mobile, path.user_id);
        if (existing) {
          return conflict('Mobile number already in use');
        }
      }
    }

    if (body.wedding_side !== undefined) {
      const appUser = getUserFromAuthorizationHeader(request);
      if (appUser) {
        if (appUser.id !== path.user_id || appUser.event_id !== body.event_id) {
          return forbidden('You can only update wedding side for your account and current event');
        }
      }

      const sideResult = await updateGuestWeddingSide({
        user_id: path.user_id,
        event_id: body.event_id!,
        wedding_side: body.wedding_side,
      });
      if (!sideResult.ok) {
        if (sideResult.reason === 'not_guest') {
          return forbidden('User is not a guest of this event');
        }
        return badRequest('Wedding side can only be set when the event category is wedding');
      }
    }

    const user = await updateUser(path.user_id, toUpdateUserInput(body));
    if (!user) return notFound('User not found');

    return ok({ data: user });
  } catch (e: unknown) {
    console.error(e);
    return serverError('Unable to update user');
  }
}

/**
 * DELETE /api/users/[user_id]
 * Deletes a user by id. Returns 204 on success, 404 if not found.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ user_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, pathErr] = parseParams(params, userIdPathSchema);
    if (pathErr) return pathErr;

    const deleted = await deleteUser(path.user_id);
    if (!deleted) return notFound('User not found');

    return noContent();
  } catch (e: unknown) {
    console.error(e);
    return serverError('Unable to delete user');
  }
}
