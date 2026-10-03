import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import { isCorporateCategory } from '@/lib/event-categories';
import type {
  ListEventsQuery,
  CreateEventInput,
  UpdateEventInput,
} from '@/lib/validations/events';

const EVENT_ADMIN_ROLE_NAME = 'event_admin' as const;
let weddingFieldsSupported: boolean | null = null;

function isUnknownWeddingFieldError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /(Unknown argument|Unknown field)/i.test(message) &&
    /(groom_name|bride_name|greetings_text)/i.test(message)
  );
}

async function fetchWeddingFieldsViaSql(eventId: string): Promise<{
  groom_name: string | null;
  bride_name: string | null;
  greetings_text: string | null;
}> {
  try {
    const rows = await prisma.$queryRaw<
      { groom_name: string | null; bride_name: string | null; greetings_text: string | null }[]
    >`
      SELECT groom_name, bride_name, greetings_text
      FROM events
      WHERE id = ${eventId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { groom_name: null, bride_name: null, greetings_text: null };
    return {
      groom_name: row.groom_name ?? null,
      bride_name: row.bride_name ?? null,
      greetings_text: row.greetings_text ?? null,
    };
  } catch {
    // Column may not exist yet on some DBs; keep response shape stable.
    return { groom_name: null, bride_name: null, greetings_text: null };
  }
}

const eventListSelect = {
  id: true,
  title: true,
  slug: true,
  event_code: true,
  start_date: true,
  end_date: true,
  status: true,
  cover_image: true,
  e_invite_pdf_url: true,
  post_event_pdf_url: true,
  created_at: true,
  category_id: true,
  main_venue_id: true,
  event_categories: {
    select: { id: true, name: true, slug: true },
  },
  venues: {
    select: { id: true, name: true },
  },
} as const;

export type EventListItem = {
  id: string;
  title: string;
  slug: string;
  event_code: string;
  start_date: Date;
  end_date: Date;
  status: string;
  cover_image: string | null;
  e_invite_pdf_url: string | null;
  post_event_pdf_url: string | null;
  created_at: Date | null;
  category_id: string;
  main_venue_id: string | null;
  event_categories: { id: string; name: string; slug: string };
  venues: { id: string; name: string } | null;
};

/**
 * List events with optional search, status filter, category filter, and pagination.
 */
export async function listEvents(
  query: ListEventsQuery,
  options?: { viewer_user_id?: string }
): Promise<{ events: EventListItem[]; total: number }> {
  const { page, limit, search, status, category_id } = query;
  const skip = (page - 1) * limit;
  const where: Prisma.eventsWhereInput = {};

  if (search?.trim()) {
    where.OR = [
      { title: { contains: search.trim(), mode: 'insensitive' } },
      { slug: { contains: search.trim(), mode: 'insensitive' } },
      { event_code: { contains: search.trim(), mode: 'insensitive' } },
    ];
  }
  if (status?.trim()) where.status = status.trim();
  if (category_id) where.category_id = category_id;
  if (options?.viewer_user_id) {
    where.event_admins = { some: { user_id: options.viewer_user_id } };
  }

  const [events, total] = await Promise.all([
    prisma.events.findMany({
      where,
      orderBy: [{ start_date: 'desc' }, { created_at: 'desc' }],
      skip,
      take: limit,
      select: eventListSelect,
    }),
    prisma.events.count({ where }),
  ]);

  return { events, total };
}

/**
 * True if the given user is assigned as an event admin for the event.
 */
export async function isEventAdminAssigned(eventId: string, userId: string): Promise<boolean> {
  const row = await prisma.event_admins.findFirst({
    where: { event_id: eventId, user_id: userId },
    select: { id: true },
  });
  return row != null;
}

/**
 * Get a single event by id with category and main venue.
 */
export async function getEventById(eventId: string) {
  const baseSelect = {
    id: true,
    category_id: true,
    title: true,
    slug: true,
    event_code: true,
    description: true,
    theme: true,
    app_theme_id: true,
    app_themes: {
      select: {
        id: true,
        name: true,
        primary_color: true,
        secondary_color: true,
        button_primary_color: true,
        button_secondary_color: true,
      },
    },
    cover_image: true,
    event_cover_images: {
      select: { id: true, image_url: true, display_order: true },
      orderBy: [{ display_order: 'asc' as const }, { created_at: 'asc' as const }],
    },
    e_invite_pdf_url: true,
    linkedin_url: true,
    post_event_pdf_url: true,
    post_event_pdf_original_name: true,
    post_event_pdf_size: true,
    post_event_pdf_uploaded_by: true,
    post_event_pdf_uploaded_at: true,
    watermark_url: true,
    watermark_position: true,
    watermark_opacity: true,
    watermark_size: true,
    current_happening_title: true,
    current_happening_show_pre_event: true,
    current_happening_show_ongoing_event: true,
    current_happening_show_post_event: true,
    post_event_pdf_title: true,
    post_event_pdf_show_pre_event: true,
    post_event_pdf_show_ongoing_event: true,
    post_event_pdf_show_post_event: true,
    start_date: true,
    end_date: true,
    main_venue_id: true,
    status: true,
    created_by: true,
    created_at: true,
    updated_at: true,
    event_categories: {
      select: { id: true, name: true, slug: true },
    },
    venues: {
      select: { id: true, name: true, address: true, city: true, country: true },
    },
    event_organizers: {
      select: {
        id: true,
        name: true,
        logo_url: true,
        contact_email: true,
        contact_phone: true,
        website_url: true,
      },
      orderBy: { created_at: 'asc' as const },
    },
  };

  if (weddingFieldsSupported !== false) {
    try {
      const withWeddingFields = await prisma.events.findUnique({
        where: { id: eventId },
        select: {
          ...baseSelect,
          groom_name: true,
          bride_name: true,
          greetings_text: true,
        },
      });
      weddingFieldsSupported = true;
      return withWeddingFields;
    } catch (error) {
      if (!isUnknownWeddingFieldError(error)) throw error;
      weddingFieldsSupported = false;
    }
  }

  const fallback = await prisma.events.findUnique({
    where: { id: eventId },
    select: baseSelect,
  });
  if (!fallback) return null;
  const weddingFields = await fetchWeddingFieldsViaSql(eventId);
  return { ...fallback, ...weddingFields };
}

/**
 * Get full event details by id. Alias for getEventById for API route.
 */
export const getEventDetailsById = getEventById;

/**
 * Get an event by event_code (e.g. for auth/check-in flow).
 */
export async function getEventByCode(eventCode: string) {
  const event = await prisma.events.findUnique({
    where: { event_code: eventCode },
    select: { id: true, main_venue_id: true },
  });
  return event;
}

/**
 * Return true if an event exists with the given id.
 */
export async function eventExists(eventId: string): Promise<boolean> {
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  return event != null;
}

/**
 * Error message when the (resulting) event is a corporate event without a LinkedIn URL, else null.
 * For updates, fields not in `data` fall back to the saved event.
 */
export async function getCorporateLinkedInError(
  data: { category_id?: string; linkedin_url?: string | null },
  eventId?: string
): Promise<string | null> {
  const existing = eventId
    ? await prisma.events.findUnique({ where: { id: eventId }, select: { category_id: true, linkedin_url: true } })
    : null;
  const categoryId = data.category_id ?? existing?.category_id;
  if (!categoryId) return null;
  const category = await prisma.event_categories.findUnique({
    where: { id: categoryId },
    select: { slug: true, name: true },
  });
  if (!isCorporateCategory(category)) return null;
  const linkedin = data.linkedin_url !== undefined ? data.linkedin_url : existing?.linkedin_url;
  return linkedin?.trim() ? null : 'LinkedIn URL is required for corporate events';
}

/**
 * Ordered cover image URLs to save, or undefined when the request does not touch cover images.
 * `cover_images` wins; a lone `cover_image` is treated as a single-image list.
 */
function resolveCoverImages(
  coverImages: string[] | undefined,
  coverImage: string | null | undefined
): string[] | undefined {
  if (coverImages !== undefined) return coverImages.map((u) => u.trim()).filter(Boolean);
  if (coverImage !== undefined) return coverImage?.trim() ? [coverImage.trim()] : [];
  return undefined;
}

function coverImageRows(urls: string[]) {
  return urls.map((image_url, display_order) => ({ image_url, display_order }));
}

/**
 * Create an event.
 */
export async function createEvent(data: CreateEventInput) {
  const organizerName =
    typeof data.organizer_name === 'string' && data.organizer_name.trim()
      ? data.organizer_name.trim()
      : null;
  const organizerLogo =
    typeof data.organizer_logo_url === 'string' && data.organizer_logo_url.trim()
      ? data.organizer_logo_url.trim()
      : null;
  const organizerEmail =
    typeof data.organizer_contact_email === 'string' && data.organizer_contact_email.trim()
      ? data.organizer_contact_email.trim()
      : null;
  const organizerPhone =
    typeof data.organizer_contact_phone === 'string' && data.organizer_contact_phone.trim()
      ? data.organizer_contact_phone.trim()
      : null;
  const organizerWebsite =
    typeof data.organizer_website_url === 'string' && data.organizer_website_url.trim()
      ? data.organizer_website_url.trim()
      : null;

  let themeLabel: string | null = null;
  if (data.app_theme_id) {
    const t = await prisma.app_themes.findUnique({
      where: { id: data.app_theme_id },
      select: { name: true },
    });
    themeLabel = t?.name ?? null;
  }

  const coverImages = resolveCoverImages(data.cover_images, data.cover_image) ?? [];

  const createData = {
    category_id: data.category_id,
    title: data.title,
    slug: data.slug,
    event_code: data.event_code,
    description: data.description ?? null,
    theme: themeLabel,
    app_theme_id: data.app_theme_id ?? null,
    cover_image: coverImages[0] ?? null,
    ...(coverImages.length > 0 && {
      event_cover_images: { create: coverImageRows(coverImages) },
    }),
    e_invite_pdf_url: data.e_invite_pdf_url ?? null,
    groom_name:
      typeof data.groom_name === 'string' && data.groom_name.trim()
        ? data.groom_name.trim()
        : null,
    bride_name:
      typeof data.bride_name === 'string' && data.bride_name.trim()
        ? data.bride_name.trim()
        : null,
    greetings_text:
      typeof data.greetings_text === 'string' && data.greetings_text.trim()
        ? data.greetings_text.trim()
        : null,
    linkedin_url: data.linkedin_url?.trim() || null,
    start_date: new Date(data.start_date),
    end_date: new Date(data.end_date),
    main_venue_id: data.main_venue_id ?? null,
    status: data.status ?? 'draft',
    created_by: data.created_by,
    ...(organizerName
      ? {
          event_organizers: {
            create: {
              name: organizerName,
              logo_url: organizerLogo,
              contact_email: organizerEmail,
              contact_phone: organizerPhone,
              website_url: organizerWebsite,
              created_by: data.created_by,
            },
          },
        }
      : {}),
  };
  const createSelect = {
    id: true,
    title: true,
    slug: true,
    event_code: true,
    start_date: true,
    end_date: true,
    status: true,
    created_at: true,
  };
  let event;
  if (weddingFieldsSupported !== false) {
    try {
      event = await prisma.events.create({ data: createData, select: createSelect });
      weddingFieldsSupported = true;
      return event;
    } catch (error) {
      if (!isUnknownWeddingFieldError(error)) throw error;
      weddingFieldsSupported = false;
    }
  }
  const { groom_name: _groomName, bride_name: _brideName, greetings_text: _greetingsText, ...fallbackData } =
    createData;
  event = await prisma.events.create({ data: fallbackData, select: createSelect });
  return event;
}

/**
 * Update an event by id.
 */
export async function updateEvent(eventId: string, data: UpdateEventInput) {
  const existing = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!existing) return null;

  const updatePayload: Prisma.eventsUpdateInput = {};
  if (data.category_id !== undefined) updatePayload.event_categories = { connect: { id: data.category_id } };
  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.slug !== undefined) updatePayload.slug = data.slug;
  if (data.event_code !== undefined) updatePayload.event_code = data.event_code;
  if (data.description !== undefined) updatePayload.description = data.description ?? null;
  if (data.app_theme_id !== undefined) {
    if (data.app_theme_id) {
      const t = await prisma.app_themes.findUnique({
        where: { id: data.app_theme_id },
        select: { name: true },
      });
      updatePayload.theme = t?.name ?? null;
      updatePayload.app_themes = { connect: { id: data.app_theme_id } };
    } else {
      updatePayload.theme = null;
      updatePayload.app_themes = { disconnect: true };
    }
  }
  const coverImages = resolveCoverImages(data.cover_images, data.cover_image);
  if (coverImages) {
    updatePayload.cover_image = coverImages[0] ?? null;
    updatePayload.event_cover_images = { deleteMany: {}, create: coverImageRows(coverImages) };
  }
  if (data.e_invite_pdf_url !== undefined)
    updatePayload.e_invite_pdf_url = data.e_invite_pdf_url ?? null;
  if (data.linkedin_url !== undefined) updatePayload.linkedin_url = data.linkedin_url?.trim() || null;
  const weddingUpdatePayload: Prisma.eventsUpdateInput = {};
  if (data.groom_name !== undefined)
    weddingUpdatePayload.groom_name =
      typeof data.groom_name === 'string' && data.groom_name.trim()
        ? data.groom_name.trim()
        : null;
  if (data.bride_name !== undefined)
    weddingUpdatePayload.bride_name =
      typeof data.bride_name === 'string' && data.bride_name.trim()
        ? data.bride_name.trim()
        : null;
  if (data.greetings_text !== undefined)
    weddingUpdatePayload.greetings_text =
      typeof data.greetings_text === 'string' && data.greetings_text.trim()
        ? data.greetings_text.trim()
        : null;
  Object.assign(updatePayload, weddingUpdatePayload);
  if (data.start_date !== undefined) updatePayload.start_date = new Date(data.start_date);
  if (data.end_date !== undefined) updatePayload.end_date = new Date(data.end_date);
  if (data.main_venue_id !== undefined) updatePayload.venues = data.main_venue_id ? { connect: { id: data.main_venue_id } } : { disconnect: true };
  if (data.status !== undefined) updatePayload.status = data.status;

  const organizerFieldsTouched =
    data.organizer_name !== undefined ||
    data.organizer_logo_url !== undefined ||
    data.organizer_contact_email !== undefined ||
    data.organizer_contact_phone !== undefined ||
    data.organizer_website_url !== undefined;

  if (organizerFieldsTouched) {
    const organizerName =
      typeof data.organizer_name === 'string' && data.organizer_name.trim()
        ? data.organizer_name.trim()
        : null;
    const organizerLogo =
      typeof data.organizer_logo_url === 'string' && data.organizer_logo_url.trim()
        ? data.organizer_logo_url.trim()
        : null;
    const organizerEmail =
      typeof data.organizer_contact_email === 'string' && data.organizer_contact_email.trim()
        ? data.organizer_contact_email.trim()
        : null;
    const organizerPhone =
      typeof data.organizer_contact_phone === 'string' && data.organizer_contact_phone.trim()
        ? data.organizer_contact_phone.trim()
        : null;
    const organizerWebsite =
      typeof data.organizer_website_url === 'string' && data.organizer_website_url.trim()
        ? data.organizer_website_url.trim()
        : null;

    updatePayload.event_organizers = organizerName
      ? {
          deleteMany: {},
          create: {
            name: organizerName,
            logo_url: organizerLogo,
            contact_email: organizerEmail,
            contact_phone: organizerPhone,
            website_url: organizerWebsite,
          },
        }
      : { deleteMany: {} };
  }

  const updateSelect = {
    id: true,
    title: true,
    slug: true,
    event_code: true,
    start_date: true,
    end_date: true,
    status: true,
    updated_at: true,
  };
  let event;
  if (weddingFieldsSupported !== false) {
    try {
      event = await prisma.events.update({
        where: { id: eventId },
        data: updatePayload,
        select: updateSelect,
      });
      weddingFieldsSupported = true;
      return event;
    } catch (error) {
      if (!isUnknownWeddingFieldError(error)) throw error;
      weddingFieldsSupported = false;
    }
  }
  const { groom_name: _groomName, bride_name: _brideName, greetings_text: _greetingsText, ...fallbackUpdatePayload } =
    updatePayload;
  event = await prisma.events.update({
    where: { id: eventId },
    data: fallbackUpdatePayload,
    select: updateSelect,
  });
  return event;
}

/**
 * Delete an event by id. Cascades to event_days, event_highlights, etc.
 */
export async function deleteEvent(eventId: string): Promise<boolean> {
  try {
    await prisma.events.delete({ where: { id: eventId } });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'P2025') return false;
    throw e;
  }
}

/**
 * Save the gallery watermark settings of an event. Returns false when the event does not exist.
 */
export async function setEventWatermark(
  eventId: string,
  data: { watermark_url: string | null; watermark_position: string; watermark_opacity: number; watermark_size: number }
): Promise<boolean> {
  const result = await prisma.events.updateMany({
    where: { id: eventId },
    data: { ...data, updated_at: new Date() },
  });
  return result.count > 0;
}

type SectionSettings = {
  title?: string | null;
  show_pre_event: boolean;
  show_ongoing_event: boolean;
  show_post_event: boolean;
};

/** Current Happening section title (blank = default title in the app) and the phases it is shown in. */
export async function setCurrentHappeningSettings(eventId: string, data: SectionSettings): Promise<boolean> {
  const result = await prisma.events.updateMany({
    where: { id: eventId },
    data: {
      current_happening_title: data.title?.trim() || null,
      current_happening_show_pre_event: data.show_pre_event,
      current_happening_show_ongoing_event: data.show_ongoing_event,
      current_happening_show_post_event: data.show_post_event,
      updated_at: new Date(),
    },
  });
  return result.count > 0;
}

/** Post-event report (PDF) title (blank = default title in the app) and the phases it is shown in. */
export async function setPostEventReportSettings(eventId: string, data: SectionSettings): Promise<boolean> {
  const result = await prisma.events.updateMany({
    where: { id: eventId },
    data: {
      post_event_pdf_title: data.title?.trim() || null,
      post_event_pdf_show_pre_event: data.show_pre_event,
      post_event_pdf_show_ongoing_event: data.show_ongoing_event,
      post_event_pdf_show_post_event: data.show_post_event,
      updated_at: new Date(),
    },
  });
  return result.count > 0;
}

/**
 * List active event categories for dropdowns.
 */
export async function listEventCategoriesForSelect() {
  return prisma.event_categories.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  });
}

/** Session input for creating event days with sessions */
export type EventSessionInput = {
  /** Existing session id (from the loaded days); when set the session is updated in place */
  id?: string | null;
  title: string;
  description?: string;
  start_time?: string | null; // "HH:mm" or "HH:mm:ss"
  end_time?: string | null;
  venue_id?: string | null;
  venue_subvenue_id?: string | null;
  event_organizer_id?: string | null;
  session_theme?: string | null;
  offering_master_ids?: string[];
  event_session_bg_url?: string | null;
};

/**
 * Add another organizer row for an event (e.g. from Days & sessions step).
 */
export async function createEventOrganizerForEvent(
  eventId: string,
  data: {
    name: string;
    logo_url?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    website_url?: string | null;
  },
  createdByUserId: string | null
) {
  return prisma.event_organizers.create({
    data: {
      event_id: eventId,
      name: data.name,
      logo_url: data.logo_url ?? null,
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      website_url: data.website_url ?? null,
      created_by: createdByUserId,
    },
    select: { id: true, name: true },
  });
}

/**
 * Create a global offering tag (shared catalog).
 */
export async function createEventOfferingMasterRow(data: {
  title: string;
  description?: string | null;
  createdByUserId: string | null;
}) {
  return prisma.event_offering_master.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      created_by: data.createdByUserId,
    },
    select: { id: true, title: true },
  });
}

/**
 * Organizers for the event (session organizer dropdown).
 */
export async function listEventOrganizersForSelect(eventId: string) {
  return prisma.event_organizers.findMany({
    where: { event_id: eventId },
    orderBy: { created_at: 'asc' },
    select: { id: true, name: true },
  });
}

/**
 * Global offering tags for session multi-select.
 */
export async function listOfferingMastersForSelect() {
  return prisma.event_offering_master.findMany({
    orderBy: { title: 'asc' },
    select: { id: true, title: true },
  });
}

/** Day input: date (YYYY-MM-DD), optional title, sessions */
export type EventDayInput = {
  date: string;
  title?: string | null;
  sessions: EventSessionInput[];
};

/**
 * Save event days and their sessions (same event_id only), in a transaction.
 * Days are matched by date and sessions by id (or by title within the day when no id is sent), and are
 * updated in place so session ids and the gallery media linked to them survive a save. Sessions missing
 * from the payload are deleted (their media stays on the day with no session). Days missing from the
 * payload are deleted unless they still have media; then only their sessions are removed.
 * At least one day must have at least one session (caller should validate).
 */
export async function upsertEventDaysWithSessions(
  eventId: string,
  startDate: string,
  endDate: string,
  days: EventDayInput[]
) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    throw new Error('Invalid date range');
  }

  await prisma.$transaction(async (tx) => {
    const existingDays = await tx.event_days.findMany({
      where: { event_id: eventId },
      select: {
        id: true,
        date: true,
        event_sessions: { select: { id: true, title: true } },
        _count: { select: { event_day_media: true } },
      },
    });
    const existingDayByDate = new Map(existingDays.map((d) => [d.date.toISOString().slice(0, 10), d]));
    const keptDayIds = new Set<string>();

    for (const day of days) {
      const dayDate = new Date(day.date);
      if (isNaN(dayDate.getTime())) continue;

      const existingDay = existingDayByDate.get(dayDate.toISOString().slice(0, 10));
      const dayRow = existingDay
        ? await tx.event_days.update({
            where: { id: existingDay.id },
            data: { title: day.title ?? null, updated_at: new Date() },
            select: { id: true },
          })
        : await tx.event_days.create({
            data: { event_id: eventId, title: day.title ?? null, date: dayDate },
            select: { id: true },
          });
      keptDayIds.add(dayRow.id);

      const sessions = (day.sessions ?? []).filter((s) => s.title?.trim());
      const existingSessions = existingDay?.event_sessions ?? [];
      const existingById = new Map(existingSessions.map((s) => [s.id, s]));
      const sentIds = new Set(sessions.map((s) => s.id).filter((id): id is string => !!id));
      const matchedIds = new Set<string>();
      const targets = sessions.map((s) => {
        let match = s.id ? existingById.get(s.id) : undefined;
        if (!match) {
          match = existingSessions.find(
            (e) => e.title === s.title.trim() && !sentIds.has(e.id) && !matchedIds.has(e.id)
          );
        }
        if (match) matchedIds.add(match.id);
        return { s, existingId: match?.id ?? null };
      });

      const removedIds = existingSessions.filter((e) => !matchedIds.has(e.id)).map((e) => e.id);
      if (removedIds.length > 0) {
        await tx.event_sessions.deleteMany({ where: { id: { in: removedIds } } });
      }

      for (const { s, existingId } of targets) {
        const startTime = s.start_time ? parseTimeToDate(s.start_time) : null;
        const endTime = s.end_time ? parseTimeToDate(s.end_time) : null;
        let venueId = s.venue_id ?? null;
        let subvenueId: string | null = s.venue_subvenue_id ?? null;

        if (subvenueId) {
          try {
            const sub = await tx.venue_subvenues.findUnique({
              where: { id: subvenueId },
              select: { venue_id: true },
            });
            if (sub) venueId = sub.venue_id;
            else subvenueId = null;
          } catch {
            subvenueId = null;
          }
        }

        let validatedOrganizerId: string | null = null;
        if (s.event_organizer_id) {
          const org = await tx.event_organizers.findFirst({
            where: { id: s.event_organizer_id, event_id: eventId },
            select: { id: true },
          });
          if (org) validatedOrganizerId = org.id;
        }

        const themeTrimmed =
          typeof s.session_theme === 'string' && s.session_theme.trim()
            ? s.session_theme.trim().slice(0, 200)
            : null;

        const offeringIds = Array.isArray(s.offering_master_ids) ? s.offering_master_ids : [];
        let validOfferingIds: string[] = [];
        if (offeringIds.length > 0) {
          const masters = await tx.event_offering_master.findMany({
            where: { id: { in: offeringIds } },
            select: { id: true },
          });
          validOfferingIds = masters.map((m) => m.id);
        }

        const sessionExtras = {
          event_organizer_id: validatedOrganizerId,
          session_theme: themeTrimmed,
        };

        const bgUrl =
          typeof s.event_session_bg_url === 'string' && s.event_session_bg_url.trim()
            ? s.event_session_bg_url.trim()
            : null;

        const baseData = {
          event_day_id: dayRow.id,
          title: s.title.trim(),
          description: (s.description ?? '').trim(),
          start_time: startTime,
          end_time: endTime,
          venue_id: venueId,
          venue_subvenue_id: subvenueId,
          event_session_bg_url: bgUrl,
          ...sessionExtras,
        };

        let sessionId: string;
        if (existingId) {
          await tx.event_sessions.update({
            where: { id: existingId },
            data: { ...baseData, updated_at: new Date() },
          });
          await tx.event_session_offerings.deleteMany({ where: { event_session_id: existingId } });
          sessionId = existingId;
        } else {
          const row = await tx.event_sessions.create({
            data: { ...baseData, status: 'upcoming' },
            select: { id: true },
          });
          sessionId = row.id;
        }

        if (validOfferingIds.length > 0) {
          await tx.event_session_offerings.createMany({
            data: validOfferingIds.map((offering_master_id) => ({
              event_session_id: sessionId,
              offering_master_id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    const staleDays = existingDays.filter((d) => !keptDayIds.has(d.id));
    const staleEmptyDayIds = staleDays.filter((d) => d._count.event_day_media === 0).map((d) => d.id);
    const staleMediaDayIds = staleDays.filter((d) => d._count.event_day_media > 0).map((d) => d.id);
    if (staleEmptyDayIds.length > 0) {
      await tx.event_days.deleteMany({ where: { id: { in: staleEmptyDayIds } } });
    }
    if (staleMediaDayIds.length > 0) {
      await tx.event_sessions.deleteMany({ where: { event_day_id: { in: staleMediaDayIds } } });
    }
  });
}

function parseTimeToDate(timeStr: string): Date {
  const parts = timeStr.trim().split(/[:\s]/);
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  const s = parseInt(parts[2] ?? '0', 10);
  // UTC so the stored TIME matches formatSessionTimeToHHmm (which reads UTC) regardless of server timezone.
  return new Date(Date.UTC(1970, 0, 1, h, m, s, 0));
}

/**
 * PostgreSQL TIME → Prisma `Date` uses the clock time on the UTC epoch day.
 * Use UTC getters so we do not shift by the Node/server timezone (e.g. IST +5:30).
 */
function dateTimeFieldToHHmm(d: Date): string {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format session time for JSON APIs as 24-hour clock "HH:mm" (e.g. "14:32").
 */
export function formatSessionTimeToHHmm(val: Date | string | null | undefined): string | null {
  if (val == null) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const h = parseInt(match[1]!, 10);
      const min = match[2]!;
      if (h >= 0 && h <= 23) {
        return `${String(h).padStart(2, '0')}:${min}`;
      }
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return dateTimeFieldToHHmm(d);
    }
    return null;
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return dateTimeFieldToHHmm(val);
  }
  return null;
}

const eventSessionDetailSelect = {
  id: true,
  event_day_id: true,
  title: true,
  description: true,
  event_organizer_id: true,
  session_theme: true,
  start_time: true,
  end_time: true,
  venue_id: true,
  venue_subvenue_id: true,
  status: true,
  created_at: true,
  updated_at: true,
  event_session_bg_url: true,
  event_days: {
    select: {
      id: true,
      event_id: true,
      title: true,
      date: true,
    },
  },
  venues: {
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
      city: true,
      state_name: true,
      country: true,
    },
  },
  venue_subvenues: {
    select: { id: true, title: true },
  },
  event_organizers: {
    select: {
      id: true,
      name: true,
      logo_url: true,
      contact_email: true,
      contact_phone: true,
      website_url: true,
    },
  },
  event_session_offerings: {
    select: {
      event_offering_master: {
        select: {
          id: true,
          title: true,
          description: true,
        },
      },
    },
  },
} as const;

/**
 * Single session with day, venue, organizer, and resolved offering masters (public-style detail).
 */
export async function getEventSessionDetailsById(sessionId: string) {
  const row = await prisma.event_sessions.findUnique({
    where: { id: sessionId },
    select: eventSessionDetailSelect,
  });
  if (!row) return null;

  const {
    event_days,
    venues,
    venue_subvenues,
    event_organizers,
    event_session_offerings,
    ...session
  } = row;

  return {
    ...session,
    start_time: formatSessionTimeToHHmm(session.start_time),
    end_time: formatSessionTimeToHHmm(session.end_time),
    event_day: event_days,
    venue: venues,
    venue_subvenue: venue_subvenues,
    organizer: event_organizers,
    offerings: event_session_offerings.map((o) => o.event_offering_master),
  };
}

/**
 * Get explore item IDs linked to an event (for edit wizard).
 */
export async function getEventExploreItemIds(eventId: string): Promise<string[]> {
  const rows = await prisma.event_explore_items.findMany({
    where: { event_id: eventId },
    select: { explore_item_id: true },
  });
  return rows.map((r) => r.explore_item_id);
}

/**
 * Set explore items linked to an event. Replaces existing event_explore_items.
 */
export async function setEventExploreItems(eventId: string, exploreItemIds: string[]) {
  await prisma.event_explore_items.deleteMany({ where: { event_id: eventId } });
  if (exploreItemIds.length === 0) return;

  await prisma.event_explore_items.createMany({
    data: exploreItemIds.map((explore_item_id) => ({
      event_id: eventId,
      explore_item_id,
      is_active: true,
    })),
  });
}

export type AdminUserOption = {
  id: string;
  full_name: string;
  email: string;
  role_name: string;
};

/**
 * List admin users (super_admin + event_admin) for select/assignment UIs.
 */
export async function listAdminUsersForSelect(): Promise<AdminUserOption[]> {
  const users = await prisma.users.findMany({
    where: {
      is_active: true,
      roles: { name: EVENT_ADMIN_ROLE_NAME },
    },
    orderBy: [{ full_name: 'asc' }, { email: 'asc' }],
    select: {
      id: true,
      full_name: true,
      email: true,
      roles: { select: { name: true } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role_name: u.roles.name,
  }));
}

/**
 * Get admin user IDs assigned to an event.
 */
export async function getEventAdminUserIds(eventId: string): Promise<string[]> {
  const rows = await prisma.event_admins.findMany({
    where: { event_id: eventId },
    select: { user_id: true },
  });
  return rows.map((r) => r.user_id);
}

/**
 * Replace event admins for an event. (Delete existing, insert provided.)
 */
export async function setEventAdmins(
  eventId: string,
  adminUserIds: string[],
  assignedBy?: string | null
) {
  await prisma.event_admins.deleteMany({ where: { event_id: eventId } });
  if (adminUserIds.length === 0) return;

  // Server-side guard: only allow assigning users with role "event_admin".
  const allowed = await prisma.users.findMany({
    where: {
      id: { in: adminUserIds },
      roles: { name: EVENT_ADMIN_ROLE_NAME },
    },
    select: { id: true },
  });
  const allowedIds = new Set(allowed.map((u) => u.id));
  const filteredIds = adminUserIds.filter((id) => allowedIds.has(id));
  if (filteredIds.length === 0) return;

  await prisma.event_admins.createMany({
    data: filteredIds.map((user_id) => ({
      event_id: eventId,
      user_id,
      assigned_by: assignedBy ?? null,
    })),
  });
}
