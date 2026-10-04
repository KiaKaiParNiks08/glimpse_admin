import { z } from 'zod';
import { uuidSchema } from './common';
import { EVENT_PHASES } from '@/lib/event-phase';
import { isLinkedInUrl, LINKEDIN_URL_ERROR } from '@/lib/event-categories';
import { WATERMARK_MAX_SIZE_PX, WATERMARK_MIN_SIZE_PX, WATERMARK_POSITIONS } from '@/lib/watermark';

/** Path params for /api/events/[event_id] and nested routes */
export const eventIdPathSchema = z.object({
  event_id: z.string().uuid(),
});

/** Path params for GET /api/events/sessions/[session_id] */
export const eventSessionIdPathSchema = z.object({
  session_id: z.string().uuid(),
});

/** List events query (pagination, search, status filter) */
export const listEventsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  category_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Query for GET /api/events/[event_id]/days (optional date filters) */
export const listEventDaysQuerySchema = z.object({
  date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

/** Optional URL or path for cover image or stored file URL */
const storedMediaUrlSchema = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .refine(
    (val) =>
      val === undefined ||
      val === null ||
      val === '' ||
      val.startsWith('/') ||
      val.startsWith('http'),
    { message: 'Must be a URL or path starting with / or http' }
  );

export const MAX_EVENT_COVER_IMAGES = 10;

/** Cover images in display order (first = main cover). */
const coverImagesSchema = z
  .array(
    z
      .string()
      .min(1)
      .max(2000)
      .refine((val) => val.startsWith('/') || val.startsWith('http'), {
        message: 'Cover image must be a URL or path starting with / or http',
      })
  )
  .max(MAX_EVENT_COVER_IMAGES, `At most ${MAX_EVENT_COVER_IMAGES} cover images`);

/** Base event fields (no refinement — use for .partial()) */
const baseEventSchema = z.object({
  category_id: uuidSchema,
  title: z.string().min(1, 'Title is required').max(200),
  slug: z.string().min(1, 'Slug is required').max(220),
  event_code: z.string().min(1, 'Event code is required').max(20),
  description: z.string().optional().nullable(),
  /** Master app theme (colors); optional */
  app_theme_id: uuidSchema.optional().nullable(),
  cover_image: storedMediaUrlSchema,
  /** When sent, replaces all cover images (in this order) and sets cover_image to the first one. */
  cover_images: coverImagesSchema.optional(),
  e_invite_pdf_url: storedMediaUrlSchema,
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  main_venue_id: uuidSchema.optional().nullable(),
  status: z.string().max(20).default('draft'),
  created_by: uuidSchema,
  organizer_name: z.string().max(200).optional().nullable(),
  organizer_logo_url: storedMediaUrlSchema,
  organizer_contact_email: z.string().max(150).optional().nullable(),
  organizer_contact_phone: z.string().max(50).optional().nullable(),
  organizer_website_url: z.string().max(500).optional().nullable(),
  groom_name: z.string().max(200).optional().nullable(),
  bride_name: z.string().max(200).optional().nullable(),
  greetings_text: z.string().max(2000).optional().nullable(),
  /** Required for corporate events (checked against the category in the event actions). */
  linkedin_url: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .refine((val) => !val || isLinkedInUrl(val), { message: LINKEDIN_URL_ERROR }),
});

/** Create event body */
export const createEventSchema = baseEventSchema.refine(
  (data) => {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    return !isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end;
  },
  { message: 'End date must be on or after start date', path: ['end_date'] }
);

/** Update event body (partial; no created_by) */
export const updateEventSchema = baseEventSchema.partial().omit({ created_by: true });

/** Session background: required, must look like a stored URL or path */
const sessionBgUrlRequiredSchema = z
  .string()
  .min(1, 'Session background image is required')
  .max(2000)
  .refine(
    (val) => val.startsWith('/') || val.startsWith('http'),
    { message: 'Background image must be a valid URL or path' }
  );

/** Session for event day (step 2) */
export const eventSessionSchema = z.object({
  /** Existing session id when editing; the session (and its media) is kept and updated */
  id: uuidSchema.optional().nullable(),
  title: z.string().min(1, 'Session title is required').max(150),
  description: z
    .string()
    .min(1, 'Session description is required')
    .max(2000),
  start_time: z.string().max(20).optional().nullable(),
  end_time: z.string().max(20).optional().nullable(),
  venue_id: uuidSchema.optional().nullable(),
  /** When set, session is at this sub-area; venue_id should be the parent venue */
  venue_subvenue_id: uuidSchema.optional().nullable(),
  /** Must belong to the same event (validated server-side) */
  event_organizer_id: uuidSchema.optional().nullable(),
  /** Dress code / vibe label (free text) */
  session_theme: z.string().max(200).optional().nullable(),
  /** Tags from event_offering_master (e.g. fun, food & cocktail) */
  offering_master_ids: z.array(uuidSchema).optional().default([]),
  event_session_bg_url: sessionBgUrlRequiredSchema,
});

/** Pre / ongoing / post visibility of a mobile app section; at least one must be on. */
const phaseFlagsShape = {
  show_pre_event: z.boolean(),
  show_ongoing_event: z.boolean(),
  show_post_event: z.boolean(),
};
const atLeastOnePhase = (f: { show_pre_event: boolean; show_ongoing_event: boolean; show_post_event: boolean }) =>
  f.show_pre_event || f.show_ongoing_event || f.show_post_event;

/** Current Happening section settings (title shown in the app + phases) */
export const currentHappeningSettingsSchema = z
  .object({
    title: z.string().trim().max(150).optional().nullable(),
    ...phaseFlagsShape,
  })
  .refine(atLeastOnePhase, { message: 'Select at least one phase: pre-event, ongoing or post-event' });

/** Post-event report PDF settings (title shown in the app + phases) */
export const postEventReportSettingsSchema = z
  .object({
    title: z.string().trim().max(200).optional().nullable(),
    ...phaseFlagsShape,
  })
  .refine(atLeastOnePhase, {
    message: 'Post-event report: select at least one phase: pre-event, ongoing or post-event',
  });

/** Query for GET /api/events/[event_id]; `phase` preview is honoured for admin tokens only */
export const eventDetailsQuerySchema = z.object({
  phase: z.enum(EVENT_PHASES).optional(),
  /** When set, each media item includes is_favorite for this user. */
  viewer_user_id: z.string().uuid().optional(),
});

/** Add organizer from Days & sessions (step 2) */
export const addEventOrganizerBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  logo_url: storedMediaUrlSchema,
  contact_email: z.string().max(150).optional().nullable(),
  contact_phone: z.string().max(50).optional().nullable(),
  website_url: z.string().max(500).optional().nullable(),
});

