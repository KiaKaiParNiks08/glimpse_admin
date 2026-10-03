'use server';

import {
  listEventsQuerySchema,
  createEventSchema,
  updateEventSchema,
  eventDaysSessionsSchema,
  addEventOrganizerBodySchema,
  createOfferingMasterBodySchema,
  setEventHighlightsSchema,
  setCurrentHappeningSchema,
  upsertCurrentHappeningItemSchema,
  currentHappeningPathSchema,
  happeningPhotoItemSchema,
  happeningPhotoPathSchema,
  eventWatermarkSchema,
  currentHappeningSettingsSchema,
  postEventReportSettingsSchema,
} from '@/lib/validations/events';
import type {
  EventWatermarkInput,
  CurrentHappeningSettingsInput,
  PostEventReportSettingsInput,
  ListEventsQuery,
  CreateEventInput,
  UpdateEventInput,
  EventDayInput,
  EventHighlightItemInput,
  CurrentHappeningItemInput,
  UpsertCurrentHappeningItemInput,
  HappeningPhotoItemInput,
} from '@/lib/validations/events';
import {
  listAppThemesForSelect,
  createAppTheme,
} from '@/server/app-themes';
import { createAppThemeSchema } from '@/lib/validations/app-themes';
import {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  listEventCategoriesForSelect,
  upsertEventDaysWithSessions,
  setEventExploreItems,
  getEventExploreItemIds,
  listAdminUsersForSelect,
  getEventAdminUserIds,
  setEventAdmins,
  isEventAdminAssigned,
  listEventOrganizersForSelect,
  listOfferingMastersForSelect,
  createEventOrganizerForEvent,
  createEventOfferingMasterRow,
  formatSessionTimeToHHmm,
  setEventWatermark,
  setCurrentHappeningSettings,
  setPostEventReportSettings,
  getCorporateLinkedInError,
} from '@/server/events';
import { getEventDaysByEventId } from '@/server/event-days';
import {
  getEventHighlightsByEventId,
  setEventHighlights,
} from '@/server/event-highlights';
import {
  getCurrentHappeningByEventId,
  setCurrentHappening,
  createCurrentHappening,
  updateCurrentHappening,
  deleteCurrentHappening,
  addHappeningPhoto,
  deleteHappeningPhoto,
} from '@/server/current-happening';
import { listVenuesWithSubvenuesForSelect } from '@/server/venues';
import { setEventAdminsSchema } from '@/lib/validations/events';
import { getAdminSessionFromCookies, type AdminSessionUser } from '@/lib/admin-session';

async function requireAdminSession(): Promise<
  | { ok: true; session: AdminSessionUser }
  | { ok: false; error: string }
> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  return { ok: true, session };
}

async function canAccessEventAsViewer(eventId: string, viewer: { role_name: string; id: string }) {
  if (viewer.role_name === 'super_admin') return true;
  if (viewer.role_name === 'event_admin') {
    return isEventAdminAssigned(eventId, viewer.id);
  }
  return false;
}

function toPlainValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.toNumber === 'function')
      return (obj as { toNumber: () => number }).toNumber();
    if (val instanceof Date) return val.toISOString();
    if (Array.isArray(val)) return val.map(toPlainValue);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = toPlainValue(v);
    return out;
  }
  return val;
}

export type EventListItem = {
  id: string;
  title: string;
  slug: string;
  event_code: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  cover_image: string | null;
  e_invite_pdf_url: string | null;
  post_event_pdf_url: string | null;
  created_at: string | null;
  category_id: string;
  main_venue_id: string | null;
  event_categories: { id: string; name: string; slug: string };
  venues: { id: string; name: string } | null;
};

export type EventCategoryOption = { id: string; name: string; slug: string };
export type VenueOption = {
  id: string;
  name: string;
  subvenues?: { id: string; title: string }[];
};
export type AppThemeOption = {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  button_primary_color: string;
  button_secondary_color: string;
};

