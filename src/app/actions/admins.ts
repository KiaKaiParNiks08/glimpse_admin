'use server';

import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { findUserByMobileNumber } from '@/server/users';
import {
  requireAdminContextFromCookies,
  type AdminAccessContext,
} from '@/server/access';
import { ensureRbacBootstrapped } from '@/server/seed-rbac';
import {
  FEATURE_KEYS,
  PERMISSION_KEYS,
  type FeatureKey,
  type PermissionKey,
} from '@/lib/rbac';

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export type UserListItem = {
  id: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name: string;
  role_scope: string;
  is_active: boolean | null;
  avatar_url: string | null;
  mobile_number: string | null;
  country_code: string | null;
  parent_user_id: string | null;
  tenant_owner_id: string | null;
  tenant_owner_name: string | null;
  purchase_plan_id: string | null;
  purchase_plan_name: string | null;
  feature_overrides: Partial<Record<FeatureKey, boolean>> | null;
  custom_permissions: PermissionKey[] | null;
  assigned_client_ids: string[];
  assigned_event_ids: string[];
};

export type RoleItem = {
  id: number;
  name: string;
  description: string | null;
  scope: string;
  is_system: boolean;
  permissions: PermissionKey[];
};

export type GetUsersResult =
  | {
      ok: true;
      data: UserListItem[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    }
  | { ok: false; error: string };

export type GetRolesResult = { ok: true; data: RoleItem[] } | { ok: false; error: string };

export type MutateUserResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: string };

function sanitizePermissionArray(raw: unknown): PermissionKey[] | null {
  if (!Array.isArray(raw)) return null;
  const set = new Set<PermissionKey>();
  for (const v of raw) {
    if (typeof v === 'string' && (PERMISSION_KEYS as readonly string[]).includes(v)) {
      set.add(v as PermissionKey);
    }
  }
  return Array.from(set);
}

function sanitizeFeatureOverrides(
  raw: unknown
): Partial<Record<FeatureKey, boolean>> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Partial<Record<FeatureKey, boolean>> = {};
  const obj = raw as Record<string, unknown>;
  for (const key of FEATURE_KEYS) {
    if (typeof obj[key] === 'boolean') {
      out[key] = obj[key] as boolean;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildUserScopeWhere(
  ctx: AdminAccessContext,
  search?: string
): Prisma.usersWhereInput {
  const filters: Prisma.usersWhereInput[] = [
    { roles: { name: { not: 'user' } } },
  ];

  if (ctx.tier === 'super_admin') {
    // Super admin sees all admin/staff/client/sub-user accounts
  } else if (ctx.tier === 'super_staff') {
    if (ctx.assigned_client_ids.length === 0) {
      filters.push({ id: '00000000-0000-0000-0000-000000000000' });
    } else {
      filters.push({
        OR: [
          { id: { in: ctx.assigned_client_ids } },
          { tenant_owner_id: { in: ctx.assigned_client_ids } },
        ],
      });
    }
  } else {
    // Client Admin or authorized sub-user sees only their own tenant's sub-users (excluding self or super_admin)
    const ownerId = ctx.tenant_owner_id ?? ctx.id;
    filters.push({
      OR: [
        { tenant_owner_id: ownerId },
        { parent_user_id: ownerId },
      ],
      id: { not: ownerId },
    });
  }

  if (search?.trim()) {
    const q = search.trim();
    filters.push({
      OR: [
        { full_name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { mobile_number: { contains: q } },
      ],
    });
  }

  return { AND: filters };
}

async function canCallerManageUser(
  ctx: AdminAccessContext,
  targetUserId: string
): Promise<boolean> {
  if (ctx.tier === 'super_admin') return true;
  if (targetUserId === ctx.id) return false;
  const target = await prisma.users.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      parent_user_id: true,
      tenant_owner_id: true,
      roles: { select: { name: true, scope: true } },
    },
  });
  if (!target) return false;
  if (target.roles.name === 'super_admin' || target.roles.scope === 'platform') {
    return false;
  }
  if (ctx.tier === 'super_staff') {
    return (
      ctx.assigned_client_ids.includes(target.id) ||
      (target.tenant_owner_id ? ctx.assigned_client_ids.includes(target.tenant_owner_id) : false)
    );
  }
  const ownerId = ctx.tenant_owner_id ?? ctx.id;
  return target.tenant_owner_id === ownerId || target.parent_user_id === ownerId;
}

