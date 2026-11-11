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
  is_active: boolean;
  is_default: boolean;
  _count?: { users: number };
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
      include: { _count: { select: { users: true } } },
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
        is_active: input.is_active ?? true,
        is_default: input.is_default ?? false,
        created_by: gate.ctx.id,
      },
      include: { _count: { select: { users: true } } },
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
        ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
        ...(input.is_default !== undefined ? { is_default: input.is_default } : {}),
        updated_at: new Date(),
      },
      include: { _count: { select: { users: true } } },
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
      include: { _count: { select: { users: true } } },
    });
    if (!plan) return { ok: false, error: 'Plan not found' };
    if (plan._count.users > 0) {
      return {
        ok: false,
        error: `Cannot delete "${plan.name}" because ${plan._count.users} client(s) use it. Deactivate it instead.`,
      } as { ok: false; error: string };
    }
    await prisma.purchase_plans.delete({ where: { id } });
    return { ok: true };
  } catch (e) {
    console.error('[deletePurchasePlanAction]', e);
    return { ok: false, error: 'Unable to delete purchase plan' };
  }
}