export type GetEventsResult =
  | {
      ok: true;
      data: EventListItem[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    }
  | { ok: false; error: string };

export type GetEventByIdResult =
  | { ok: true; data: Awaited<ReturnType<typeof getEventById>> }
  | { ok: false; error: string };

export type GetEventCategoriesResult =
  | { ok: true; data: EventCategoryOption[] }
  | { ok: false; error: string };

export type GetVenuesForSelectResult =
  | { ok: true; data: VenueOption[] }
  | { ok: false; error: string };

export type GetAppThemesResult =
  | { ok: true; data: AppThemeOption[] }
  | { ok: false; error: string };

export type CreateAppThemeResult =
  | { ok: true; data: AppThemeOption }
  | { ok: false; error: string };

export type CreateEventResult =
  | { ok: true; data: Awaited<ReturnType<typeof createEvent>> }
  | { ok: false; error: string };

export type UpdateEventResult =
  | { ok: true; data: Awaited<ReturnType<typeof updateEvent>> }
  | { ok: false; error: string };

export type DeleteEventResult = { ok: true } | { ok: false; error: string };

export type UpsertEventDaysResult = { ok: true } | { ok: false; error: string };
export type SetEventExploreItemsResult = { ok: true } | { ok: false; error: string };
export type GetEventHighlightsResult =
  | { ok: true; data: Awaited<ReturnType<typeof getEventHighlightsByEventId>> }
  | { ok: false; error: string };
export type SetEventHighlightsResult = { ok: true } | { ok: false; error: string };
export type SetEventWatermarkResult = { ok: true } | { ok: false; error: string };
export type CurrentHappeningSettings = {
  title: string | null;
  show_pre_event: boolean;
  show_ongoing_event: boolean;
  show_post_event: boolean;
};
export type GetCurrentHappeningSettingsResult =
  | { ok: true; data: CurrentHappeningSettings }
  | { ok: false; error: string };
export type SaveSectionSettingsResult = { ok: true } | { ok: false; error: string };
export type GetCurrentHappeningResult =
  | { ok: true; data: Awaited<ReturnType<typeof getCurrentHappeningByEventId>> }
  | { ok: false; error: string };
export type SetCurrentHappeningResult = { ok: true } | { ok: false; error: string };
export type CreateCurrentHappeningResult =
  | { ok: true; data: Awaited<ReturnType<typeof createCurrentHappening>> }
  | { ok: false; error: string };
export type UpdateCurrentHappeningResult =
  | { ok: true; data: Awaited<ReturnType<typeof updateCurrentHappening>> }
  | { ok: false; error: string };
export type DeleteCurrentHappeningResult = { ok: true } | { ok: false; error: string };
export type AddHappeningPhotoResult =
  | { ok: true; data: Awaited<ReturnType<typeof addHappeningPhoto>> }
  | { ok: false; error: string };
export type DeleteHappeningPhotoResult = { ok: true } | { ok: false; error: string };
export type GetEventDaysResult =
  | { ok: true; data: EventDayInput[] }
  | { ok: false; error: string };

export type EventSessionLookups = {
  organizers: { id: string; name: string }[];
  offeringMasters: { id: string; title: string }[];
};

export type GetEventSessionLookupsResult =
  | { ok: true; data: EventSessionLookups }
  | { ok: false; error: string };

export type AddEventOrganizerResult =
  | { ok: true; data: { id: string; name: string } }
  | { ok: false; error: string };

export type CreateOfferingMasterResult =
  | { ok: true; data: { id: string; title: string } }
  | { ok: false; error: string };

export type GetEventExploreItemIdsResult =
  | { ok: true; data: string[] }
  | { ok: false; error: string };

export type AdminUserOption = {
  id: string;
  full_name: string;
  email: string;
  role_name: string;
};

export type GetAdminUsersForSelectResult =
  | { ok: true; data: AdminUserOption[] }
  | { ok: false; error: string };

export type GetEventAdminUserIdsResult =
  | { ok: true; data: string[] }
  | { ok: false; error: string };

export type SetEventAdminsResult = { ok: true } | { ok: false; error: string };

export async function getEventsAction(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category_id?: string;
}): Promise<GetEventsResult> {
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const parsed = listEventsQuerySchema.safeParse({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    search: params.search,
    status: params.status,
    category_id: params.category_id,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid parameters' };
  }

  try {
    const { events, total } = await listEvents(parsed.data as ListEventsQuery, {
      viewer_user_id: sessionRes.session.role_name === 'event_admin' ? sessionRes.session.id : undefined,
    });
    const limit = parsed.data.limit;
    const list = events.map((e) => ({
      ...e,
      start_date: e.start_date ? e.start_date.toISOString() : null,
      end_date: e.end_date ? e.end_date.toISOString() : null,
      created_at: e.created_at ? e.created_at.toISOString() : null,
    }));
    return {
      ok: true,
      data: list as EventListItem[],
      meta: {
        total,
        page: parsed.data.page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch events' };
  }
}

export async function getEventByIdAction(eventId: string): Promise<GetEventByIdResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
    if (!allowed) return { ok: false, error: 'Event not found' };
    const event = await getEventById(eventId);
    if (!event) return { ok: false, error: 'Event not found' };
    return {
      ok: true,
      data: toPlainValue(event) as Awaited<ReturnType<typeof getEventById>>,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch event' };
  }
}

export async function getEventCategoriesAction(): Promise<GetEventCategoriesResult> {
  try {
    const categories = await listEventCategoriesForSelect();
    return { ok: true, data: categories };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch event categories' };
  }
}

export async function getVenuesForSelectAction(_params?: {
  limit?: number;
}): Promise<GetVenuesForSelectResult> {
  try {
    const venues = await listVenuesWithSubvenuesForSelect();
    return {
      ok: true,
      data: venues.map((v) => ({
        id: v.id,
        name: v.name,
        ...(v.subvenues.length > 0 ? { subvenues: v.subvenues } : {}),
      })),
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch venues' };
  }
}

export async function getAppThemesForSelectAction(): Promise<GetAppThemesResult> {
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const themes = await listAppThemesForSelect();
    return { ok: true, data: themes };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch app themes' };
  }
}

export async function createAppThemeAction(
  body: unknown
): Promise<CreateAppThemeResult> {
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  if (
    sessionRes.session.role_name !== 'super_admin' &&
    sessionRes.session.role_name !== 'event_admin'
  ) {
    return { ok: false, error: 'Forbidden' };
  }
  const parsed = createAppThemeSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    const theme = await createAppTheme(parsed.data);
    return { ok: true, data: theme };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to create theme' };
  }
}

export async function createEventAction(
  body: CreateEventInput
): Promise<CreateEventResult> {
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  if (sessionRes.session.role_name !== 'super_admin') {
    return { ok: false, error: 'Forbidden: only Super Admin can create events' };
  }
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const linkedInError = await getCorporateLinkedInError(parsed.data);
    if (linkedInError) return { ok: false, error: linkedInError };
    const event = await createEvent(parsed.data);
    return { ok: true, data: toPlainValue(event) as Awaited<ReturnType<typeof createEvent>> };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to create event' };
  }
}

