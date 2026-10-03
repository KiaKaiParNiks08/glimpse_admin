import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from '@/lib/validations/users';

export const userSelect = {
  id: true,
  full_name: true,
  email: true,
  role_id: true,
  is_active: true,
  avatar_url: true,
  mobile_number: true,
  country_code: true,
  instagram_id: true,
} as const;

export type UserSelect = {
  id: string;
  full_name: string;
  email: string;
  role_id: number;
  is_active: boolean | null;
  avatar_url: string | null;
  mobile_number: string | null;
  country_code: string | null;
  instagram_id: string | null;
};

export type UserListItem = Pick<
  UserSelect,
  'id' | 'full_name' | 'email' | 'role_id' | 'is_active' | 'avatar_url' | 'mobile_number' | 'country_code'
>;

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

/**
 * Build where clause for listing users from query params.
 */
function buildListUsersWhere(
  query: ListUsersQuery,
  options?: { excludeRoleId?: number }
): Prisma.usersWhereInput {
  const roleIdFilter =
    query.role_id !== undefined
      ? query.role_id
      : options?.excludeRoleId !== undefined
        ? { not: options.excludeRoleId }
        : undefined;

  return {
    ...(query.search && {
      OR: [
        { full_name: { contains: query.search, mode: 'insensitive' as const } },
        { email: { contains: query.search, mode: 'insensitive' as const } },
      ],
    }),
    ...(query.is_active !== undefined && { is_active: query.is_active }),
    ...(roleIdFilter !== undefined && { role_id: roleIdFilter }),
  };
}

/**
 * List users with filters and pagination.
 * Optionally exclude a role by id (e.g. exclude "user" role in admin list).
 */
export async function listUsers(
  query: ListUsersQuery,
  options?: { excludeRoleId?: number }
): Promise<{ users: UserListItem[]; total: number }> {
  const { page, limit } = query;
  const skip = (page - 1) * limit;
  const where = buildListUsersWhere(query, options);

  const [users, total] = await Promise.all([
    prisma.users.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        full_name: true,
        email: true,
        role_id: true,
        is_active: true,
        avatar_url: true,
        mobile_number: true,
        country_code: true,
      },
    }),
    prisma.users.count({ where }),
  ]);

  return { users, total };
}

/**
 * Get a single user by id (full select, no password). Returns null if not found.
 */
export async function getUserById(user_id: string): Promise<UserSelect | null> {
  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: userSelect,
  });
  return user;
}

/** Allowed role names for admin login (SuperAdmin and Event Admin). */
export const ADMIN_ROLE_NAMES = ['super_admin', 'event_admin'] as const;

export type AdminRoleName = (typeof ADMIN_ROLE_NAMES)[number];

export interface AdminLoginResult {
  id: string;
  full_name: string;
  email: string;
  role_name: string;
}

/**
 * Find user by email and verify password. Returns user info (no password) if valid, null otherwise.
 * Use for admin login; caller should also check role is in ADMIN_ROLE_NAMES.
 */
export async function findUserByEmailAndVerifyPassword(
  email: string,
  password: string
): Promise<AdminLoginResult | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.users.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      full_name: true,
      email: true,
      password_hash: true,
      is_active: true,
      roles: { select: { name: true } },
    },
  });
  if (!user || user.is_active !== true) return null;
  const hash = hashPassword(password);
  if (hash !== user.password_hash) return null;
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role_name: user.roles.name,
  };
}

/**
 * Check if a user exists by id (minimal query). Returns { id } or null.
 */
export async function findUserByIdMinimal(
  user_id: string
): Promise<{ id: string } | null> {
  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { id: true },
  });
  return user;
}

/**
 * Find a user by mobile_number. Returns { id } or null.
 * When excludeUserId is set, ignores that user (for update uniqueness check).
 */
export async function findUserByMobileNumber(
  mobile_number: string,
  excludeUserId?: string
): Promise<{ id: string } | null> {
  const trimmed = mobile_number.trim();
  if (!trimmed) return null;
  const user = await prisma.users.findFirst({
    where: {
      mobile_number: trimmed,
      ...(excludeUserId && { id: { not: excludeUserId } }),
    },
    select: { id: true },
  });
  return user;
}

/**
 * Create a new user. Hashes password internally. Throws on duplicate email (P2002).
 */
export async function createUser(
  data: CreateUserInput
): Promise<UserListItem & { id: string }> {
  const password_hash = hashPassword(data.password);
  const user = await prisma.users.create({
    data: {
      full_name: data.full_name,
      email: data.email,
      password_hash,
      role_id: data.role_id,
      country_code: data.country_code ?? null,
      mobile_number: data.mobile_number ?? null,
      is_active: data.is_active ?? true,
    },
    select: {
      id: true,
      full_name: true,
      email: true,
      role_id: true,
      is_active: true,
      avatar_url: true,
      mobile_number: true,
      country_code: true,
    },
  });
  return user;
}

/**
 * Update user by id. Only provided fields are updated. Password is hashed if sent.
 * Returns null if user not found.
 */
export async function updateUser(
  user_id: string,
  body: UpdateUserInput
): Promise<UserSelect | null> {
  const existing = await prisma.users.findUnique({
    where: { id: user_id },
  });
  if (!existing) return null;

  const updateData: Prisma.usersUpdateInput = {};
  if (body.full_name !== undefined) updateData.full_name = body.full_name;
  if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url ?? null;
  if (body.instagram_id !== undefined) updateData.instagram_id = body.instagram_id ?? null;
  if (body.country_code !== undefined) updateData.country_code = body.country_code ?? null;
  if (body.mobile_number !== undefined) updateData.mobile_number = body.mobile_number ?? null;
  if (body.is_active !== undefined) updateData.is_active = body.is_active;
  if (body.password !== undefined) {
    updateData.password_hash = hashPassword(body.password);
  }

  const user = await prisma.users.update({
    where: { id: user_id },
    data: updateData,
    select: userSelect,
  });
  return user;
}

/**
 * Delete user by id.
 * Returns true if a user was deleted, false if not found.
 */
export async function deleteUser(user_id: string): Promise<boolean> {
  try {
    await prisma.users.delete({
      where: { id: user_id },
    });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string };
    // Prisma not-found error
    if (err?.code === 'P2025') return false;
    throw e;
  }
}
