'use server';

import prisma from '@/server/prisma';
import {
  appThemeIdParamSchema,
  createAppThemeSchema,
  listAppThemesQuerySchema,
  updateAppThemeSchema,
} from '@/lib/validations/app-themes';
import {
  createAppTheme,
  deleteAppTheme,
  getAppThemes,
  updateAppTheme,
} from '@/server/app-themes';
import {
  requireAdminContextFromCookies,
  buildMasterDataWhere,
  canContextMutateMasterAsset,
  masterAssetCreateOwnerId,
} from '@/server/access';

export type AppThemeRow = {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  button_primary_color: string;
  button_secondary_color: string;
  tenant_owner_id: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export type ListAppThemesResult =
  | { ok: true; data: AppThemeRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }
  | { ok: false; error: string };

export type MutateAppThemeResult =
  | { ok: true; data: AppThemeRow }
  | { ok: false; error: string };

export type DeleteAppThemeResult = { ok: true } | { ok: false; error: string };

export async function listAppThemesAction(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<ListAppThemesResult> {
  const auth = await requireAdminContextFromCookies();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!auth.ctx.hasPermission('app_themes.view') && !auth.ctx.hasPermission('app_themes.manage')) {
    return { ok: false, error: 'Forbidden' };
  }

  const parsed = listAppThemesQuerySchema.safeParse({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    search: params.search,
  });
  if (!parsed.success) return { ok: false, error: 'Invalid parameters' };

  try {
    const result = await getAppThemes(parsed.data, buildMasterDataWhere(auth.ctx));
    return {
      ok: true,
      data: result.data as AppThemeRow[],
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  } catch {
    return { ok: false, error: 'Unable to load app themes' };
  }
}

export async function createAppThemeAdminAction(body: unknown): Promise<MutateAppThemeResult> {
  const auth = await requireAdminContextFromCookies();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!auth.ctx.hasPermission('app_themes.manage')) {
    return { ok: false, error: 'Forbidden: app themes management is disabled for your role or plan' };
  }

  const parsed = createAppThemeSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'Invalid data' };

  try {
    const row = await createAppTheme(parsed.data, masterAssetCreateOwnerId(auth.ctx));
    return { ok: true, data: row as AppThemeRow };
  } catch {
    return { ok: false, error: 'Unable to create app theme' };
  }
}

export async function updateAppThemeAction(id: string, body: unknown): Promise<MutateAppThemeResult> {
  const auth = await requireAdminContextFromCookies();
  if (!auth.ok) return { ok: false, error: auth.error };

  const idParsed = appThemeIdParamSchema.safeParse({ id });
  if (!idParsed.success) return { ok: false, error: 'Invalid theme id' };

  const existing = await prisma.app_themes.findUnique({
    where: { id: idParsed.data.id },
    select: { id: true, tenant_owner_id: true },
  });
  if (!existing) return { ok: false, error: 'App theme not found' };
  if (!canContextMutateMasterAsset(auth.ctx, existing.tenant_owner_id, 'app_themes.manage')) {
    return { ok: false, error: 'Forbidden: you cannot modify this theme' };
  }

  const parsed = updateAppThemeSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'Invalid data' };

  try {
    const row = await updateAppTheme(idParsed.data.id, parsed.data);
    if (!row) return { ok: false, error: 'App theme not found' };
    return { ok: true, data: row as AppThemeRow };
  } catch {
    return { ok: false, error: 'Unable to update app theme' };
  }
}

export async function deleteAppThemeAction(id: string): Promise<DeleteAppThemeResult> {
  const auth = await requireAdminContextFromCookies();
  if (!auth.ok) return { ok: false, error: auth.error };

  const idParsed = appThemeIdParamSchema.safeParse({ id });
  if (!idParsed.success) return { ok: false, error: 'Invalid theme id' };

  const existing = await prisma.app_themes.findUnique({
    where: { id: idParsed.data.id },
    select: { id: true, tenant_owner_id: true },
  });
  if (!existing) return { ok: false, error: 'App theme not found' };
  if (!canContextMutateMasterAsset(auth.ctx, existing.tenant_owner_id, 'app_themes.manage')) {
    return { ok: false, error: 'Forbidden: you cannot delete this theme' };
  }

  try {
    const deleted = await deleteAppTheme(idParsed.data.id);
    if (!deleted) return { ok: false, error: 'App theme not found' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Unable to delete app theme' };
  }
}