/** Create global offering tag (master list) */
export const createOfferingMasterBodySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
});

/** Day with sessions (step 2) */
export const eventDaySchema = z.object({
  date: z.string().min(1),
  title: z.string().max(100).optional().nullable(),
  sessions: z.array(eventSessionSchema),
});

/** Event days + sessions payload; at least one day must have at least one session */
export const eventDaysSessionsSchema = z
  .object({
    start_date: z.string().min(1),
    end_date: z.string().min(1),
    days: z.array(eventDaySchema).min(1, 'At least one day required'),
  })
  .refine(
    (data) => data.days.some((d) => d.sessions.length > 0),
    { message: 'At least one day must have at least one session', path: ['days'] }
  );

/** Query for listing event highlights (GET /api/events/highlights?event_id=) */
export const listEventHighlightsQuerySchema = z.object({
  event_id: z.string().uuid(),
});

/** Query for listing current happening (GET /api/events/current-happening?event_id=) */
export const listCurrentHappeningQuerySchema = z.object({
  event_id: z.string().uuid(),
});

/** Query for listing happening photos (GET /api/events/current-happening/photos?happening_id=) */
export const listHappeningPhotosQuerySchema = z.object({
  happening_id: z.string().uuid(),
});

/** Query for listing event day media (GET /api/events/day-media?event_day_id=) */
export const listEventDayMediaQuerySchema = z
  .object({
    /** Media of one session (preferred) */
    event_session_id: z.string().uuid().optional(),
    /** All media of one day (every session of that day) */
    event_day_id: z.string().uuid().optional(),
    /** When set, each item includes is_favorite for this user. */
    viewer_user_id: z.string().uuid().optional(),
  })
  .refine((q) => !!q.event_session_id || !!q.event_day_id, {
    message: 'event_session_id or event_day_id is required',
  });

const eventTeamContactSchema = z
  .object({
    name: z.string().trim().max(200).optional().default(''),
    phone: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().max(150).optional().nullable(),
    image_url: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const phone = value.phone?.trim() || '';
    const email = value.email?.trim() || '';
    const image = value.image_url?.trim() || '';
    const name = value.name.trim();
    if (!name && !phone && !email && !image) return;
    if (!name) {
      ctx.addIssue({ code: 'custom', message: 'Name is required', path: ['name'] });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email', path: ['email'] });
    }
  });

