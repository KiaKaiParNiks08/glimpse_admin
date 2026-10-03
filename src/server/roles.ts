import prisma from '@/server/prisma';
import type { RoleResult } from '@/types';

export type { RoleResult } from '@/types';

/**
 * Get a role by name. Returns null if not found.
 */
export async function getRoleByName(name: string): Promise<RoleResult | null> {
  const role = await prisma.roles.findFirst({
    where: { name },
    select: { id: true, name: true },
  });
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
