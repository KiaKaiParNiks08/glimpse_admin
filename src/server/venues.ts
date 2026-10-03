import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import type { CreateVenueInput, ListVenuesQuery, UpdateVenueInput } from '@/lib/validations/venues';

const venueListSelect = {
  id: true,
  name: true,
  address: true,
  city: true,
  state_name: true,
  country: true,
  created_at: true,
} as const;

export type VenueListItem = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state_name: string | null;
  country: string | null;
  created_at: Date | null;
};

/**
 * List venues with optional search and pagination.
 */
export async function listVenues(
  query: ListVenuesQuery
): Promise<{ venues: VenueListItem[]; total: number }> {
  const { page, limit, search } = query;
  const skip = (page - 1) * limit;
  const where: Prisma.venuesWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { address: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
          { country: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [venues, total] = await Promise.all([
    prisma.venues.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
      select: venueListSelect,
    }),
    prisma.venues.count({ where }),
  ]);

  return { venues, total };
}

export type VenueWithSubvenuesSelectItem = {
  id: string;
  name: string;
  subvenues: { id: string; title: string }[];
};

/**
 * All venues for event session dropdowns (name order), including sub-venues per parent.
 */
export async function listVenuesWithSubvenuesForSelect(): Promise<VenueWithSubvenuesSelectItem[]> {
  const rows = await prisma.venues.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      venue_subvenues: {
        orderBy: { created_at: 'asc' },
        select: { id: true, title: true },
      },
    },
  });
  return rows.map((v) => ({
    id: v.id,
    name: v.name,
    subvenues: v.venue_subvenues,
  }));
}

/**
 * Create a venue with nested contacts, facilities, and photos.
 */
export async function createVenue(data: CreateVenueInput) {
  const { venue_contacts, venue_facilities, venue_photos, venue_subvenues, ...venueData } = data;
  const venue = await prisma.venues.create({
    data: {
      name: venueData.name,
      address: venueData.address,
      description: venueData.description ?? null,
      bg_image_url: venueData.bg_image_url ?? null,
      latitude: venueData.latitude ?? null,
      longitude: venueData.longitude ?? null,
      city: venueData.city ?? null,
      state_name: venueData.state_name ?? null,
      country: venueData.country ?? null,
      postal_code: venueData.postal_code ?? null,
      venue_contacts: venue_contacts?.length
        ? {
            create: venue_contacts.map((c) => ({
              name: c.name,
              image_url: c.image_url ?? null,
              phone_number: c.phone_number ?? null,
              email: c.email ?? null,
              role: c.role ?? null,
              is_primary: c.is_primary ?? null,
            })),
          }
        : undefined,
      venue_facilities: venue_facilities?.length
        ? {
            create: venue_facilities.map((f) => ({
              name: f.name,
              image_url: f.image_url ?? null,
            })),
          }
        : undefined,
      venue_photos: venue_photos?.length
        ? {
            create: venue_photos.map((p, i) => ({
              image_url: p.image_url,
              alt_text: p.alt_text ?? null,
              sort_order: p.sort_order ?? i,
            })),
          }
        : undefined,
      venue_subvenues: venue_subvenues?.length
        ? {
            create: venue_subvenues.map((s) => ({
              title: s.title,
              description: s.description ?? null,
            })),
          }
        : undefined,
    },
    select: {
      id: true,
      name: true,
      address: true,
      description: true,
      bg_image_url: true,
      latitude: true,
      longitude: true,
      city: true,
      state_name: true,
      country: true,
      postal_code: true,
      venue_contacts: { select: { id: true, name: true, image_url: true, phone_number: true, email: true, role: true, is_primary: true } },
      venue_facilities: { select: { id: true, name: true, image_url: true } },
      venue_photos: { orderBy: { sort_order: 'asc' }, select: { id: true, image_url: true, alt_text: true, sort_order: true } },
      venue_subvenues: { orderBy: { created_at: 'asc' }, select: { id: true, title: true, description: true } },
    },
  });
  return venue;
}

/**
 * Update a venue. When venue_contacts, venue_facilities, or venue_photos are provided,
 * they replace existing rows (delete missing, create new, update by id where present).
 */
