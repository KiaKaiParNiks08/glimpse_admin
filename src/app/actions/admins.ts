'use server';

import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from '@/lib/validations';
import type { CreateUserInput, UpdateUserInput } from '@/lib/validations/users';
import { prisma } from '@/server';
import {
  listUsers,
  createUser,
  updateUser,
  findUserByMobileNumber,
} from '@/server/users';
import { listRoles } from '@/server/roles';
import { getAdminSessionFromCookies } from '@/lib/admin-session';

export type UserListItem = {
  id: string;
  full_name: string;
  email: string;
  role_id: number;
  is_active: boolean | null;
  avatar_url: string | null;
  mobile_number: string | null;
  country_code: string | null;
};

export type RoleItem = { id: number; name: string };

export type GetUsersResult =
  | { ok: true; data: UserListItem[]; meta: { total: number; page: number; limit: number; totalPages: number } }
  | { ok: false; error: string };

export type GetRolesResult = { ok: true; data: RoleItem[] } | { ok: false; error: string };

export type CreateUserResult = { ok: true; data: UserListItem & { id: string } } | { ok: false; error: string };

export type UpdateUserResult = { ok: true; data: UserListItem } | { ok: false; error: string };

export async function getUsersAction(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<GetUsersResult> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  if (session.role_name !== 'super_admin') return { ok: false, error: 'Forbidden' };

  const parsed = listUsersQuerySchema.safeParse({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    search: params.search,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid parameters' };
  }

  try {
    const userRole = await prisma.roles.findFirst({
      where: { name: 'user' },
      select: { id: true },
    });
    const { users, total } = await listUsers(parsed.data, {
      excludeRoleId: userRole?.id,
    });
    const limit = parsed.data.limit;
    return {
      ok: true,
      data: users as UserListItem[],
      meta: {
        total,
        page: parsed.data.page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch users' };
  }
}

export async function getRolesAction(): Promise<GetRolesResult> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  if (session.role_name !== 'super_admin') return { ok: false, error: 'Forbidden' };

  try {
    const roles = await listRoles();
    return { ok: true, data: roles as RoleItem[] };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch roles' };
  }
}

export async function createUserAction(body: CreateUserInput): Promise<CreateUserResult> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  if (session.role_name !== 'super_admin') return { ok: false, error: 'Forbidden' };

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const role = await prisma.roles.findUnique({
      where: { id: parsed.data.role_id },
      select: { name: true },
    });
    if (!role) return { ok: false, error: 'Invalid role' };
    if (role.name === 'user') return { ok: false, error: 'Cannot create user role from admin' };

    const mobile = parsed.data.mobile_number?.trim();
    if (mobile) {
      const existing = await findUserByMobileNumber(mobile);
      if (existing) return { ok: false, error: 'Mobile number already in use' };
    }

    const user = await createUser(parsed.data);
    return { ok: true, data: user as UserListItem & { id: string } };
  } catch (e: unknown) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') return { ok: false, error: 'Email already exists' };
    console.error(e);
    return { ok: false, error: 'Unable to create user' };
  }
}

export async function updateUserAction(
  user_id: string,
  body: UpdateUserInput
): Promise<UpdateUserResult> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  if (session.role_name !== 'super_admin') return { ok: false, error: 'Forbidden' };

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    if (parsed.data.mobile_number !== undefined) {
      const mobile = typeof parsed.data.mobile_number === 'string' ? parsed.data.mobile_number.trim() : '';
      if (mobile) {
        const existing = await findUserByMobileNumber(mobile, user_id);
        if (existing) return { ok: false, error: 'Mobile number already in use' };
      }
    }

    const user = await updateUser(user_id, parsed.data);
    if (!user) return { ok: false, error: 'User not found' };
    return { ok: true, data: user as UserListItem };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to update user' };
  }
}
