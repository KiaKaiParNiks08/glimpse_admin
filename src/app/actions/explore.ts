'use server';

import {
  listExploreCategoriesQuerySchema,
  createExploreCategorySchema,
  updateExploreCategorySchema,
  createExploreItemSchema,
  updateExploreItemSchema,
} from '@/lib/validations/explore';
import type {
  ListExploreCategoriesQuery,
  CreateExploreCategoryInput,
  UpdateExploreCategoryInput,
  CreateExploreItemInput,
  UpdateExploreItemInput,
} from '@/lib/validations/explore';
import {
  listExploreCategories,
  getExploreCategoryById,
  createExploreCategory,
  updateExploreCategory,
  deleteExploreCategory,
  createExploreItem,
  updateExploreItem,
  deleteExploreItem,
  listAllExploreCategoriesWithItems,
} from '@/server/explore-categories';

function toPlainValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.toNumber === 'function') return (obj as { toNumber: () => number }).toNumber();
    if (val instanceof Date) return val.toISOString();
    if (Array.isArray(val)) return val.map(toPlainValue);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = toPlainValue(v);
    return out;
  }
  return val;
}

export type ExploreCategoryListItem = {
  id: string;
  title: string;
  description: string | null;
  background_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  _count: { explore_items: number };
};

export type ExploreItemListItem = {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type GetExploreCategoriesResult =
  | {
      ok: true;
      data: ExploreCategoryListItem[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    }
  | { ok: false; error: string };

export type GetExploreCategoryByIdResult =
  | { ok: true; data: Awaited<ReturnType<typeof getExploreCategoryById>> }
  | { ok: false; error: string };

export type CreateExploreCategoryResult =
  | { ok: true; data: ExploreCategoryListItem }
  | { ok: false; error: string };

export type UpdateExploreCategoryResult =
  | { ok: true; data: ExploreCategoryListItem }
  | { ok: false; error: string };

export type DeleteExploreCategoryResult = { ok: true } | { ok: false; error: string };

export type CreateExploreItemResult =
  | { ok: true; data: ExploreItemListItem }
  | { ok: false; error: string };

export type UpdateExploreItemResult =
  | { ok: true; data: ExploreItemListItem }
  | { ok: false; error: string };

export type DeleteExploreItemResult = { ok: true } | { ok: false; error: string };

function mapCategoryToList(item: Awaited<ReturnType<typeof listExploreCategories>>['categories'][0]) {
  return {
    ...item,
    created_at: item.created_at ? item.created_at.toISOString() : null,
    updated_at: item.updated_at ? item.updated_at.toISOString() : null,
  };
}

function mapItemToList(item: {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: unknown;
  longitude: unknown;
  created_at: Date | null;
  updated_at: Date | null;
}): ExploreItemListItem {
  return {
    ...item,
    latitude: item.latitude != null ? Number(item.latitude) : null,
    longitude: item.longitude != null ? Number(item.longitude) : null,
    created_at: item.created_at ? item.created_at.toISOString() : null,
    updated_at: item.updated_at ? item.updated_at.toISOString() : null,
  };
}

export async function getExploreCategoriesAction(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<GetExploreCategoriesResult> {
  const parsed = listExploreCategoriesQuerySchema.safeParse({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    search: params.search,
  });
  if (!parsed.success) return { ok: false, error: 'Invalid parameters' };

  try {
    const { categories, total } = await listExploreCategories(parsed.data as ListExploreCategoriesQuery);
    const limit = parsed.data.limit;
    return {
      ok: true,
      data: categories.map(mapCategoryToList) as ExploreCategoryListItem[],
      meta: {
        total,
        page: parsed.data.page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch explore categories' };
  }
}

export async function getExploreCategoryByIdAction(
  categoryId: string
): Promise<GetExploreCategoryByIdResult> {
  if (!categoryId) return { ok: false, error: 'Category ID required' };
  try {
    const category = await getExploreCategoryById(categoryId);
    if (!category) return { ok: false, error: 'Category not found' };
    return { ok: true, data: toPlainValue(category) as Awaited<ReturnType<typeof getExploreCategoryById>> };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch category' };
  }
}

export async function createExploreCategoryAction(
  body: CreateExploreCategoryInput
): Promise<CreateExploreCategoryResult> {
  const parsed = createExploreCategorySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    const category = await createExploreCategory(parsed.data);
    return { ok: true, data: mapCategoryToList(category) as ExploreCategoryListItem };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to create category' };
  }
}

export async function updateExploreCategoryAction(
  categoryId: string,
  body: UpdateExploreCategoryInput
): Promise<UpdateExploreCategoryResult> {
  if (!categoryId) return { ok: false, error: 'Category ID required' };
  const parsed = updateExploreCategorySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    const category = await updateExploreCategory(categoryId, parsed.data);
    if (!category) return { ok: false, error: 'Category not found' };
    return { ok: true, data: mapCategoryToList(category) as ExploreCategoryListItem };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to update category' };
  }
}

export async function deleteExploreCategoryAction(
  categoryId: string
): Promise<DeleteExploreCategoryResult> {
  if (!categoryId) return { ok: false, error: 'Category ID required' };
  try {
    const deleted = await deleteExploreCategory(categoryId);
    if (!deleted) return { ok: false, error: 'Category not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to delete category' };
  }
}

export async function createExploreItemAction(
  body: CreateExploreItemInput
): Promise<CreateExploreItemResult> {
  const parsed = createExploreItemSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    const item = await createExploreItem(parsed.data);
    return { ok: true, data: mapItemToList(item) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to create explore item' };
  }
}

export async function updateExploreItemAction(
  itemId: string,
  body: UpdateExploreItemInput
): Promise<UpdateExploreItemResult> {
  if (!itemId) return { ok: false, error: 'Item ID required' };
  const parsed = updateExploreItemSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    const item = await updateExploreItem(itemId, parsed.data);
    if (!item) return { ok: false, error: 'Explore item not found' };
    return { ok: true, data: mapItemToList(item) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to update explore item' };
  }
}

export async function deleteExploreItemAction(itemId: string): Promise<DeleteExploreItemResult> {
  if (!itemId) return { ok: false, error: 'Item ID required' };
  try {
    const deleted = await deleteExploreItem(itemId);
    if (!deleted) return { ok: false, error: 'Explore item not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to delete explore item' };
  }
}

export type ExploreCategoryWithItems = {
  id: string;
  title: string;
  description: string | null;
  background_url: string | null;
  explore_items: Array<{
    id: string;
    title: string;
    description: string | null;
    city: string | null;
    country: string | null;
  }>;
};

export type GetExploreCategoriesWithItemsResult =
  | { ok: true; data: ExploreCategoryWithItems[] }
  | { ok: false; error: string };

export async function getExploreCategoriesWithItemsAction(): Promise<GetExploreCategoriesWithItemsResult> {
  try {
    const categories = await listAllExploreCategoriesWithItems();
    return { ok: true, data: toPlainValue(categories) as ExploreCategoryWithItems[] };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch categories' };
  }
}