export const eventTeamSchema = z.object({
  planner: eventTeamContactSchema,
  photographer: eventTeamContactSchema,
});

export const eventTeamQuerySchema = z.object({
  event_id: uuidSchema,
});

/** Gallery watermark settings (wizard step 3). No url = no watermark. */
export const eventWatermarkSchema = z.object({
  watermark_url: storedMediaUrlSchema,
  watermark_position: z.enum(WATERMARK_POSITIONS),
  watermark_opacity: z.coerce.number().int().min(0).max(100),
  watermark_size: z.coerce
    .number()
    .int()
    .min(WATERMARK_MIN_SIZE_PX, `Watermark size must be at least ${WATERMARK_MIN_SIZE_PX} px`)
    .max(WATERMARK_MAX_SIZE_PX, `Watermark size must be at most ${WATERMARK_MAX_SIZE_PX}×${WATERMARK_MAX_SIZE_PX} px`),
});

/** Query for GET /api/events/explore-categories?event_id= */
export const listEventExploreCategoriesQuerySchema = z.object({
  event_id: z.string().uuid(),
});

/** Query for GET /api/events/explore-items?event_id=&explore_category_id= */
export const listExploreItemsQuerySchema = z.object({
  event_id: z.string().uuid(),
  explore_category_id: z.string().uuid(),
});

/** Single highlight item for set-event-highlights payload (all fields required) */
export const eventHighlightItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  media_url: z.string().min(1, 'Image is required (upload an image)').max(2000),
  media_type: z.string().max(10).default('image'),
  display_order: z.coerce.number().int().min(0).default(0),
});

/** Set event highlights body (replace all highlights for the event) */
export const setEventHighlightsSchema = z.object({
  highlights: z.array(eventHighlightItemSchema),
});

/** Single current happening item for set-current-happening payload */
export const currentHappeningItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional().nullable(),
  bg_image_url: z.string().min(1, 'Background image is required').max(2000),
  happening_date: z.string().min(1, 'Happening date is required'),
  display_order: z.coerce.number().int().min(0).default(0),
});

/** Set current happening body (replace all items for the event) */
export const setCurrentHappeningSchema = z.object({
  current_happening: z.array(currentHappeningItemSchema),
});

export const upsertCurrentHappeningItemSchema = currentHappeningItemSchema.extend({
  id: uuidSchema.optional(),
});

export const currentHappeningPathSchema = z.object({
  happening_id: uuidSchema,
});

export const happeningPhotoItemSchema = z.object({
  image_url: z.string().min(1, 'Media URL is required').max(2000),
  media_type: z.enum(['image', 'video']).default('image'),
  alt_text: z.string().max(255).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const happeningPhotoPathSchema = z.object({
  photo_id: uuidSchema,
});

/** Set event admins body (replace all admins for the event; can be empty) */
export const setEventAdminsSchema = z.object({
  admin_user_ids: z.array(uuidSchema),
});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type ListEventDaysQuery = z.infer<typeof listEventDaysQuerySchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventDayInput = z.infer<typeof eventDaySchema>;
export type EventSessionInput = z.infer<typeof eventSessionSchema>;
export type AddEventOrganizerInput = z.infer<typeof addEventOrganizerBodySchema>;
export type CreateOfferingMasterInput = z.infer<typeof createOfferingMasterBodySchema>;
export type EventHighlightItemInput = z.infer<typeof eventHighlightItemSchema>;
export type SetEventHighlightsInput = z.infer<typeof setEventHighlightsSchema>;
export type CurrentHappeningItemInput = z.infer<typeof currentHappeningItemSchema>;
export type SetCurrentHappeningInput = z.infer<typeof setCurrentHappeningSchema>;
export type UpsertCurrentHappeningItemInput = z.infer<typeof upsertCurrentHappeningItemSchema>;
export type HappeningPhotoItemInput = z.infer<typeof happeningPhotoItemSchema>;
export type SetEventAdminsInput = z.infer<typeof setEventAdminsSchema>;
export type EventTeamInput = z.infer<typeof eventTeamSchema>;
export type EventWatermarkInput = z.infer<typeof eventWatermarkSchema>;
export type CurrentHappeningSettingsInput = z.infer<typeof currentHappeningSettingsSchema>;
export type PostEventReportSettingsInput = z.infer<typeof postEventReportSettingsSchema>;
