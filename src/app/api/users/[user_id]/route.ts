import {
  parseParams,
  parseBody,
  parseQuery,
  patchUserBodySchema,
  toUpdateUserInput,
  userIdPathSchema,
  getUserByIdQuerySchema,
} from '@/lib/validations';
import { ok, notFound, serverError, noContent, conflict, forbidden, badRequest, unauthorized } from '@/lib/api-response';
import { getUserById, updateUser, deleteUser, findUserByMobileNumber } from '@/server/users';
import { isEventGuest, updateGuestWeddingSide } from '@/server/event-guests';
import { withResolvedSocialLinks } from '@/lib/user-event-profile';
import {
  getUserEventProfile,
  overlayEventProfile,
  resolveAuthorUserWithEventProfile,
  upsertUserEventProfile,
} from '@/server/user-event-profiles';
import { prisma } from '@/server';
import { Prisma } from '@prisma/client';
import { getUserFromAuthorizationHeader, getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { listPreviousEventsForUsers } from '@/server/user-devices';

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

    const tokenUser = getUserFromAuthorizationHeader(request);
    const adminUser = getAdminFromAuthorizationHeader(request);
    const isOwn = tokenUser?.id === user.id;
    const isOwnOrAdmin = Boolean(isOwn || adminUser);

    // For app "user" role, include e-invite PDF URL from requested event_id,
    // otherwise from the user's most recently joined event. Wedding events also expose
    // wedding_side (Groom/Bride) on the guest row for profile UI.
    if (role?.name === 'user') {
      const joinedEvents = await listPreviousEventsForUsers([user.id]);
      const joinedIds = new Set(joinedEvents.map((event) => event.event_id));
      const requestedId =
        query.event_id && joinedIds.has(query.event_id) ? query.event_id : null;
      const tokenEventId =
        tokenUser?.id === user.id && joinedIds.has(tokenUser.event_id) ? tokenUser.event_id : null;
      const current_event_id = requestedId ?? tokenEventId ?? joinedEvents[0]?.event_id ?? null;

      let invitePdfUrl: string | null = null;
      let wedding_side: string | null = null;
      let can_edit_wedding_side = false;

      if (current_event_id) {
        const [inviteRows, weddingRows, eventDetail] = await Promise.all([
          prisma.$queryRaw<Array<{ e_invite_pdf_url: string | null }>>(
            Prisma.sql`SELECT e_invite_pdf_url FROM events WHERE id = ${current_event_id}::uuid LIMIT 1`
          ),
          prisma.$queryRaw<Array<{ wedding_side: string | null }>>(
            Prisma.sql`SELECT wedding_side FROM event_guests WHERE event_id = ${current_event_id}::uuid AND user_id = ${user.id}::uuid LIMIT 1`
          ),
          prisma.events.findUnique({
            where: { id: current_event_id },
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

      const eventProfile = current_event_id
        ? await getUserEventProfile(user.id, current_event_id)
        : null;
      const resolved = resolveAuthorUserWithEventProfile(user, eventProfile, { isOwnProfile: isOwnOrAdmin });

      const show_instagram = resolved.is_instagram_visible;
      const show_linkedin = resolved.is_linkedin_visible;

      return ok({
        data: {
          user_id: user.id,
          id: user.id,
          full_name: resolved.full_name,
          email: isOwnOrAdmin ? user.email : null,
          mobile_number: isOwnOrAdmin ? user.mobile_number : null,
          country_code: isOwnOrAdmin ? user.country_code : null,
          avatar_url: user.avatar_url,
          instagram_id: resolved.instagram_id,
          linkedin_url: resolved.linkedin_url,
          can_replace_profile_photo,
          wedding_side: resolved.wedding_side ?? wedding_side,
          can_edit_wedding_side,
          show_instagram,
          show_linkedin,
          is_instagram_visible: show_instagram,
          is_linkedin_visible: show_linkedin,
          event_profile: current_event_id
            ? {
                event_id: current_event_id,
                wedding_side: resolved.wedding_side ?? wedding_side,
                can_edit_wedding_side,
                show_instagram,
                show_linkedin,
                is_instagram_visible: show_instagram,
                is_linkedin_visible: show_linkedin,
              }
            : null,
          e_invite_pdf_url: invitePdfUrl,
          isVerified,
          current_event_id,
          allow_new_event_login: true,
          events: joinedEvents.map((event) => ({
            event_id: event.event_id,
            event_code: event.event_code,
            title: event.title,
            start_date: event.start_date,
            end_date: event.end_date,
            cover_image: event.cover_image,
            is_current: event.event_id === current_event_id,
            event_type: event.event_type,
            show_wedding_side: event.show_wedding_side,
          })),
        },
      });
    }

    return ok({
      data: {
        user_id: user.id,
        ...withResolvedSocialLinks(user),
        can_replace_profile_photo,
        isVerified,
      },
    });
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

    const existingUser = await prisma.users.findUnique({
      where: { id: path.user_id },
      select: {
        id: true,
        email: true,
        mobile_number: true,
        avatar_url: true,
        primary_login_type: true,
        is_identifier_locked: true,
        is_avatar_locked: true,
      },
    });
    if (!existingUser) return notFound('User not found');

    if (body.mobile_number !== undefined) {
      const mobile = typeof body.mobile_number === 'string' ? body.mobile_number.trim() : '';
      if (existingUser.is_identifier_locked && existingUser.mobile_number && mobile !== existingUser.mobile_number) {
        return badRequest('Login identifier is permanent and cannot be changed.');
      }
      if (mobile) {
        const inUse = await findUserByMobileNumber(mobile, path.user_id);
        if (inUse) {
          return conflict('Mobile number already in use');
        }
      }
    }

    if (body.email !== undefined) {
      const normEmail = body.email ? body.email.trim().toLowerCase() : '';
      if (
        existingUser.is_identifier_locked &&
        existingUser.email &&
        !existingUser.email.endsWith('@glimps.guest') &&
        normEmail !== existingUser.email.toLowerCase()
      ) {
        return badRequest('Login identifier is permanent and cannot be changed.');
      }
    }

    if (body.avatar_url !== undefined) {
      if (existingUser.is_avatar_locked || existingUser.avatar_url) {
        if (body.avatar_url !== existingUser.avatar_url) {
          return conflict('Profile photo is permanently established and cannot be changed.');
        }
      }
    }

    const appUser = getUserFromAuthorizationHeader(request);
    const adminUser = getAdminFromAuthorizationHeader(request);
    if (!appUser && !adminUser) {
      return unauthorized('Authentication required');
    }
    if (appUser && appUser.id !== path.user_id && !adminUser) {
      return forbidden('You can only update your own profile');
    }

    const faceRef = await prisma.user_face_references.findUnique({
      where: { user_id: path.user_id },
      select: { consent: true, storage_key: true, processing_status: true },
    });
    const can_replace_profile_photo = !Boolean(
      faceRef && faceRef.consent && faceRef.storage_key && faceRef.processing_status !== 'failed'
    );

    if (body.event_id) {
      const guest = await isEventGuest(body.event_id, path.user_id);
      if (!guest) return forbidden('User is not a guest of this event');

      if (body.wedding_side !== undefined) {
        if (appUser && appUser.event_id && appUser.event_id !== body.event_id) {
          return forbidden('You can only update wedding side for your account and active event');
        }

        const sideResult = await updateGuestWeddingSide({
          user_id: path.user_id,
          event_id: body.event_id,
          wedding_side: body.wedding_side,
        });
        if (!sideResult.ok) {
          if (sideResult.reason === 'not_guest') {
            return forbidden('User is not a guest of this event');
          }
          return badRequest('Wedding side can only be set when the event category is wedding');
        }
      }

      const show_instagram = body.show_instagram ?? body.is_instagram_visible;
      const show_linkedin = body.show_linkedin ?? body.is_linkedin_visible;

      const eventProfile = await upsertUserEventProfile(path.user_id, body.event_id, {
        ...(body.full_name !== undefined ? { full_name: body.full_name } : {}),
        ...(body.instagram_id !== undefined ? { instagram_id: body.instagram_id } : {}),
        ...(body.linkedin_url !== undefined ? { linkedin_url: body.linkedin_url } : {}),
        ...(show_instagram !== undefined ? { is_instagram_visible: show_instagram } : {}),
        ...(show_linkedin !== undefined ? { is_linkedin_visible: show_linkedin } : {}),
        ...(body.wedding_side !== undefined ? { wedding_side: body.wedding_side } : {}),
      });

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

      const resolved = resolveAuthorUserWithEventProfile(user, eventProfile, { isOwnProfile: true });
      return ok({
        data: {
          user_id: user.id,
          id: user.id,
          event_id: body.event_id,
          full_name: resolved.full_name,
          avatar_url: user.avatar_url,
          email: user.email,
          mobile_number: user.mobile_number,
          country_code: user.country_code,
          instagram_id: resolved.instagram_id,
          linkedin_url: resolved.linkedin_url,
          wedding_side: resolved.wedding_side,
          show_instagram: resolved.is_instagram_visible,
          show_linkedin: resolved.is_linkedin_visible,
          is_instagram_visible: resolved.is_instagram_visible,
          is_linkedin_visible: resolved.is_linkedin_visible,
          can_replace_profile_photo,
          event_profile: {
            event_id: body.event_id,
            wedding_side: resolved.wedding_side,
            show_instagram: resolved.is_instagram_visible,
            show_linkedin: resolved.is_linkedin_visible,
            is_instagram_visible: resolved.is_instagram_visible,
            is_linkedin_visible: resolved.is_linkedin_visible,
          },
        },
      });
    }

    const user = await updateUser(path.user_id, toUpdateUserInput(body));
    if (!user) return notFound('User not found');

    const social = withResolvedSocialLinks(user);
    return ok({
      data: {
        user_id: user.id,
        id: user.id,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        email: user.email,
        mobile_number: user.mobile_number,
        country_code: user.country_code,
        instagram_id: social.instagram_id,
        linkedin_url: social.linkedin_url,
        can_replace_profile_photo,
      },
    });
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
