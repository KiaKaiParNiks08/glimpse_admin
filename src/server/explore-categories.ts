import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import type {
  ListExploreCategoriesQuery,
  CreateExploreCategoryInput,
  UpdateExploreCategoryInput,
  CreateExploreItemInput,
  UpdateExploreItemInput,
} from '@/lib/validations/explore';

const categoryListSelect = {
  id: true,
  title: true,
  description: true,
  background_url: true,
  created_at: true,
  updated_at: true,
  _count: { select: { explore_items: true } },
} as const;

export type ExploreCategoryListItem = {
  id: string;
  title: string;
  description: string | null;
  background_url: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  _count: { explore_items: number };
};

const itemSelect = {
  id: true,
  category_id: true,
  title: true,
  description: true,
  address: true,
  city: true,
  state: true,
  country: true,
  latitude: true,
  longitude: true,
  created_at: true,
  updated_at: true,
} as const;

export type ExploreItemRow = {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  created_at: Date | null;
  updated_at: Date | null;
};

/**
 * List explore categories with optional search and pagination.
 */
export async function listExploreCategories(
  query: ListExploreCategoriesQuery
): Promise<{ categories: ExploreCategoryListItem[]; total: number }> {
  const { page, limit, search } = query;
  const skip = (page - 1) * limit;
  const where: Prisma.explore_categoriesWhereInput = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [categories, total] = await Promise.all([
    prisma.explore_categories.findMany({
      where,
      orderBy: { title: 'asc' },
      skip,
      take: limit,
      select: categoryListSelect,
    }),
    prisma.explore_categories.count({ where }),
  ]);

  return { categories, total };
}

/**
 * Get a single explore category by id with its items.
 */
export async function getExploreCategoryById(category_id: string) {
  const category = await prisma.explore_categories.findUnique({
    where: { id: category_id },
    select: {
      id: true,
      title: true,
      description: true,
      background_url: true,
      created_at: true,
      updated_at: true,
      explore_items: {
        orderBy: { title: 'asc' },
        select: itemSelect,
      },
    },
  });
  return category;
}

/**
 * Create an explore category.
 */
export async function createExploreCategory(data: CreateExploreCategoryInput) {
  const category = await prisma.explore_categories.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      background_url: data.background_url ?? null,
    },
    select: categoryListSelect,
  });
  return category;
}

/**
 * Update an explore category.
 */
export async function updateExploreCategory(
  category_id: string,
  data: UpdateExploreCategoryInput
) {
  const existing = await prisma.explore_categories.findUnique({
    where: { id: category_id },
    select: { id: true },
  });
  if (!existing) return null;

  const category = await prisma.explore_categories.update({
    where: { id: category_id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description ?? null }),
      ...(data.background_url !== undefined && { background_url: data.background_url ?? null }),
    },
    select: categoryListSelect,
  });
  return category;
}

/**
 * Delete an explore category. Cascades to explore_items.
 */
export async function deleteExploreCategory(category_id: string): Promise<boolean> {
  try {
    await prisma.explore_categories.delete({ where: { id: category_id } });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return false;
    throw e;
  }
}

/**
 * Create an explore item under a category.
 */
export async function createExploreItem(data: CreateExploreItemInput) {
  const item = await prisma.explore_items.create({
    data: {
      category_id: data.category_id,
      title: data.title,
      description: data.description ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      country: data.country ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
    select: itemSelect,
  });
  return item;
}

/**
 * Update an explore item.
 */
export async function updateExploreItem(item_id: string, data: UpdateExploreItemInput) {
  const existing = await prisma.explore_items.findUnique({
    where: { id: item_id },
    select: { id: true },
  });
  if (!existing) return null;

  const item = await prisma.explore_items.update({
    where: { id: item_id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description ?? null }),
      ...(data.address !== undefined && { address: data.address ?? null }),
      ...(data.city !== undefined && { city: data.city ?? null }),
      ...(data.state !== undefined && { state: data.state ?? null }),
      ...(data.country !== undefined && { country: data.country ?? null }),
      ...(data.latitude !== undefined && { latitude: data.latitude ?? null }),
      ...(data.longitude !== undefined && { longitude: data.longitude ?? null }),
    },
    select: itemSelect,
  });
  return item;
}

/**
 * Delete an explore item.
 */
export async function deleteExploreItem(item_id: string): Promise<boolean> {
  try {
    await prisma.explore_items.delete({ where: { id: item_id } });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return false;
    throw e;
  }
}

/**
 * List all explore categories with their items (for event mapping step).
 */
export async function listAllExploreCategoriesWithItems() {
  return prisma.explore_categories.findMany({
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      description: true,
      background_url: true,
      explore_items: {
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          city: true,
          country: true,
        },
      },
    },
  });
}
