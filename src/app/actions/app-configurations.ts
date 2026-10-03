'use server';

import {
  createAppConfigurationSchema,
  listAppConfigurationsQuerySchema,
  patchAppConfigurationSchema,
} from '@/lib/validations/app-configurations';
import type { AdminSessionUser } from '@/lib/admin-session';
import { getAdminSessionFromCookies } from '@/lib/admin-session';
import {
  createAppConfiguration,
  getAppConfigurations,
  isPrismaUniqueViolation,
  updateAppConfiguration,
} from '@/server/app-configurations';
import { Prisma } from '@prisma/client';

export type AppConfigurationRow = {
  id: string;
  platform: string;
  app_name: string | null;
  store_url: string;
  current_version: string | null;
  minimum_supported_version: string | null;
  force_update: boolean | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export type ListAppConfigurationsResult =
  | { ok: true; data: AppConfigurationRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }
  | { ok: false; error: string };

export type MutateAppConfigurationResult =
  | { ok: true; data: AppConfigurationRow }
  | { ok: false; error: string };

async function requireSuperAdminSession(): Promise<
  { ok: true; session: AdminSessionUser } | { ok: false; error: string }
> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  if (session.role_name !== 'super_admin') return { ok: false, error: 'Forbidden' };
  return { ok: true, session };
}

export async function listAppConfigurationsAction(params: {
  page?: number;
  limit?: number;
  platform?: string;
  is_active?: boolean;
}): Promise<ListAppConfigurationsResult> {
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = listAppConfigurationsQuerySchema.safeParse({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    platform: params.platform,
    is_active: params.is_active,
  });
  if (!parsed.success) return { ok: false, error: 'Invalid parameters' };

  try {
    const result = await getAppConfigurations(parsed.data);
    return {
      ok: true,
      data: result.data as AppConfigurationRow[],
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  } catch {
    return { ok: false, error: 'Unable to load app configurations' };
  }
}

export async function createAppConfigurationAction(
  body: unknown
): Promise<MutateAppConfigurationResult> {
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = createAppConfigurationSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'Invalid data' };

  try {
    const row = await createAppConfiguration(parsed.data);
    return { ok: true, data: row as AppConfigurationRow };
  } catch (e) {
    if (isPrismaUniqueViolation(e)) return { ok: false, error: 'This platform is already configured' };
    return { ok: false, error: 'Unable to create app configuration' };
  }
}

export async function updateAppConfigurationAction(
  id: string,
  body: unknown
): Promise<MutateAppConfigurationResult> {
  const gate = await requireSuperAdminSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = patchAppConfigurationSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'Invalid data' };

  try {
    const row = await updateAppConfiguration(id, parsed.data);
    if (!row) return { ok: false, error: 'App configuration not found' };
    return { ok: true, data: row as AppConfigurationRow };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { ok: false, error: 'App configuration not found' };
    }
    return { ok: false, error: 'Unable to update app configuration' };
  }
}