export async function getUsersAction(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<GetUsersResult> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  await ensureRbacBootstrapped();
  const { ctx } = gate;

  if (!ctx.hasPermission('users.view') && !ctx.hasPermission('users.manage')) {
    return { ok: false, error: 'Forbidden' };
  }

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 10));
  const skip = (page - 1) * limit;

  try {
    const where = buildUserScopeWhere(ctx, params.search);
    const [rows, total] = await Promise.all([
      prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ created_at: 'desc' }, { full_name: 'asc' }],
        select: {
          id: true,
          full_name: true,
          email: true,
          role_id: true,
          is_active: true,
          avatar_url: true,
          mobile_number: true,
          country_code: true,
          parent_user_id: true,
          tenant_owner_id: true,
          purchase_plan_id: true,
          feature_overrides: true,
          custom_permissions: true,
          roles: { select: { name: true, scope: true } },
          tenant_owner: { select: { full_name: true } },
          purchase_plan: { select: { name: true } },
          staff_assignments: { select: { client_user_id: true } },
          event_admins_event_admins_user_idTousers: { select: { event_id: true } },
        },
      }),
      prisma.users.count({ where }),
    ]);

    const data: UserListItem[] = rows.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      role_id: u.role_id,
      role_name: u.roles.name,
      role_scope: u.roles.scope,
      is_active: u.is_active,
      avatar_url: u.avatar_url,
      mobile_number: u.mobile_number,
      country_code: u.country_code,
      parent_user_id: u.parent_user_id,
      tenant_owner_id: u.tenant_owner_id,
      tenant_owner_name: u.tenant_owner?.full_name ?? null,
      purchase_plan_id: u.purchase_plan_id,
      purchase_plan_name: u.purchase_plan?.name ?? null,
      feature_overrides: sanitizeFeatureOverrides(u.feature_overrides),
      custom_permissions: sanitizePermissionArray(u.custom_permissions),
      assigned_client_ids: u.staff_assignments.map((s) => s.client_user_id),
      assigned_event_ids: u.event_admins_event_admins_user_idTousers.map((e) => e.event_id),
    }));

    return {
      ok: true,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  } catch (e) {
    console.error('[getUsersAction]', e);
    return { ok: false, error: 'Unable to fetch users' };
  }
}

export async function getRolesAction(): Promise<GetRolesResult> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  await ensureRbacBootstrapped();
  const { ctx } = gate;

  if (!ctx.hasPermission('users.view') && !ctx.hasPermission('users.manage')) {
    return { ok: false, error: 'Forbidden' };
  }

  try {
    const rows = await prisma.roles.findMany({
      where: {
        name: { not: 'user' },
        ...(ctx.tier === 'super_admin'
          ? {}
          : ctx.tier === 'super_staff'
            ? { scope: 'tenant' }
            : { scope: 'tenant', name: { not: 'client_admin' } }),
      },
      orderBy: [{ is_system: 'desc' }, { id: 'asc' }],
    });

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        scope: r.scope,
        is_system: r.is_system,
        permissions: sanitizePermissionArray(r.permissions) ?? [],
      })),
    };
  } catch (e) {
    console.error('[getRolesAction]', e);
    return { ok: false, error: 'Unable to fetch roles' };
  }
}

export async function createCustomRoleAction(input: {
  name: string;
  description?: string | null;
  scope: 'platform' | 'tenant';
  permissions: PermissionKey[];
}): Promise<{ ok: true; data: RoleItem } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.ctx.tier !== 'super_admin') {
    return { ok: false, error: 'Only Super Admin can create roles' };
  }

  const normalized = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized || normalized === 'user' || normalized === 'super_admin') {
    return { ok: false, error: 'Enter a valid unique role key name' };
  }
  const perms = sanitizePermissionArray(input.permissions) ?? [];

  try {
    const created = await prisma.roles.create({
      data: {
        name: normalized,
        description: input.description?.trim() || null,
        scope: input.scope,
        is_system: false,
        permissions: perms,
      },
    });
    return {
      ok: true,
      data: {
        id: created.id,
        name: created.name,
        description: created.description,
        scope: created.scope,
        is_system: created.is_system,
        permissions: perms,
      },
    };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2002') return { ok: false, error: 'Role name already exists' };
    return { ok: false, error: 'Unable to create role' };
  }
}