export async function updateEventAction(
  eventId: string,
  body: UpdateEventInput
): Promise<UpdateEventResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const linkedInError = await getCorporateLinkedInError(parsed.data, eventId);
    if (linkedInError) return { ok: false, error: linkedInError };
    const event = await updateEvent(eventId, parsed.data);
    if (!event) return { ok: false, error: 'Event not found' };
    return { ok: true, data: toPlainValue(event) as Awaited<ReturnType<typeof updateEvent>> };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to update event' };
  }
}

export async function deleteEventAction(eventId: string): Promise<DeleteEventResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    // Only Super Admin can delete events.
    if (sessionRes.session.role_name !== 'super_admin') {
      return { ok: false, error: 'Forbidden' };
    }
    const deleted = await deleteEvent(eventId);
    if (!deleted) return { ok: false, error: 'Event not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to delete event' };
  }
}

export async function upsertEventDaysWithSessionsAction(
  eventId: string,
  body: { start_date: string; end_date: string; days: EventDayInput[] }
): Promise<UpsertEventDaysResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = eventDaysSessionsSchema.safeParse(body);
  if (!parsed.success) {
    const msg =
      parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    await upsertEventDaysWithSessions(
      eventId,
      parsed.data.start_date,
      parsed.data.end_date,
      parsed.data.days
    );
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to save days and sessions' };
  }
}

