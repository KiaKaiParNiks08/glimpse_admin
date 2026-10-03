import prisma from '@/server/prisma';
import type {
  CreateAppThemeInput,
  ListAppThemesQuery,
  UpdateAppThemeInput,
} from '@/lib/validations/app-themes';

export type AppThemeListItem = {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  button_primary_color: string;
  button_secondary_color: string;
  created_at?: Date | null;
  updated_at?: Date | null;
};

const appThemeSelect = {
  id: true,
  name: true,
  primary_color: true,
  secondary_color: true,
  button_primary_color: true,
  button_secondary_color: true,
  created_at: true,
  updated_at: true,
} as const;

export async function listAppThemesForSelect(): Promise<AppThemeListItem[]> {
  return prisma.app_themes.findMany({
    orderBy: { name: 'asc' },
    select: appThemeSelect,
  });
}

export async function createAppTheme(data: CreateAppThemeInput): Promise<AppThemeListItem> {
  const row = await prisma.app_themes.create({
    data: {
      name: data.name.trim(),
      primary_color: data.primary_color,
      secondary_color: data.secondary_color,
      button_primary_color: data.button_primary_color,
      button_secondary_color: data.button_secondary_color,
    },
    select: appThemeSelect,
  });
  return row;
}

export async function getAppThemes(query: ListAppThemesQuery) {
  const { page, limit, search } = query;
  const skip = (page - 1) * limit;
  const where = search?.trim()
    ? {
        name: {
          contains: search.trim(),
          mode: 'insensitive' as const,
        },
      }
    : undefined;

  const [rows, total] = await Promise.all([
    prisma.app_themes.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
      select: appThemeSelect,
    }),
    prisma.app_themes.count({ where }),
  ]);

  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function updateAppTheme(
  id: string,
  input: UpdateAppThemeInput
): Promise<AppThemeListItem | null> {
  const data: Record<string, string | Date> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.primary_color !== undefined) data.primary_color = input.primary_color;
  if (input.secondary_color !== undefined) data.secondary_color = input.secondary_color;
  if (input.button_primary_color !== undefined) data.button_primary_color = input.button_primary_color;
  if (input.button_secondary_color !== undefined) data.button_secondary_color = input.button_secondary_color;

  if (Object.keys(data).length === 0) {
    return prisma.app_themes.findUnique({
      where: { id },
      select: appThemeSelect,
    });
  }

  return prisma.app_themes.update({
    where: { id },
    data: {
      ...data,
      updated_at: new Date(),
    },
    select: appThemeSelect,
  });
}

export async function deleteAppTheme(id: string): Promise<boolean> {
  const result = await prisma.app_themes.deleteMany({ where: { id } });
  return result.count > 0;
}
