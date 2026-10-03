'use server';

import {
  appThemeIdParamSchema,
  createAppThemeSchema,
  listAppThemesQuerySchema,
  updateAppThemeSchema,
} from '@/lib/validations/app-themes';
import type { AdminSessionUser } from '@/lib/admin-session';
import { getAdminSessionFromCookies } from '@/lib/admin-session';
import {
  createAppTheme,
  deleteAppTheme,
  getAppThemes,
  updateAppTheme,
} from '@/server/app-themes';

export type AppThemeRow = {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  button_primary_color: string;
  button_secondary_color: string;
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

async function requireSuperAdminSession(): Promise<
  { ok: true; session: AdminSessionUser } | { ok: false; error: string }
> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  if (session.role_name !== 'super_admin') return { ok: false, error: 'Forbidden' };
  return { ok: true, session };
}

export async function listAppThemesAction(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<ListAppThemesResult> {
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = listAppThemesQuerySchema.safeParse({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    search: params.search,
  });
  if (!parsed.success) return { ok: false, error: 'Invalid parameters' };

  try {
    const result = await getAppThemes(parsed.data);
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
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = createAppThemeSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'Invalid data' };

  try {
    const row = await createAppTheme(parsed.data);
    return { ok: true, data: row as AppThemeRow };
  } catch {
    return { ok: false, error: 'Unable to create app theme' };
  }
}

export async function updateAppThemeAction(id: string, body: unknown): Promise<MutateAppThemeResult> {
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const idParsed = appThemeIdParamSchema.safeParse({ id });
  if (!idParsed.success) return { ok: false, error: 'Invalid theme id' };

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
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const idParsed = appThemeIdParamSchema.safeParse({ id });
  if (!idParsed.success) return { ok: false, error: 'Invalid theme id' };

  try {
    const deleted = await deleteAppTheme(idParsed.data.id);
    if (!deleted) return { ok: false, error: 'App theme not found' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Unable to delete app theme' };
  }
}