export async function setEventExploreItemsAction(
  eventId: string,
  exploreItemIds: string[]
): Promise<SetEventExploreItemsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  try {
    await setEventExploreItems(eventId, exploreItemIds);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to save explore items' };
  }
}

export async function setEventWatermarkAction(
  eventId: string,
  body: EventWatermarkInput
): Promise<SetEventWatermarkResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = eventWatermarkSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
  }
  try {
    const saved = await setEventWatermark(eventId, {
      watermark_url: parsed.data.watermark_url?.trim() || null,
      watermark_position: parsed.data.watermark_position,
      watermark_opacity: parsed.data.watermark_opacity,
      watermark_size: parsed.data.watermark_size,
    });
    if (!saved) return { ok: false, error: 'Event not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to save watermark' };
  }
}

export async function getCurrentHappeningSettingsAction(
  eventId: string
): Promise<GetCurrentHappeningSettingsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
    if (!allowed) return { ok: false, error: 'Event not found' };
    const event = await getEventById(eventId);
    if (!event) return { ok: false, error: 'Event not found' };
    return {
      ok: true,
      data: {
        title: event.current_happening_title,
        show_pre_event: event.current_happening_show_pre_event,
        show_ongoing_event: event.current_happening_show_ongoing_event,
        show_post_event: event.current_happening_show_post_event,
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch current happening settings' };
  }
}

export async function setCurrentHappeningSettingsAction(
  eventId: string,
  body: CurrentHappeningSettingsInput
): Promise<SaveSectionSettingsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = currentHappeningSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
  }
  try {
    const saved = await setCurrentHappeningSettings(eventId, parsed.data);
    if (!saved) return { ok: false, error: 'Event not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to save current happening settings' };
  }
}

export async function setPostEventReportSettingsAction(
  eventId: string,
  body: PostEventReportSettingsInput
): Promise<SaveSectionSettingsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = postEventReportSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
  }
  try {
    const saved = await setPostEventReportSettings(eventId, parsed.data);
    if (!saved) return { ok: false, error: 'Event not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to save post-event report settings' };
  }
}

export async function getEventHighlightsAction(
  eventId: string
): Promise<GetEventHighlightsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
    if (!allowed) return { ok: false, error: 'Event not found' };
    const data = await getEventHighlightsByEventId(eventId);
    return { ok: true, data };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch event highlights' };
  }
}

function timeToStr(val: Date | string | null | undefined): string | null {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  return formatSessionTimeToHHmm(val);
}

export async function getEventDaysAction(
  eventId: string
): Promise<GetEventDaysResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
    if (!allowed) return { ok: false, error: 'Event not found' };
    const days = await getEventDaysByEventId(eventId);
    const data: EventDayInput[] = days.map((day) => ({
      date: day.date instanceof Date ? day.date.toISOString().slice(0, 10) : String(day.date),
      title: day.title ?? null,
      sessions: (day.event_sessions ?? []).map((s) => ({
        id: s.id,
        title: s.title ?? '',
        description: (s.description ?? '').trim() || '',
        event_session_bg_url:
          typeof s.event_session_bg_url === 'string' && s.event_session_bg_url.trim()
            ? s.event_session_bg_url.trim()
            : '',
        start_time: timeToStr(s.start_time),
        end_time: timeToStr(s.end_time),
        venue_id: s.venue_id ?? null,
        venue_subvenue_id: s.venue_subvenue_id ?? null,
        event_organizer_id: s.event_organizer_id ?? null,
        session_theme: s.session_theme ?? null,
        offering_master_ids: (s.event_session_offerings ?? []).map((o) => o.offering_master_id),
      })),
    }));
    return { ok: true, data };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch event days' };
  }
}

