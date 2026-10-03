'use server';

import {
  clearAdminSessionCookie,
  getAdminJwtFromCookies,
  getAdminSessionFromCookies,
} from '@/lib/admin-session';
import { updateUserSchema } from '@/lib/validations/users';
import { findUserByMobileNumber, getUserById, updateUser } from '@/server/users';

export type MyProfile = {
  id: string;
  full_name: string;
  email: string;
  role_name: string;
  mobile_number: string | null;
  country_code: string | null;
  avatar_url: string | null;
  instagram_id: string | null;
};

export type GetMyProfileResult =
  | { ok: true; data: MyProfile }
  | { ok: false; error: string };

export type UpdateMyProfileInput = {
  full_name: string;
  mobile_number?: string;
  country_code?: string;
  avatar_url?: string | null;
  instagram_id?: string | null;
};

export type UpdateMyProfileResult =
  | { ok: true; data: MyProfile }
  | { ok: false; error: string };

export type ChangeMyPasswordResult =
  | { ok: true }
  | { ok: false; error: string };

async function getSessionUser() {
  const session = await getAdminSessionFromCookies();
  if (!session) return null;
  return session;
}

function roleNameFromId(roleId: number): string {
  if (roleId === 1) return 'super_admin';
  if (roleId === 2) return 'event_admin';
  return 'admin';
}

/**
 * The admin JWT from the session cookie, so a tab without one in sessionStorage
 * (e.g. a newly opened tab) can call the Bearer-protected `/api/*` routes.
 */
export async function getAdminTokenFromSessionAction(): Promise<string | null> {
  return getAdminJwtFromCookies();
}

export async function clearAdminSessionAction(): Promise<void> {
  await clearAdminSessionCookie();
}

export async function getMyProfileAction(): Promise<GetMyProfileResult> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: 'Not authenticated' };

  try {
    const user = await getUserById(session.id);
    if (!user) return { ok: false, error: 'User not found' };
    return {
      ok: true,
      data: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role_name: roleNameFromId(user.role_id),
        mobile_number: user.mobile_number,
        country_code: user.country_code,
        avatar_url: user.avatar_url,
        instagram_id: user.instagram_id,
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Failed to load profile' };
  }
}

export async function updateMyProfileAction(
  body: UpdateMyProfileInput
): Promise<UpdateMyProfileResult> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: 'Not authenticated' };

  const parsed = updateUserSchema.safeParse({
    full_name: body.full_name,
    mobile_number: body.mobile_number?.trim() || undefined,
    country_code: body.country_code?.trim() || undefined,
    avatar_url: body.avatar_url ?? null,
    instagram_id: body.instagram_id?.trim() || null,
  });
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const mobile = parsed.data.mobile_number?.trim();
    if (mobile) {
      const existing = await findUserByMobileNumber(mobile, session.id);
      if (existing) return { ok: false, error: 'Mobile number already in use' };
    }

    const user = await updateUser(session.id, parsed.data);
    if (!user) return { ok: false, error: 'User not found' };

    return {
      ok: true,
      data: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role_name: roleNameFromId(user.role_id),
        mobile_number: user.mobile_number,
        country_code: user.country_code,
        avatar_url: user.avatar_url,
        instagram_id: user.instagram_id,
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Failed to update profile' };
  }
}

export async function changeMyPasswordAction(
  password: string
): Promise<ChangeMyPasswordResult> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const nextPassword = password.trim();
  if (!nextPassword || nextPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  const parsed = updateUserSchema.safeParse({ password: nextPassword });
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const updated = await updateUser(session.id, { password: nextPassword });
    if (!updated) return { ok: false, error: 'User not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Failed to update password' };
  }
}