export async function updateRolePermissionsAction(
  roleId: number,
  permissions: PermissionKey[],
  description?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.ctx.tier !== 'super_admin') {
    return { ok: false, error: 'Only Super Admin can edit role permissions' };
  }

  const perms = sanitizePermissionArray(permissions) ?? [];
  try {
    await prisma.roles.update({
      where: { id: roleId },
      data: {
        permissions: perms,
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Unable to update role permissions' };
  }
}

export async function getClientAdminsForSelectAction(): Promise<
  { ok: true; data: Array<{ id: string; full_name: string; email: string; purchase_plan_name: string | null }> } | { ok: false; error: string }
> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  if (ctx.tier !== 'super_admin' && ctx.tier !== 'super_staff') {
    return { ok: false, error: 'Forbidden' };
  }

  try {
    const rows = await prisma.users.findMany({
      where: {
        is_active: true,
        roles: { name: 'client_admin' },
        ...(ctx.tier === 'super_staff' ? { id: { in: ctx.assigned_client_ids } } : {}),
      },
      orderBy: { full_name: 'asc' },
      select: {
        id: true,
        full_name: true,
        email: true,
        purchase_plan: { select: { name: true } },
      },
    });
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        purchase_plan_name: r.purchase_plan?.name ?? null,
      })),
    };
  } catch {
    return { ok: false, error: 'Unable to load client admins' };
  }
}

export async function getTenantEventsForSelectAction(
  tenantOwnerId?: string | null
): Promise<{ ok: true; data: Array<{ id: string; title: string; event_code: string }> } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  try {
    let where: Prisma.eventsWhereInput = {};
    if (ctx.tier === 'super_admin') {
      where = tenantOwnerId
        ? { OR: [{ tenant_owner_id: tenantOwnerId }, { created_by: tenantOwnerId }] }
        : {};
    } else if (ctx.tier === 'super_staff') {
      const targetClients = tenantOwnerId
        ? ctx.assigned_client_ids.filter((id) => id === tenantOwnerId)
        : ctx.assigned_client_ids;
      if (targetClients.length === 0) return { ok: true, data: [] };
      where = { OR: [{ tenant_owner_id: { in: targetClients } }, { created_by: { in: targetClients } }] };
    } else {
      const ownerId = ctx.tenant_owner_id ?? ctx.id;
      where = { OR: [{ tenant_owner_id: ownerId }, { created_by: ownerId }] };
    }

    const events = await prisma.events.findMany({
      where: { ...where, status: { not: 'archived' } },
      select: { id: true, title: true, event_code: true },
      orderBy: { start_date: 'desc' },
      take: 200,
    });
    return { ok: true, data: events };
  } catch {
    return { ok: false, error: 'Unable to load events' };
  }
}

