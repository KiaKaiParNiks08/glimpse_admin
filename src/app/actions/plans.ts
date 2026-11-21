'use server';

import prisma from '@/server/prisma';
import { requireAdminContextFromCookies } from '@/server/access';
import { ensureRbacBootstrapped } from '@/server/seed-rbac';
import { FEATURE_KEYS, type FeatureKey, type FeatureMap } from '@/lib/rbac';

export type PurchasePlanItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  features: FeatureMap;
  max_events: number | null;
  max_sub_users: number | null;
  max_event_admins: number | null;
  max_session_media_uploaders: number | null;
  is_custom: boolean;
  is_recommended: boolean;
  is_active: boolean;
  is_default: boolean;
  _count?: { users: number; custom_events?: number };
};

function sanitizeFeatures(raw: unknown): FeatureMap {
  const out = {} as FeatureMap;
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  for (const key of FEATURE_KEYS) {
    out[key] = obj[key] === true;
  }
  return out;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function listPurchasePlansAction(options?: {
  includeInactive?: boolean;
}): Promise<{ ok: true; data: PurchasePlanItem[] } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  await ensureRbacBootstrapped();

  const { ctx } = gate;
  if (!ctx.hasPermission('plans.manage') && !ctx.hasPermission('users.manage') && !ctx.hasPermission('users.view')) {
    return { ok: false, error: 'Forbidden' };
  }

  try {
    const showAll = ctx.tier === 'super_admin' && options?.includeInactive !== false;
    const rows = await prisma.purchase_plans.findMany({
      where: showAll ? {} : { is_active: true },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      include: {
        _count: {
          select: { users: true, custom_events: true },
        },
      },
    });
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        features: sanitizeFeatures(r.features),
        max_events: r.max_events,
        max_sub_users: r.max_sub_users,
        max_event_admins: r.max_event_admins,
        max_session_media_uploaders: r.max_session_media_uploaders,
        is_custom: r.is_custom,
        is_recommended: r.is_recommended,
        is_active: r.is_active,
        is_default: r.is_default,
        _count: r._count,
      })),
    };
  } catch (e) {
    console.error('[listPurchasePlansAction]', e);
    return { ok: false, error: 'Unable to load purchase plans' };
  }
}

export async function createPurchasePlanAction(input: {
  name: string;
  slug?: string;
  description?: string | null;
  features: Partial<Record<FeatureKey, boolean>>;
  max_events?: number | null;
  max_sub_users?: number | null;
  max_event_admins?: number | null;
  max_session_media_uploaders?: number | null;
  is_custom?: boolean;
  is_recommended?: boolean;
  is_active?: boolean;
  is_default?: boolean;
}): Promise<{ ok: true; data: PurchasePlanItem } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.ctx.tier !== 'super_admin' && !gate.ctx.hasPermission('plans.manage')) {
    return { ok: false, error: 'Only Super Admin can create purchase plans' };
  }

  const name = input.name.trim();
  const slug = slugify(input.slug?.trim() || name);
  if (!name || !slug) return { ok: false, error: 'Plan name is required' };

  const features = sanitizeFeatures(input.features);

  try {
    if (input.is_default) {
      await prisma.purchase_plans.updateMany({ data: { is_default: false } });
    }
    const created = await prisma.purchase_plans.create({
      data: {
        name,
        slug,
        description: input.description?.trim() || null,
        features,
        max_events: input.max_events ?? null,
        max_sub_users: input.max_sub_users ?? null,
        max_event_admins: input.max_event_admins ?? null,
        max_session_media_uploaders: input.max_session_media_uploaders ?? null,
        is_custom: input.is_custom ?? false,
        is_recommended: input.is_recommended ?? false,
        is_active: input.is_active ?? true,
        is_default: input.is_default ?? false,
        created_by: gate.ctx.id,
      },
      include: { _count: { select: { users: true, custom_events: true } } },
    });
    return {
      ok: true,
      data: {
        id: created.id,
        name: created.name,
        slug: created.slug,
        description: created.description,
        features: sanitizeFeatures(created.features),
        max_events: created.max_events,
        max_sub_users: created.max_sub_users,
        max_event_admins: created.max_event_admins,
        max_session_media_uploaders: created.max_session_media_uploaders,
        is_custom: created.is_custom,
        is_recommended: created.is_recommended,
        is_active: created.is_active,
        is_default: created.is_default,
        _count: created._count,
      },
    };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2002') return { ok: false, error: 'A plan with this slug already exists' };
    console.error('[createPurchasePlanAction]', e);
    return { ok: false, error: 'Unable to create purchase plan' };
  }
}