export async function updateVenue(venue_id: string, data: UpdateVenueInput) {
  const existing = await prisma.venues.findUnique({
    where: { id: venue_id },
    select: { id: true },
  });
  if (!existing) return null;

  const { venue_contacts, venue_facilities, venue_photos, venue_subvenues, ...venueData } = data;

  if (venue_contacts !== undefined) {
    await prisma.venue_contacts.deleteMany({ where: { venue_id } });
    if (venue_contacts.length > 0) {
      await prisma.venue_contacts.createMany({
        data: venue_contacts.map((c) => ({
          venue_id,
          name: c.name,
          image_url: c.image_url ?? null,
          phone_number: c.phone_number ?? null,
          email: c.email ?? null,
          role: c.role ?? null,
          is_primary: c.is_primary ?? null,
        })),
      });
    }
  }

  if (venue_facilities !== undefined) {
    await prisma.venue_facilities.deleteMany({ where: { venue_id } });
    if (venue_facilities.length > 0) {
      await prisma.venue_facilities.createMany({
        data: venue_facilities.map((f) => ({
          venue_id,
          name: f.name,
          image_url: f.image_url ?? null,
        })),
      });
    }
  }

  if (venue_photos !== undefined) {
    await prisma.venue_photos.deleteMany({ where: { venue_id } });
    if (venue_photos.length > 0) {
      await prisma.venue_photos.createMany({
        data: venue_photos.map((p, i) => ({
          venue_id,
          image_url: p.image_url,
          alt_text: p.alt_text ?? null,
          sort_order: p.sort_order ?? i,
        })),
      });
    }
  }

  if (venue_subvenues !== undefined) {
    await prisma.venue_subvenues.deleteMany({ where: { venue_id } });
    if (venue_subvenues.length > 0) {
      await prisma.venue_subvenues.createMany({
        data: venue_subvenues.map((s) => ({
          venue_id,
          title: s.title,
          description: s.description ?? null,
        })),
      });
    }
  }

  const updatePayload: Prisma.venuesUpdateInput = {};
  if (venueData.name !== undefined) updatePayload.name = venueData.name;
  if (venueData.address !== undefined) updatePayload.address = venueData.address;
  if (venueData.description !== undefined) updatePayload.description = venueData.description ?? null;
  if (venueData.bg_image_url !== undefined) updatePayload.bg_image_url = venueData.bg_image_url ?? null;
  if (venueData.latitude !== undefined) updatePayload.latitude = venueData.latitude ?? null;
  if (venueData.longitude !== undefined) updatePayload.longitude = venueData.longitude ?? null;
  if (venueData.city !== undefined) updatePayload.city = venueData.city ?? null;
  if (venueData.state_name !== undefined) updatePayload.state_name = venueData.state_name ?? null;
  if (venueData.country !== undefined) updatePayload.country = venueData.country ?? null;
  if (venueData.postal_code !== undefined) updatePayload.postal_code = venueData.postal_code ?? null;

  const venue = await prisma.venues.update({
    where: { id: venue_id },
    data: updatePayload,
    select: {
      id: true,
      name: true,
      address: true,
      description: true,
      bg_image_url: true,
      latitude: true,
      longitude: true,
      city: true,
      state_name: true,
      country: true,
      postal_code: true,
      venue_contacts: { select: { id: true, name: true, image_url: true, phone_number: true, email: true, role: true, is_primary: true } },
      venue_facilities: { select: { id: true, name: true, image_url: true } },
      venue_photos: { orderBy: { sort_order: 'asc' }, select: { id: true, image_url: true, alt_text: true, sort_order: true } },
      venue_subvenues: { orderBy: { created_at: 'asc' }, select: { id: true, title: true, description: true } },
    },
  });
  return venue;
}

/**
 * Delete a venue by id. Cascades to venue_contacts, venue_facilities, venue_photos, venue_subvenues.
 * Returns true if deleted, false if not found.
 */
export async function deleteVenue(venue_id: string): Promise<boolean> {
  try {
    await prisma.venues.delete({ where: { id: venue_id } });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return false;
    throw e;
  }
}

/**
 * Get the venue contact id for an event's main venue (e.g. for linking event_guest).
 * Returns primary contact id if set, otherwise the first contact id, or null if no venue/contacts.
 */
export async function getVenueContactForEvent(
  venue_id: string | null
): Promise<string | null> {
  if (!venue_id) return null;
  const contact = await prisma.venue_contacts.findFirst({
    where: { venue_id },
    orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
    select: { id: true },
  });
  return contact?.id ?? null;
}

/**
 * Get the venue contact assigned to a user via event_guests for this venue.
 * Returns null if no event_guest links this user to a contact at this venue.
 */
export async function getVenueContactForUser(
  venue_id: string,
  user_id: string
) {
  const guest = await prisma.event_guests.findFirst({
    where: {
      user_id,
      venue_contact_id: { not: null },
      venue_contacts: { venue_id },
    },
    select: {
      venue_contacts: {
        select: {
          id: true,
          name: true,
          image_url: true,
          phone_number: true,
          email: true,
          role: true,
          is_primary: true,
        },
      },
    },
  });
  return guest?.venue_contacts ?? null;
}

/**
 * Get full venue details by venue id.
 * Includes contacts, facilities, and photos. Returns null if not found.
 */
export async function getVenueDetailsById(venue_id: string) {
  const venue = await prisma.venues.findUnique({
    where: { id: venue_id },
    select: {
      id: true,
      name: true,
      address: true,
      description: true,
      bg_image_url: true,
      latitude: true,
      longitude: true,
      city: true,
      state_name: true,
      country: true,
      postal_code: true,
      venue_contacts: {
        select: {
          id: true,
          name: true,
          image_url: true,
          phone_number: true,
          email: true,
          role: true,
          is_primary: true,
        },
      },
      venue_facilities: {
        select: {
          id: true,
          name: true,
          image_url: true,
        },
      },
      venue_photos: {
        orderBy: { sort_order: 'asc' },
        select: {
          id: true,
          image_url: true,
          alt_text: true,
          sort_order: true,
        },
      },
      venue_subvenues: {
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
        },
      },
    },
  });
  return venue;
}
