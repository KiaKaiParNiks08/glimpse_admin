/**
 * Shape used by VenueForm for initial data and submit payload.
 * Reusable across create/edit and any screen (modal, page, etc.).
 */

export interface VenueContactFormItem {
  id?: string;
  name: string;
  image_url?: string | null;
  phone_number?: string | null;
  email?: string | null;
  role?: string | null;
  is_primary?: boolean | null;
}

export interface VenueFacilityFormItem {
  id?: string;
  name: string;
  image_url?: string | null;
}

export interface VenuePhotoFormItem {
  id?: string;
  image_url: string;
  alt_text?: string | null;
  sort_order?: number | null;
}

export interface VenueSubVenueFormItem {
  id?: string;
  title: string;
  description: string;
}

export interface VenueFormValues {
  name: string;
  address: string;
  description: string;
  city: string;
  state_name: string;
  country: string;
  postal_code: string;
  latitude: string;
  longitude: string;
  bg_image_url: string;
  venue_contacts: VenueContactFormItem[];
  venue_facilities: VenueFacilityFormItem[];
  venue_photos: VenuePhotoFormItem[];
  venue_subvenues: VenueSubVenueFormItem[];
}

export function emptyVenueFormValues(): VenueFormValues {
  return {
    name: '',
    address: '',
    description: '',
    city: '',
    state_name: '',
    country: '',
    postal_code: '',
    latitude: '',
    longitude: '',
    bg_image_url: '',
    venue_contacts: [],
    venue_facilities: [],
    venue_photos: [],
    venue_subvenues: [],
  };
}

/** Initial values for create mode with minimum required: 1 contact, 1 facility, 2 photos. */
export function createModeInitialValues(): VenueFormValues {
  return {
    ...emptyVenueFormValues(),
    venue_contacts: [{ name: '', is_primary: false }],
    venue_facilities: [{ name: '' }],
    venue_photos: [
      { image_url: '', sort_order: 0 },
      { image_url: '', sort_order: 1 },
    ],
  };
}

export function venueToFormValues(venue: {
  name: string;
  address: string;
  description?: string | null;
  city?: string | null;
  state_name?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  bg_image_url?: string | null;
  venue_contacts: Array<{
    id: string;
    name: string;
    image_url?: string | null;
    phone_number?: string | null;
    email?: string | null;
    role?: string | null;
    is_primary?: boolean | null;
  }>;
  venue_facilities: Array<{ id: string; name: string; image_url?: string | null }>;
  venue_photos: Array<{
    id: string;
    image_url: string;
    alt_text?: string | null;
    sort_order?: number | null;
  }>;
  venue_subvenues?: Array<{ id: string; title: string; description?: string | null }>;
}): VenueFormValues {
  return {
    name: venue.name,
    address: venue.address,
    description: venue.description ?? '',
    city: venue.city ?? '',
    state_name: venue.state_name ?? '',
    country: venue.country ?? '',
    postal_code: venue.postal_code ?? '',
    latitude: venue.latitude != null ? String(venue.latitude) : '',
    longitude: venue.longitude != null ? String(venue.longitude) : '',
    bg_image_url: venue.bg_image_url ?? '',
    venue_contacts: venue.venue_contacts.map((c) => ({
      id: c.id,
      name: c.name,
      image_url: c.image_url ?? null,
      phone_number: c.phone_number ?? null,
      email: c.email ?? null,
      role: c.role ?? null,
      is_primary: c.is_primary ?? null,
    })),
    venue_facilities: venue.venue_facilities.map((f) => ({
      id: f.id,
      name: f.name,
      image_url: f.image_url ?? null,
    })),
    venue_photos: venue.venue_photos.map((p) => ({
      id: p.id,
      image_url: p.image_url,
      alt_text: p.alt_text ?? null,
      sort_order: p.sort_order ?? null,
    })),
    venue_subvenues: (venue.venue_subvenues ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? '',
    })),
  };
}

/** Build API payload from form values (create or update). */
export function formValuesToApiPayload(values: VenueFormValues) {
  return {
    name: values.name.trim(),
    address: values.address.trim(),
    description: values.description.trim() || null,
    city: values.city.trim() || null,
    state_name: values.state_name.trim() || null,
    country: values.country.trim() || null,
    postal_code: values.postal_code.trim() || null,
    latitude: values.latitude.trim() ? Number(values.latitude) : null,
    longitude: values.longitude.trim() ? Number(values.longitude) : null,
    bg_image_url: values.bg_image_url.trim() || null,
    venue_contacts: values.venue_contacts
      .filter((c) => c.name.trim() && (c.phone_number ?? '').trim())
      .map((c) => ({
        name: c.name.trim(),
        image_url: c.image_url?.trim() || null,
        phone_number: c.phone_number?.trim() || null,
        email: c.email?.trim() || null,
        role: c.role?.trim() || null,
        is_primary: c.is_primary ?? null,
      })),
    venue_facilities: values.venue_facilities
      .filter((f) => f.name.trim())
      .map((f) => ({
        name: f.name.trim(),
        image_url: f.image_url?.trim() || null,
      })),
    venue_photos: values.venue_photos
      .filter((p) => p.image_url.trim())
      .map((p, i) => ({
        image_url: p.image_url.trim(),
        alt_text: p.alt_text?.trim() || null,
        sort_order: p.sort_order ?? i,
      })),
    venue_subvenues: values.venue_subvenues
      .filter((s) => s.title.trim())
      .map((s) => ({
        title: s.title.trim(),
        description: s.description.trim() || null,
      })),
  };
}