export async function addEventOrganizerAction(
  eventId: string,
  body: unknown
): Promise<AddEventOrganizerResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = addEventOrganizerBodySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    const row = await createEventOrganizerForEvent(
      eventId,
      {
        name: parsed.data.name.trim(),
        logo_url: parsed.data.logo_url,
        contact_email: parsed.data.contact_email,
        contact_phone: parsed.data.contact_phone,
        website_url: parsed.data.website_url,
      },
      sessionRes.session.id
    );
    return { ok: true, data: row };
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'P2002') {
      return { ok: false, error: 'An organizer with this name already exists for this event.' };
    }
    console.error(e);
    return { ok: false, error: 'Unable to add organizer' };
  }
}

export async function createEventOfferingMasterAction(
  eventId: string,
  body: unknown
): Promise<CreateOfferingMasterResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = createOfferingMasterBodySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    const row = await createEventOfferingMasterRow({
      title: parsed.data.title.trim(),
      description: parsed.data.description,
      createdByUserId: sessionRes.session.id,
    });
    return { ok: true, data: row };
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'P2002') {
      return { ok: false, error: 'An offering with this title already exists.' };
    }
    console.error(e);
    return { ok: false, error: 'Unable to create offering' };
  }
}

export async function getEventSessionLookupsAction(
  eventId: string
): Promise<GetEventSessionLookupsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
    if (!allowed) return { ok: false, error: 'Event not found' };
    const [organizers, offeringMasters] = await Promise.all([
      listEventOrganizersForSelect(eventId),
      listOfferingMastersForSelect(),
    ]);
    return {
      ok: true,
      data: {
        organizers,
        offeringMasters,
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to load session options' };
  }
}

export async function getEventExploreItemIdsAction(
  eventId: string
): Promise<GetEventExploreItemIdsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
    if (!allowed) return { ok: false, error: 'Event not found' };
    const data = await getEventExploreItemIds(eventId);
    return { ok: true, data };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch event explore items' };
  }
}

export async function setEventHighlightsAction(
  eventId: string,
  highlights: EventHighlightItemInput[]
): Promise<SetEventHighlightsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = setEventHighlightsSchema.safeParse({ highlights });
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    await setEventHighlights(eventId, parsed.data.highlights);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to save event highlights' };
  }
}

export async function getCurrentHappeningAction(
  eventId: string
): Promise<GetCurrentHappeningResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
    if (!allowed) return { ok: false, error: 'Event not found' };
    const data = await getCurrentHappeningByEventId(eventId);
    return { ok: true, data };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch current happening' };
  }
}

export async function setCurrentHappeningAction(
  eventId: string,
  currentHappening: CurrentHappeningItemInput[]
): Promise<SetCurrentHappeningResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = setCurrentHappeningSchema.safeParse({ current_happening: currentHappening });
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    await setCurrentHappening(eventId, parsed.data.current_happening);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to save current happening' };
  }
}

export async function createCurrentHappeningAction(
  eventId: string,
  item: UpsertCurrentHappeningItemInput
): Promise<CreateCurrentHappeningResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };

  const parsed = upsertCurrentHappeningItemSchema.safeParse(item);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const created = await createCurrentHappening(eventId, parsed.data);
    return { ok: true, data: created };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to create current happening' };
  }
}