export async function updatePurchasePlanAction(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    features?: Partial<Record<FeatureKey, boolean>>;
    max_events?: number | null;
    max_sub_users?: number | null;
    max_event_admins?: number | null;
    max_session_media_uploaders?: number | null;
    is_custom?: boolean;
    is_recommended?: boolean;
    is_active?: boolean;
    is_default?: boolean;
  }
): Promise<{ ok: true; data: PurchasePlanItem } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.ctx.tier !== 'super_admin' && !gate.ctx.hasPermission('plans.manage')) {
    return { ok: false, error: 'Only Super Admin can update purchase plans' };
  }

  try {
    if (input.is_default) {
      await prisma.purchase_plans.updateMany({
        where: { id: { not: id } },
        data: { is_default: false },
      });
    }
    const existing = await prisma.purchase_plans.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: 'Plan not found' };

    const updated = await prisma.purchase_plans.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.features !== undefined ? { features: sanitizeFeatures(input.features) } : {}),
        ...(input.max_events !== undefined ? { max_events: input.max_events } : {}),
        ...(input.max_sub_users !== undefined ? { max_sub_users: input.max_sub_users } : {}),
        ...(input.max_event_admins !== undefined ? { max_event_admins: input.max_event_admins } : {}),
        ...(input.max_session_media_uploaders !== undefined ? { max_session_media_uploaders: input.max_session_media_uploaders } : {}),
        ...(input.is_custom !== undefined ? { is_custom: input.is_custom } : {}),
        ...(input.is_recommended !== undefined ? { is_recommended: input.is_recommended } : {}),
        ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
        ...(input.is_default !== undefined ? { is_default: input.is_default } : {}),
        updated_at: new Date(),
      },
      include: { _count: { select: { users: true, custom_events: true } } },
    });

    return {
      ok: true,
      data: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        features: sanitizeFeatures(updated.features),
        max_events: updated.max_events,
        max_sub_users: updated.max_sub_users,
        max_event_admins: updated.max_event_admins,
        max_session_media_uploaders: updated.max_session_media_uploaders,
        is_custom: updated.is_custom,
        is_recommended: updated.is_recommended,
        is_active: updated.is_active,
        is_default: updated.is_default,
        _count: updated._count,
      },
    };
  } catch (e) {
    console.error('[updatePurchasePlanAction]', e);
    return { ok: false, error: 'Unable to update purchase plan' };
  }
}

export async function deletePurchasePlanAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.ctx.tier !== 'super_admin' && !gate.ctx.hasPermission('plans.manage')) {
    return { ok: false, error: 'Only Super Admin can delete purchase plans' };
  }

  try {
    const plan = await prisma.purchase_plans.findUnique({
      where: { id },
      include: { _count: { select: { users: true, custom_events: true } } },
    });
    if (!plan) return { ok: false, error: 'Plan not found' };
    if (plan._count.users > 0 || (plan._count.custom_events && plan._count.custom_events > 0)) {
      const usage = plan._count.users > 0 ? `${plan._count.users} client(s)` : `${plan._count.custom_events} event(s)`;
      return {
        ok: false,
        error: `Cannot delete "${plan.name}" because ${usage} use it. Deactivate it instead.`,
      };
    }
    await prisma.purchase_plans.delete({ where: { id } });
    return { ok: true };
  } catch (e) {
    console.error('[deletePurchasePlanAction]', e);
    return { ok: false, error: 'Unable to delete purchase plan' };
  }
}

export async function assignCustomEventPlanAction(input: {
  eventId: string;
  planId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.ctx.tier !== 'super_admin') {
    return { ok: false, error: 'Only Super Admin can assign custom event plans' };
  }

  try {
    const plan = await prisma.purchase_plans.findUnique({ where: { id: input.planId } });
    if (!plan) return { ok: false, error: 'Plan not found' };

    await prisma.events.update({
      where: { id: input.eventId },
      data: { custom_plan_id: plan.id },
    });
    return { ok: true };
  } catch (e: any) {
    console.error('[assignCustomEventPlanAction]', e);
    return { ok: false, error: e?.message || 'Failed to assign custom plan' };
  }
}

export async function removeCustomEventPlanAction(input: {
  eventId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.ctx.tier !== 'super_admin') {
    return { ok: false, error: 'Only Super Admin can remove custom event plans' };
  }

  try {
    await prisma.events.update({
      where: { id: input.eventId },
      data: { custom_plan_id: null },
    });
    return { ok: true };
  } catch (e: any) {
    console.error('[removeCustomEventPlanAction]', e);
    return { ok: false, error: e?.message || 'Failed to remove custom plan' };
  }
}

export async function createAndAssignCustomEventPlanAction(input: {
  eventId: string;
  name: string;
  description?: string;
  features: Partial<Record<FeatureKey, boolean>>;
  max_event_admins?: number;
  max_session_media_uploaders?: number;
}): Promise<{ ok: true; data: PurchasePlanItem } | { ok: false; error: string }> {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.ctx.tier !== 'super_admin') {
    return { ok: false, error: 'Only Super Admin can create custom event plans' };
  }

  try {
    const slug = `custom-${input.eventId.slice(0, 8)}-${Date.now().toString(36)}`;
    const plan = await prisma.purchase_plans.create({
      data: {
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || `Custom plan for event ${input.eventId}`,
        features: sanitizeFeatures(input.features),
        max_events: null,
        max_sub_users: null,
        max_event_admins: input.max_event_admins ?? 10,
        max_session_media_uploaders: input.max_session_media_uploaders ?? 10,
        is_custom: true,
        is_recommended: false,
        is_active: true,
        is_default: false,
        created_by: gate.ctx.id,
      },
      include: { _count: { select: { users: true, custom_events: true } } },
    });

    await prisma.events.update({
      where: { id: input.eventId },
      data: { custom_plan_id: plan.id },
    });

    return {
      ok: true,
      data: {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        features: sanitizeFeatures(plan.features),
        max_events: plan.max_events,
        max_sub_users: plan.max_sub_users,
        max_event_admins: plan.max_event_admins,
        max_session_media_uploaders: plan.max_session_media_uploaders,
        is_custom: plan.is_custom,
        is_recommended: plan.is_recommended,
        is_active: plan.is_active,
        is_default: plan.is_default,
        _count: plan._count,
      },
    };
  } catch (e: any) {
    console.error('[createAndAssignCustomEventPlanAction]', e);
    return { ok: false, error: e?.message || 'Failed to create and assign custom plan' };
  }
}
