import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { getAdminSessionFromCookies, type AdminSessionUser } from '@/lib/admin-session';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import {
  ALL_FEATURES_ENABLED,
  computeEffectiveFeatures,
  computeEffectivePermissions,
  modulesFromAccess,
  PERMISSION_KEYS,
  PERMISSION_REQUIRED_FEATURE,
  type AdminModule,
  type AdminTier,
  type FeatureKey,
  type FeatureMap,
  type PermissionKey,
} from '@/lib/rbac';
import { ensureRbacBootstrapped } from '@/server/seed-rbac';

export type AdminAccessContext = {
  id: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name: string;
  avatar_url: string | null;
  tier: AdminTier;
  tenant_owner_id: string | null;
  parent_user_id: string | null;
  purchase_plan_id: string | null;
  purchase_plan_name: string | null;
  features: FeatureMap;
  permissions: PermissionKey[];
  permissionSet: Set<PermissionKey>;
  modules: AdminModule[];
  assigned_client_ids: string[];
  assigned_event_ids: string[];
  hasPermission: (perm: PermissionKey) => boolean;
  hasFeature: (feature: FeatureKey) => boolean;
};

export async function getAdminAccessContext(userId: string): Promise<AdminAccessContext | null> {
  await ensureRbacBootstrapped();
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      full_name: true,
      email: true,
      role_id: true,
      is_active: true,
      avatar_url: true,
      parent_user_id: true,
      tenant_owner_id: true,
      purchase_plan_id: true,
      feature_overrides: true,
      custom_permissions: true,
      roles: {
        select: {
          name: true,
          scope: true,
          permissions: true,
        },
      },
      purchase_plan: {
        select: {
          id: true,
          name: true,
          features: true,
        },
      },
      tenant_owner: {
        select: {
          id: true,
          purchase_plan_id: true,
          feature_overrides: true,
          purchase_plan: {
            select: {
              id: true,
              name: true,
              features: true,
            },
          },
        },
      },
      staff_assignments: {
        select: { client_user_id: true },
      },
      event_admins_event_admins_user_idTousers: {
        select: { event_id: true },
      },
    },
  });

  if (!user || user.is_active !== true) return null;

  const roleName = user.roles.name;
  if (roleName === 'user') return null;

  let tier: AdminTier;
  if (roleName === 'super_admin') {
    tier = 'super_admin';
  } else if (user.roles.scope === 'platform' || roleName === 'support_staff') {
    tier = 'super_staff';
  } else if (
    roleName === 'client_admin' ||
    (!user.parent_user_id && !user.tenant_owner_id && roleName !== 'photographer' && roleName !== 'coordinator')
  ) {
    tier = 'client_admin';
  } else {
    tier = 'client_subuser';
  }

  const effectiveTenantOwnerId =
    tier === 'super_admin' || tier === 'super_staff'
      ? null
      : tier === 'client_admin'
        ? user.tenant_owner_id ?? user.id
        : user.tenant_owner_id ?? user.parent_user_id ?? null;

  // Resolve purchased features:
  // - super_admin & super_staff have all features enabled on platform side
  // - client_admin uses own purchase_plan + feature_overrides (fallback all-on for legacy admins without plan)
  // - client_subuser inherits tenant_owner's purchase_plan + feature_overrides
  let planId: string | null = null;
  let planName: string | null = null;
  let features: FeatureMap = { ...ALL_FEATURES_ENABLED };
  let applyFeatureGate = false;

  if (tier === 'client_admin') {
    planId = user.purchase_plan?.id ?? null;
    planName = user.purchase_plan?.name ?? null;
    if (user.purchase_plan || user.feature_overrides) {
      features = computeEffectiveFeatures(user.purchase_plan?.features, user.feature_overrides);
      applyFeatureGate = true;
    }
  } else if (tier === 'client_subuser') {
    const owner = user.tenant_owner;
    if (owner && (owner.purchase_plan || owner.feature_overrides)) {
      planId = owner.purchase_plan?.id ?? null;
      planName = owner.purchase_plan?.name ?? null;
      features = computeEffectiveFeatures(owner.purchase_plan?.features, owner.feature_overrides);
      applyFeatureGate = true;
    } else if (user.purchase_plan || user.feature_overrides) {
      planId = user.purchase_plan?.id ?? null;
      planName = user.purchase_plan?.name ?? null;
      features = computeEffectiveFeatures(user.purchase_plan?.features, user.feature_overrides);
      applyFeatureGate = true;
    }
  }

  const permissionSet = computeEffectivePermissions({
    roleName,
    rolePermissions: user.roles.permissions,
    customPermissions: user.custom_permissions,
    features,
    applyFeatureGate,
  });
  const permissions = Array.from(permissionSet);
  const modules = modulesFromAccess({ tier, permissions: permissionSet, features });

  const assignedClientIds = user.staff_assignments.map((s) => s.client_user_id);
  const assignedEventIds = user.event_admins_event_admins_user_idTousers.map((e) => e.event_id);

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role_id: user.role_id,
    role_name: roleName,
    avatar_url: user.avatar_url,
    tier,
    tenant_owner_id: effectiveTenantOwnerId,
    parent_user_id: user.parent_user_id,
    purchase_plan_id: planId,
    purchase_plan_name: planName,
    features,
    permissions,
    permissionSet,
    modules,
    assigned_client_ids: assignedClientIds,
    assigned_event_ids: assignedEventIds,
    hasPermission: (perm: PermissionKey) => {
      if (tier === 'super_admin') return true;
      const reqFeat = PERMISSION_REQUIRED_FEATURE[perm];
      if (applyFeatureGate && reqFeat && !features[reqFeat]) return false;
      return permissionSet.has(perm);
    },
    hasFeature: (feature: FeatureKey) => {
      if (tier === 'super_admin') return true;
      return features[feature] === true;
    },
  };
}

