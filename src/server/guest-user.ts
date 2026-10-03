import { createHash } from 'crypto';
import prisma from '@/server/prisma';
import type { FindOrCreateGuestUserParams, FindOrCreateGuestUserResult } from '@/types';

export type { FindOrCreateGuestUserParams, FindOrCreateGuestUserResult } from '@/types';

const GUEST_EMAIL_DOMAIN = 'glimps.guest';
// User role uses OTP only; password not used. Placeholder for schema.
const PLACEHOLDER_PASSWORD_HASH = createHash('sha256').update('').digest('hex');

/**
 * Find an existing user by mobile_number and user role, or create a new guest user.
 * If mobile is registered with a different role, throws an error (caller should return 403).
 */
export async function findOrCreateGuestUser(
  params: FindOrCreateGuestUserParams
): Promise<FindOrCreateGuestUserResult> {
  const { mobile_number, country_code, user_role_id, user_role_name } = params;

  const existingUser = await prisma.users.findFirst({
    where: {
      mobile_number,
      role_id: user_role_id,
    },
    select: { id: true },
  });

  if (existingUser) {
    return { user_id: existingUser.id, is_new_user: false };
  }

  const otherUser = await prisma.users.findFirst({
    where: { mobile_number },
    include: { roles: true },
  });

  if (otherUser && otherUser.roles.name !== user_role_name) {
    throw new Error('MOBILE_REGISTERED_DIFFERENT_ROLE');
  }

  const placeholderEmail = `${country_code}_${mobile_number}@${GUEST_EMAIL_DOMAIN}`.slice(0, 150);

  const newUser = await prisma.users.create({
    data: {
      full_name: '',
      email: placeholderEmail,
      password_hash: PLACEHOLDER_PASSWORD_HASH,
      role_id: user_role_id,
      country_code: country_code || null,
      mobile_number,
      is_active: true,
    },
    select: { id: true },
  });

  return { user_id: newUser.id, is_new_user: true };
}
