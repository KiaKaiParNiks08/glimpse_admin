import { createHash } from 'crypto';
import prisma from '@/server/prisma';
import type { FindOrCreateGuestUserParams, FindOrCreateGuestUserResult } from '@/types';

export type { FindOrCreateGuestUserParams, FindOrCreateGuestUserResult } from '@/types';

const GUEST_EMAIL_DOMAIN = 'glimps.guest';
const PLACEHOLDER_PASSWORD_HASH = createHash('sha256').update('').digest('hex');

export async function findOrCreateGuestUser(
  params: FindOrCreateGuestUserParams
): Promise<FindOrCreateGuestUserResult> {
  const { country_code, user_role_id, user_role_name } = params;
  const mobile_number = params.mobile_number?.trim() || null;
  const email = params.email?.trim().toLowerCase() || null;

  const or: Array<{ email?: string; role_id?: number; mobile_number?: string }> = [];
  if (email) or.push({ email, role_id: user_role_id });
  if (mobile_number) or.push({ mobile_number });

  const matches = or.length
    ? await prisma.users.findMany({
        where: { OR: or },
        select: {
          id: true,
          email: true,
          mobile_number: true,
          country_code: true,
          role_id: true,
          roles: { select: { name: true } },
        },
      })
    : [];

  const found =
    (email ? matches.find((user) => user.email === email && user.role_id === user_role_id) : undefined) ??
    matches[0] ??
    null;

  if (found) {
    if (found.role_id !== user_role_id || found.roles.name !== user_role_name) {
      throw new Error('MOBILE_REGISTERED_DIFFERENT_ROLE');
    }

    const data: { email?: string; mobile_number?: string; country_code?: string } = {};
    if (email && !email.endsWith(`@${GUEST_EMAIL_DOMAIN}`) && found.email !== email) {
      data.email = email.slice(0, 150);
    }
    if (mobile_number && found.mobile_number !== mobile_number) {
      data.mobile_number = mobile_number;
    }
    if (country_code && found.country_code !== country_code) {
      data.country_code = country_code;
    }

    if (Object.keys(data).length > 0) {
      try {
        await prisma.users.update({ where: { id: found.id }, data });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'P2002') throw new Error('EMAIL_IN_USE');
        throw error;
      }
    }

    return { user_id: found.id, is_new_user: false };
  }

  const placeholderEmail = mobile_number
    ? `${country_code ?? ''}_${mobile_number}@${GUEST_EMAIL_DOMAIN}`.slice(0, 150)
    : `email_${Date.now()}@${GUEST_EMAIL_DOMAIN}`.slice(0, 150);

  const newUser = await prisma.users.create({
    data: {
      full_name: '',
      email: email && !email.endsWith(`@${GUEST_EMAIL_DOMAIN}`) ? email.slice(0, 150) : placeholderEmail,
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