export async function requireAdminContextFromCookies(): Promise<
  | { ok: true; ctx: AdminAccessContext; session: AdminSessionUser }
  | { ok: false; error: string }
> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const ctx = await getAdminAccessContext(session.id);
  if (!ctx) return { ok: false, error: 'Account inactive or unauthorized' };
  return { ok: true, ctx, session };
}

export async function getAdminContextFromRequest(
  request: Request
): Promise<AdminAccessContext | null> {
  const jwtUser = getAdminFromAuthorizationHeader(request);
  if (jwtUser) {
    return getAdminAccessContext(jwtUser.id);
  }
  const cookieUser = await getAdminSessionFromCookies();
  if (cookieUser) {
    return getAdminAccessContext(cookieUser.id);
  }
  return null;
}

/**
 * Prisma `where` filter scoping `events` queries to what this admin/staff/client/subuser may view.
 */
export function buildAccessibleEventsWhere(ctx: AdminAccessContext): Prisma.eventsWhereInput {
  if (ctx.tier === 'super_admin') {
    return {};
  }
  if (ctx.tier === 'super_staff') {
    if (ctx.assigned_client_ids.length === 0 && ctx.assigned_event_ids.length === 0) {
      return { id: '00000000-0000-0000-0000-000000000000' };
    }
    const clauses: Prisma.eventsWhereInput[] = [];
    if (ctx.assigned_client_ids.length > 0) {
      clauses.push({ tenant_owner_id: { in: ctx.assigned_client_ids } });
      clauses.push({ created_by: { in: ctx.assigned_client_ids } });
    }
    if (ctx.assigned_event_ids.length > 0) {
      clauses.push({ id: { in: ctx.assigned_event_ids } });
    }
    return { OR: clauses };
  }
  if (ctx.tier === 'client_admin') {
    const ownerId = ctx.tenant_owner_id ?? ctx.id;
    return {
      OR: [
        { tenant_owner_id: ownerId },
        { created_by: ownerId },
        { created_by: ctx.id },
        { event_admins: { some: { user_id: ctx.id } } },
      ],
    };
  }
  // client_subuser (e.g. photographer, coordinator): strictly assigned events within tenant
  return {
    event_admins: { some: { user_id: ctx.id } },
    ...(ctx.tenant_owner_id
      ? {
          OR: [{ tenant_owner_id: ctx.tenant_owner_id }, { tenant_owner_id: null }],
        }
      : {}),
  };
}

export async function canContextAccessEvent(
  ctx: AdminAccessContext,
  eventId: string
): Promise<boolean> {
  if (ctx.tier === 'super_admin') return true;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      created_by: true,
      tenant_owner_id: true,
      event_admins: { where: { user_id: ctx.id }, select: { id: true } },
    },
  });
  if (!event) return false;
  if (event.event_admins.length > 0) return true;

  const eventOwner = event.tenant_owner_id ?? event.created_by;
  if (ctx.tier === 'super_staff') {
    return ctx.assigned_client_ids.includes(eventOwner) || ctx.assigned_client_ids.includes(event.created_by);
  }
  if (ctx.tier === 'client_admin') {
    const ownerId = ctx.tenant_owner_id ?? ctx.id;
    return eventOwner === ownerId || event.created_by === ctx.id;
  }
  return false;
}

/**
 * Resolve effective plan features for any event (used by Mobile APIs & Event pages).
 * Priority: event's tenant_owner plan -> event creator's tenant_owner/plan -> all enabled.
 */
export async function getEventEffectiveFeatures(eventId: string): Promise<FeatureMap> {
  await ensureRbacBootstrapped();
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      tenant_owner_id: true,
      created_by: true,
    },
  });
  if (!event) return { ...ALL_FEATURES_ENABLED };

  const targetOwnerId = event.tenant_owner_id ?? event.created_by;
  if (!targetOwnerId) return { ...ALL_FEATURES_ENABLED };

  const owner = await prisma.users.findUnique({
    where: { id: targetOwnerId },
    select: {
      id: true,
      tenant_owner_id: true,
      feature_overrides: true,
      purchase_plan: { select: { features: true } },
      tenant_owner: {
        select: {
          feature_overrides: true,
          purchase_plan: { select: { features: true } },
        },
      },
      roles: { select: { name: true, scope: true } },
    },
  });
  if (!owner) return { ...ALL_FEATURES_ENABLED };
  if (owner.roles.name === 'super_admin') return { ...ALL_FEATURES_ENABLED };

  const planHolder = owner.tenant_owner ?? owner;
  if (!planHolder.purchase_plan && !planHolder.feature_overrides) {
    return { ...ALL_FEATURES_ENABLED };
  }
  return computeEffectiveFeatures(planHolder.purchase_plan?.features, planHolder.feature_overrides);
}

