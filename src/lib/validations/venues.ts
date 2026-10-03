import { z } from 'zod';
import { uuidSchema } from './common';

/** Path param for route segment: /api/venues/[venue_id] */
export const venueIdPathSchema = z.object({
  venue_id: uuidSchema,
});

/** Query params for GET /api/venues/[venue_id] (optional user_id to get assigned contact) */
export const getVenueDetailsQuerySchema = z.object({
  user_id: uuidSchema.optional(),
});

/** List venues query (pagination, search) */
export const listVenuesQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Accept URL or relative path (e.g. /uploads/...) for uploaded images */
const imageUrlSchema = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .refine(
    (val) => val === undefined || val === null || val === '' || val.startsWith('/') || val.startsWith('http'),
    { message: 'Must be a URL or path starting with / or http' }
  );

/** Nested: venue contact (create/update) */
export const venueContactSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().min(1).max(255),
  image_url: imageUrlSchema,
  phone_number: z.string().max(20).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  role: z.string().max(255).optional().nullable(),
  is_primary: z.boolean().optional().nullable(),
});

/** Nested: venue facility (create/update) */
export const venueFacilitySchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().min(1).max(255),
  image_url: imageUrlSchema,
});

/** Nested: venue photo (create/update) */
export const venuePhotoSchema = z.object({
  id: uuidSchema.optional(),
  image_url: z.string().min(1),
  alt_text: z.string().max(255).optional().nullable(),
  sort_order: z.number().int().min(0).optional().nullable(),
});

/** Nested: sub-venue (title + description only) */
export const venueSubVenueSchema = z.object({
  id: uuidSchema.optional(),
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional().nullable(),
});

/** Create venue body (with nested contacts, facilities, photos). Required: description, city, state_name, latitude, longitude, bg_image_url; at least 1 contact, 1 facility, 2 photos. */
export const createVenueSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().min(1),
  description: z.string().min(1, 'Description is required'),
  bg_image_url: z.string().min(1, 'Background image is required'),
  latitude: z.number(),
  longitude: z.number(),
  city: z.string().min(1).max(100),
  state_name: z.string().min(1).max(100),
  country: z.string().max(100).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  venue_contacts: z.array(venueContactSchema).min(1, 'At least one contact person is required'),
  venue_facilities: z.array(venueFacilitySchema).min(1, 'At least one facility is required'),
  venue_photos: z.array(venuePhotoSchema).min(2, 'At least two photos are required'),
  venue_subvenues: z.array(venueSubVenueSchema).optional(),
});

/** Update venue body (partial; nested arrays replace existing when provided) */
export const updateVenueSchema = createVenueSchema.partial();

export type ListVenuesQuery = z.infer<typeof listVenuesQuerySchema>;
export type VenueContactInput = z.infer<typeof venueContactSchema>;
export type VenueFacilityInput = z.infer<typeof venueFacilitySchema>;
export type VenuePhotoInput = z.infer<typeof venuePhotoSchema>;
export type VenueSubVenueInput = z.infer<typeof venueSubVenueSchema>;
export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