export async function updateCurrentHappeningAction(
  eventId: string,
  happeningId: string,
  item: UpsertCurrentHappeningItemInput
): Promise<UpdateCurrentHappeningResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };

  const pathRes = parseBodySafe({ happening_id: happeningId }, currentHappeningPathSchema);
  if (!pathRes.ok) return { ok: false, error: pathRes.error };
  const parsed = upsertCurrentHappeningItemSchema.safeParse(item);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const updated = await updateCurrentHappening(pathRes.data.happening_id, parsed.data);
    if (!updated) return { ok: false, error: 'Current happening not found' };
    return { ok: true, data: updated };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to update current happening' };
  }
}

export async function deleteCurrentHappeningAction(
  eventId: string,
  happeningId: string
): Promise<DeleteCurrentHappeningResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };

  const pathRes = parseBodySafe({ happening_id: happeningId }, currentHappeningPathSchema);
  if (!pathRes.ok) return { ok: false, error: pathRes.error };

  try {
    const deleted = await deleteCurrentHappening(pathRes.data.happening_id);
    if (!deleted) return { ok: false, error: 'Current happening not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to delete current happening' };
  }
}

export async function addHappeningPhotoAction(
  eventId: string,
  happeningId: string,
  photo: HappeningPhotoItemInput
): Promise<AddHappeningPhotoResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };

  const pathRes = parseBodySafe({ happening_id: happeningId }, currentHappeningPathSchema);
  if (!pathRes.ok) return { ok: false, error: pathRes.error };
  const parsed = happeningPhotoItemSchema.safeParse(photo);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }

  try {
    const created = await addHappeningPhoto(pathRes.data.happening_id, parsed.data);
    if (!created) return { ok: false, error: 'Current happening not found' };
    return { ok: true, data: created };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to add photo' };
  }
}

export async function deleteHappeningPhotoAction(
  eventId: string,
  photoId: string
): Promise<DeleteHappeningPhotoResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };

  const pathRes = parseBodySafe({ photo_id: photoId }, happeningPhotoPathSchema);
  if (!pathRes.ok) return { ok: false, error: pathRes.error };

  try {
    const deleted = await deleteHappeningPhoto(pathRes.data.photo_id);
    if (!deleted) return { ok: false, error: 'Photo not found' };
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to delete photo' };
  }
}

function parseBodySafe<T extends Record<string, unknown>, O>(
  payload: T,
  schema: { safeParse: (val: T) => { success: true; data: O } | { success: false } }
): { ok: true; data: O } | { ok: false; error: string } {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Validation failed' };
  return { ok: true, data: parsed.data };
}

export async function getAdminUsersForSelectAction(): Promise<GetAdminUsersForSelectResult> {
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  try {
    const data = await listAdminUsersForSelect();
    return { ok: true, data: data as AdminUserOption[] };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch event admins' };
  }
}

export async function getEventAdminUserIdsAction(
  eventId: string
): Promise<GetEventAdminUserIdsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  try {
    const sessionRes = await requireAdminSession();
    if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
    const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
    if (!allowed) return { ok: false, error: 'Event not found' };
    const data = await getEventAdminUserIds(eventId);
    return { ok: true, data };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to fetch event admins' };
  }
}

export async function setEventAdminsAction(
  eventId: string,
  body: { admin_user_ids: string[]; assigned_by?: string | null }
): Promise<SetEventAdminsResult> {
  if (!eventId) return { ok: false, error: 'Event ID required' };
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const allowed = await canAccessEventAsViewer(eventId, sessionRes.session);
  if (!allowed) return { ok: false, error: 'Forbidden' };
  const parsed = setEventAdminsSchema.safeParse({ admin_user_ids: body.admin_user_ids });
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? 'Validation failed';
    return { ok: false, error: msg };
  }
  try {
    await setEventAdmins(eventId, parsed.data.admin_user_ids, body.assigned_by ?? null);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Unable to save event admins' };
  }
}
