'use server';

import { adminLoginRequestSchema } from '@/lib/validations/auth';
import {
  findUserByEmailAndVerifyPassword,
  ADMIN_ROLE_NAMES,
} from '@/server/users';

export type AdminLoginResult =
  | { ok: true; user: { id: string; full_name: string; email: string; role_name: string } }
  | { ok: false; error: string };

export async function adminLoginAction(
  email: string,
  password: string
): Promise<AdminLoginResult> {
  const parsed = adminLoginRequestSchema.safeParse({ email, password });
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Invalid input';
    return { ok: false, error: msg };
  }

  try {
    const user = await findUserByEmailAndVerifyPassword(
      parsed.data.email,
      parsed.data.password
    );
    if (!user) {
      return { ok: false, error: 'Invalid email or password' };
    }

    const allowedRoles = new Set(ADMIN_ROLE_NAMES);
    if (!allowedRoles.has(user.role_name as (typeof ADMIN_ROLE_NAMES)[number])) {
      return {
        ok: false,
        error: 'Access denied. Only SuperAdmin and Event Admin can sign in here.',
      };
    }

    return {
      ok: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role_name: user.role_name,
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Login failed' };
  }
}
