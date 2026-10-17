import prisma from '@/server/prisma';
import type { RoleResult } from '@/types';

export type { RoleResult } from '@/types';

/**
 * Get a role by name. Returns null if not found.
 */
const roleByNameCache = new Map<string, RoleResult>();

export async function getRoleByName(name: string): Promise<RoleResult | null> {
  const cached = roleByNameCache.get(name);
  if (cached) return cached;
  const role = await prisma.roles.findFirst({
    where: { name },
    select: { id: true, name: true },
  });
  if (role) roleByNameCache.set(name, role);
  return role;
}

/**
 * List all roles (id + name), sorted by name ascending.
 */
export async function listRoles(): Promise<RoleResult[]> {
  const roles = await prisma.roles.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return roles;
}
