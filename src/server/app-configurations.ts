import { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import type {
  CreateAppConfigurationInput,
  ListAppConfigurationsQuery,
  PatchAppConfigurationInput,
} from '@/lib/validations/app-configurations';

const appConfigurationSelect = {
  id: true,
  platform: true,
  app_name: true,
  store_url: true,
  current_version: true,
  minimum_supported_version: true,
  force_update: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} as const;

/**
 * Get list of app configurations with optional filters and pagination.
 */
export async function getAppConfigurations(query: ListAppConfigurationsQuery) {
  const { page, limit, platform, is_active } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(platform && { platform }),
    ...(is_active !== undefined && { is_active }),
  };

  const [rows, total] = await Promise.all([
    prisma.app_configurations.findMany({
      where,
      orderBy: { platform: 'asc' },
      skip,
      take: limit,
      select: appConfigurationSelect,
    }),
    prisma.app_configurations.count({ where }),
  ]);

  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function createAppConfiguration(input: CreateAppConfigurationInput) {
  return prisma.app_configurations.create({
    data: {
      platform: input.platform,
      app_name: input.app_name ?? null,
      store_url: input.store_url,
      current_version: input.current_version ?? null,
      minimum_supported_version: input.minimum_supported_version ?? null,
      force_update: input.force_update ?? false,
      is_active: input.is_active ?? true,
    },
    select: appConfigurationSelect,
  });
}

export async function updateAppConfiguration(id: string, input: PatchAppConfigurationInput) {
  const data: Prisma.app_configurationsUpdateInput = {};
  if (input.app_name !== undefined) data.app_name = input.app_name;
  if (input.store_url !== undefined) data.store_url = input.store_url;
  if (input.current_version !== undefined) data.current_version = input.current_version;
  if (input.minimum_supported_version !== undefined) data.minimum_supported_version = input.minimum_supported_version;
  if (input.force_update !== undefined) data.force_update = input.force_update;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  if (Object.keys(data).length === 0) {
    return prisma.app_configurations.findUnique({
      where: { id },
      select: appConfigurationSelect,
    });
  }
  return prisma.app_configurations.update({
    where: { id },
    data: { ...data, updated_at: new Date() },
    select: appConfigurationSelect,
  });
}

export function isPrismaUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