/** Serialize context safely to client components (no Set methods). */
export type ClientAdminAccess = {
  id: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name: string;
  avatar_url: string | null;
  tier: AdminTier;
  tenant_owner_id: string | null;
  purchase_plan_id: string | null;
  purchase_plan_name: string | null;
  features: FeatureMap;
  permissions: PermissionKey[];
  modules: AdminModule[];
};

export function toClientAdminAccess(ctx: AdminAccessContext): ClientAdminAccess {
  return {
    id: ctx.id,
    full_name: ctx.full_name,
    email: ctx.email,
    role_id: ctx.role_id,
    role_name: ctx.role_name,
    avatar_url: ctx.avatar_url,
    tier: ctx.tier,
    tenant_owner_id: ctx.tenant_owner_id,
    purchase_plan_id: ctx.purchase_plan_id,
    purchase_plan_name: ctx.purchase_plan_name,
    features: ctx.features,
    permissions: ctx.permissions,
    modules: ctx.modules,
  };
}

export function allPermissionKeys(): PermissionKey[] {
  return [...PERMISSION_KEYS];
}

export function buildMasterDataWhere(ctx: AdminAccessContext): {
  OR?: Array<{ tenant_owner_id: null | string | { in: string[] } }>;
} {
  if (ctx.tier === 'super_admin') return {};
  if (ctx.tier === 'super_staff') {
    return {
      OR: [
        { tenant_owner_id: null },
        ...(ctx.assigned_client_ids.length > 0
          ? [{ tenant_owner_id: { in: ctx.assigned_client_ids } }]
          : []),
      ],
    };
  }
  const ownerId = ctx.tenant_owner_id ?? ctx.id;
  return {
    OR: [{ tenant_owner_id: null }, { tenant_owner_id: ownerId }],
  };
}

export function buildTenantSelectWhere(tenantOwnerId?: string | null): {
  OR?: Array<{ tenant_owner_id: null | string }>;
  tenant_owner_id?: null;
} {
  if (tenantOwnerId === undefined) return {};
  if (tenantOwnerId === null) return { tenant_owner_id: null };
  return { OR: [{ tenant_owner_id: null }, { tenant_owner_id: tenantOwnerId }] };
}

export function canContextMutateMasterAsset(
  ctx: AdminAccessContext,
  assetOwnerId: string | null | undefined,
  managePerm: PermissionKey
): boolean {
  if (!ctx.hasPermission(managePerm)) return false;
  if (ctx.tier === 'super_admin') return true;
  if (ctx.tier === 'super_staff') {
    return assetOwnerId == null || ctx.assigned_client_ids.includes(assetOwnerId);
  }
  const ownerId = ctx.tenant_owner_id ?? ctx.id;
  return Boolean(assetOwnerId && assetOwnerId === ownerId);
}

export function masterAssetCreateOwnerId(ctx: AdminAccessContext): string | null {
  if (ctx.tier === 'super_admin' || ctx.tier === 'super_staff') return null;
  return ctx.tenant_owner_id ?? ctx.id;
}

/**
 * Resolve a post's event and whether the `mobile_feed` feature is enabled for it.
 * Returns `exists: false` when the post does not exist so callers preserve 404 semantics.
 */
export async function getPostEventFeedAllowed(
  postId: string,
  fallbackEventId?: string | null
): Promise<{ exists: boolean; allowed: boolean; event_id: string | null }> {
  const post = await prisma.posts.findUnique({
    where: { id: postId },
    select: { id: true, event_id: true },
  });
  if (!post) {
    return { exists: false, allowed: true, event_id: null };
  }
  const eventId = post.event_id ?? fallbackEventId ?? null;
  if (!eventId) {
    return { exists: true, allowed: true, event_id: null };
  }
  const features = await getEventEffectiveFeatures(eventId);
  return { exists: true, allowed: features.mobile_feed, event_id: eventId };
}

/** Resolve event_id from either an event_session_id or event_day_id query parameter. */
export async function resolveSessionOrDayEventId(input: {
  event_session_id?: string | null;
  event_day_id?: string | null;
}): Promise<string | null> {
  if (input.event_session_id) {
    const row = await prisma.event_sessions.findUnique({
      where: { id: input.event_session_id },
      select: { event_days: { select: { event_id: true } } },
    });
    return row?.event_days?.event_id ?? null;
  }
  if (input.event_day_id) {
    const row = await prisma.event_days.findUnique({
      where: { id: input.event_day_id },
      select: { event_id: true },
    });
    return row?.event_id ?? null;
  }
  return null;
}