export async function createUserAction(body: {
  full_name: string;
  email: string;
  password: string;
  role_id: number;
  country_code?: string;
  mobile_number?: string;
  is_active?: boolean;
  purchase_plan_id?: string | null;
  feature_overrides?: Partial<Record<FeatureKey, boolean>> | null;
  custom_permissions?: PermissionKey[] | null;
  tenant_owner_id?: string | null;
  assigned_client_ids?: string[];
  assigned_event_ids?: string[];
}): Promise<MutateUserResult> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  if (!ctx.hasPermission('users.manage')) {
    return { ok: false, error: 'You do not have permission to create users' };
  }

  const fullName = body.full_name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  if (!fullName) return { ok: false, error: 'Full name is required' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Valid email is required' };
  }
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' };

  try {
    const role = await prisma.roles.findUnique({
      where: { id: body.role_id },
      select: { id: true, name: true, scope: true, permissions: true },
    });
    if (!role || role.name === 'user') return { ok: false, error: 'Invalid role' };

    // Hierarchy validation
    if (ctx.tier !== 'super_admin' && (role.scope === 'platform' || role.name === 'client_admin' && ctx.tier !== 'super_staff')) {
      return { ok: false, error: 'You cannot assign this role' };
    }
    if ((ctx.tier === 'client_admin' || ctx.tier === 'client_subuser') && role.name === 'client_admin') {
      return { ok: false, error: 'Client Admins can only create sub-users (Photographer, Coordinator, etc.)' };
    }

    const mobile = body.mobile_number?.trim();
    if (mobile) {
      const existingMobile = await findUserByMobileNumber(mobile);
      if (existingMobile) return { ok: false, error: 'Mobile number already in use' };
    }

    let resolvedTenantOwnerId: string | null = null;
    let resolvedPlanId: string | null = null;
    let resolvedOverrides: Partial<Record<FeatureKey, boolean>> | null = null;

    if (role.name === 'client_admin') {
      // Client Admin stands at the root of their own workspace
      resolvedPlanId = body.purchase_plan_id?.trim() || null;
      if (!resolvedPlanId) {
        const def = await prisma.purchase_plans.findFirst({ where: { is_default: true }, select: { id: true } });
        resolvedPlanId = def?.id ?? null;
      }
      resolvedOverrides = ctx.tier === 'super_admin' ? sanitizeFeatureOverrides(body.feature_overrides) : null;
    } else if (role.scope === 'tenant') {
      // Tenant sub-user (photographer, coordinator, event_admin, etc.)
      if (ctx.tier === 'client_admin' || ctx.tier === 'client_subuser') {
        resolvedTenantOwnerId = ctx.tenant_owner_id ?? ctx.id;
      } else {
        resolvedTenantOwnerId = body.tenant_owner_id?.trim() || null;
      }

      if (resolvedTenantOwnerId) {
        // Enforce max_sub_users quota on client's purchase plan
        const clientOwner = await prisma.users.findUnique({
          where: { id: resolvedTenantOwnerId },
          select: {
            purchase_plan: { select: { max_sub_users: true, name: true } },
          },
        });
        const maxSub = clientOwner?.purchase_plan?.max_sub_users;
        if (typeof maxSub === 'number' && maxSub > 0) {
          const currentCount = await prisma.users.count({
            where: { tenant_owner_id: resolvedTenantOwnerId, id: { not: resolvedTenantOwnerId } },
          });
          if (currentCount >= maxSub) {
            return {
              ok: false,
              error: `Plan user limit reached (${maxSub} sub-users allowed under ${clientOwner?.purchase_plan?.name ?? 'current plan'}).`,
            };
          }
        }
      }
    }

    // Clamp custom permissions so sub-users never escalate above caller capabilities
    let resolvedCustomPerms = sanitizePermissionArray(body.custom_permissions);
    if (resolvedCustomPerms && ctx.tier !== 'super_admin') {
      resolvedCustomPerms = resolvedCustomPerms.filter((p) => ctx.hasPermission(p));
    }

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          full_name: fullName,
          email,
          password_hash: hashPassword(password),
          role_id: role.id,
          country_code: body.country_code?.trim() || null,
          mobile_number: mobile || null,
          is_active: body.is_active ?? true,
          parent_user_id: ctx.id,
          tenant_owner_id: resolvedTenantOwnerId,
          purchase_plan_id: resolvedPlanId,
          ...(resolvedOverrides ? { feature_overrides: resolvedOverrides } : {}),
          ...(resolvedCustomPerms ? { custom_permissions: resolvedCustomPerms } : {}),
        },
        select: { id: true },
      });

      // Set client_admin's tenant_owner_id to self so queries filter cleanly
      if (role.name === 'client_admin') {
        await tx.users.update({
          where: { id: user.id },
          data: { tenant_owner_id: user.id },
        });
        if (ctx.tier === 'super_staff') {
          await tx.staff_client_assignments.create({
            data: { staff_user_id: ctx.id, client_user_id: user.id, assigned_by: ctx.id },
          });
        }
      }

      // If Super Admin created a support_staff user, save client assignments
      if (role.name === 'support_staff' && Array.isArray(body.assigned_client_ids) && body.assigned_client_ids.length > 0) {
        await tx.staff_client_assignments.createMany({
          data: [...new Set(body.assigned_client_ids)].map((cid) => ({
            staff_user_id: user.id,
            client_user_id: cid,
            assigned_by: ctx.id,
          })),
          skipDuplicates: true,
        });
      }

      // If creating a tenant sub-user with event assignments, assign events owned by that tenant
      if (role.scope === 'tenant' && role.name !== 'client_admin' && Array.isArray(body.assigned_event_ids) && body.assigned_event_ids.length > 0) {
        const eventIds = [...new Set(body.assigned_event_ids)];
        const validEvents = await tx.events.findMany({
          where: {
            id: { in: eventIds },
            ...(resolvedTenantOwnerId
              ? { OR: [{ tenant_owner_id: resolvedTenantOwnerId }, { created_by: resolvedTenantOwnerId }] }
              : {}),
          },
          select: { id: true },
        });
        if (validEvents.length > 0) {
          await tx.event_admins.createMany({
            data: validEvents.map((ev) => ({
              event_id: ev.id,
              user_id: user.id,
              assigned_by: ctx.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      return user;
    });

    return { ok: true, data: { id: created.id } };
  } catch (e: unknown) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') return { ok: false, error: 'Email already exists' };
    console.error('[createUserAction]', e);
    return { ok: false, error: 'Unable to create user' };
  }
}

export async function updateUserAction(
  user_id: string,
  body: {
    full_name?: string;
    password?: string;
    role_id?: number;
    country_code?: string | null;
    mobile_number?: string | null;
    is_active?: boolean;
    purchase_plan_id?: string | null;
    feature_overrides?: Partial<Record<FeatureKey, boolean>> | null;
    custom_permissions?: PermissionKey[] | null;
    assigned_client_ids?: string[];
    assigned_event_ids?: string[];
  }
): Promise<MutateUserResult> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  if (!ctx.hasPermission('users.manage')) {
    return { ok: false, error: 'You do not have permission to edit users' };
  }

  const allowed = await canCallerManageUser(ctx, user_id);
  if (!allowed) return { ok: false, error: 'Forbidden' };

  try {
    const existing = await prisma.users.findUnique({
      where: { id: user_id },
      select: {
        id: true,
        tenant_owner_id: true,
        roles: { select: { name: true, scope: true } },
      },
    });
    if (!existing) return { ok: false, error: 'User not found' };

    if (body.mobile_number !== undefined) {
      const mobile = typeof body.mobile_number === 'string' ? body.mobile_number.trim() : '';
      if (mobile) {
        const dup = await findUserByMobileNumber(mobile, user_id);
        if (dup) return { ok: false, error: 'Mobile number already in use' };
      }
    }

    let nextRoleId: number | undefined;
    let nextRoleName = existing.roles.name;
    let nextRoleScope = existing.roles.scope;
    if (body.role_id !== undefined) {
      const role = await prisma.roles.findUnique({
        where: { id: body.role_id },
        select: { id: true, name: true, scope: true },
      });
      if (!role || role.name === 'user') return { ok: false, error: 'Invalid role' };
      if (ctx.tier !== 'super_admin' && role.scope === 'platform') {
        return { ok: false, error: 'Forbidden role assignment' };
      }
      nextRoleId = role.id;
      nextRoleName = role.name;
      nextRoleScope = role.scope;
    }

    const customPerms =
      body.custom_permissions !== undefined
        ? body.custom_permissions === null
          ? null
          : sanitizePermissionArray(body.custom_permissions)?.filter((p) =>
              ctx.tier === 'super_admin' ? true : ctx.hasPermission(p)
            ) ?? null
        : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: user_id },
        data: {
          ...(body.full_name !== undefined ? { full_name: body.full_name.trim() } : {}),
          ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
          ...(body.country_code !== undefined ? { country_code: body.country_code?.trim() || null } : {}),
          ...(body.mobile_number !== undefined ? { mobile_number: body.mobile_number?.trim() || null } : {}),
          ...(body.password ? { password_hash: hashPassword(body.password) } : {}),
          ...(nextRoleId !== undefined ? { role_id: nextRoleId } : {}),
          ...(ctx.tier === 'super_admin' && body.purchase_plan_id !== undefined
            ? { purchase_plan_id: body.purchase_plan_id || null }
            : {}),
          ...(ctx.tier === 'super_admin' && body.feature_overrides !== undefined
            ? {
                feature_overrides:
                  body.feature_overrides === null
                    ? null
                    : sanitizeFeatureOverrides(body.feature_overrides),
              }
            : {}),
          ...(customPerms !== undefined
            ? { custom_permissions: customPerms }
            : {}),
          updated_at: new Date(),
        } as Prisma.usersUncheckedUpdateInput,
      });

      if (ctx.tier === 'super_admin' && nextRoleName === 'support_staff' && Array.isArray(body.assigned_client_ids)) {
        await tx.staff_client_assignments.deleteMany({ where: { staff_user_id: user_id } });
        if (body.assigned_client_ids.length > 0) {
          await tx.staff_client_assignments.createMany({
            data: [...new Set(body.assigned_client_ids)].map((cid) => ({
              staff_user_id: user_id,
              client_user_id: cid,
              assigned_by: ctx.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (nextRoleScope === 'tenant' && nextRoleName !== 'client_admin' && Array.isArray(body.assigned_event_ids)) {
        const ownerId = existing.tenant_owner_id;
        await tx.event_admins.deleteMany({ where: { user_id } });
        if (body.assigned_event_ids.length > 0) {
          const validEvents = await tx.events.findMany({
            where: {
              id: { in: [...new Set(body.assigned_event_ids)] },
              ...(ownerId ? { OR: [{ tenant_owner_id: ownerId }, { created_by: ownerId }] } : {}),
            },
            select: { id: true },
          });
          if (validEvents.length > 0) {
            await tx.event_admins.createMany({
              data: validEvents.map((ev) => ({
                event_id: ev.id,
                user_id,
                assigned_by: ctx.id,
              })),
              skipDuplicates: true,
            });
          }
        }
      }
    });

    return { ok: true, data: { id: user_id } };
  } catch (e) {
    console.error('[updateUserAction]', e);
    return { ok: false, error: 'Unable to update user' };
  }
}
