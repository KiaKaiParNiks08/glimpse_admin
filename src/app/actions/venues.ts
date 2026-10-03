'use server';

import {
  listVenuesQuerySchema,
  createVenueSchema,
  updateVenueSchema,
} from '@/lib/validations/venues';
import type {
  ListVenuesQuery,
  CreateVenueInput,
  UpdateVenueInput,
} from '@/lib/validations/venues';
import {
  listVenues,
  getVenueDetailsById,
  createVenue,
  updateVenue,
  deleteVenue,
} from '@/server/venues';

/** Convert Prisma Decimal, Date, etc. to plain JSON-serializable values for client. */
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

export type VenueListItem = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state_name: string | null;
  country: string | null;
  created_at: string | null;
};

export type GetVenuesResult =
  | {
      ok: true;
      data: VenueListItem[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    }
  | { ok: false; error: string };

export type VenueDetailsResult =
  | { ok: true; data: Awaited<ReturnType<typeof getVenueDetailsById>> }
  | { ok: false; error: string };

export type CreateVenueResult =
  | { ok: true; data: Awaited<ReturnType<typeof createVenue>> }
  | { ok: false; error: string };

export type UpdateVenueResult =
  | { ok: true; data: Awaited<ReturnType<typeof updateVenue>> }
  | { ok: false; error: string };

export type DeleteVenueResult = { ok: true } | { ok: false; error: string };

export async function getVenuesAction(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<GetVenuesResult> {
  const parsed = listVenuesQuerySchema.safeParse({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    search: params.search,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid parameters' };
  }

  try {
    const { venues, total } = await listVenues(parsed.data as ListVenuesQuery);
    const limit = parsed.data.limit;
    const list = venues.map((v) => ({
      ...v,
      created_at: v.created_at ? v.created_at.toISOString() : null,
    }));
    return {
      ok: true,
      data: list as VenueListItem[],
      meta: {
        total,
        page: parsed.data.page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch venues' };
  }
}

export async function getVenueByIdAction(venueId: string): Promise<VenueDetailsResult> {
  if (!venueId) return { ok: false, error: 'Venue ID required' };
  try {
    const venue = await getVenueDetailsById(venueId);
    if (!venue) return { ok: false, error: 'Venue not found' };
    return { ok: true, data: toPlainValue(venue) as Awaited<ReturnType<typeof getVenueDetailsById>> };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch venue' };
  }
}

export async function createVenueAction(body: CreateVenueInput): Promise<CreateVenueResult> {
  const parsed = createVenueSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const venue = await createVenue(parsed.data);
    return { ok: true, data: toPlainValue(venue) as Awaited<ReturnType<typeof createVenue>> };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to create venue' };
  }
}

export async function updateVenueAction(
  venueId: string,
  body: UpdateVenueInput
): Promise<UpdateVenueResult> {
  if (!venueId) return { ok: false, error: 'Venue ID required' };
  const parsed = updateVenueSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const venue = await updateVenue(venueId, parsed.data);
    if (!venue) return { ok: false, error: 'Venue not found' };
    return { ok: true, data: toPlainValue(venue) as Awaited<ReturnType<typeof updateVenue>> };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to update venue' };
  }
}

export async function deleteVenueAction(venueId: string): Promise<DeleteVenueResult> {
  if (!venueId) return { ok: false, error: 'Venue ID required' };
  try {
    const deleted = await deleteVenue(venueId);
    if (!deleted) return { ok: false, error: 'Venue not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to delete venue' };
  }
}
