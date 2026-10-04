'use client';

import { useState, useEffect, useRef } from 'react';
import { EventForm } from '@/components/EventForm';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import { ImageUploadField } from '@/components/VenueForm/ImageUploadField';
import type {
  CreateEventInput,
  EventDayInput,
  EventHighlightItemInput,
} from '@/lib/validations/events';
import {
  createEventAction,
  updateEventAction,
  getEventByIdAction,
  getEventDaysAction,
  getEventExploreItemIdsAction,
  getEventHighlightsAction,
  getAdminUsersForSelectAction,
  getEventAdminUserIdsAction,
  upsertEventDaysWithSessionsAction,
  getEventSessionLookupsAction,
  addEventOrganizerAction,
  createEventOfferingMasterAction,
  setEventExploreItemsAction,
  setEventAdminsAction,
  setEventHighlightsAction,
  setEventWatermarkAction,
  setEventTeamAction,
  getEventTeamAction,
  setPostEventReportSettingsAction,
} from '@/app/actions/events';
import type { PostEventReportSettings } from '@/components/EventForm/PostEventPdfUploadField';
import { ALL_PHASES_ON } from '@/lib/event-phase';
import {
  DEFAULT_WATERMARK_OPACITY,
  DEFAULT_WATERMARK_POSITION,
  DEFAULT_WATERMARK_SIZE,
  WATERMARK_MAX_SIZE_PX,
  WATERMARK_MAX_UPLOAD_PX,
  WATERMARK_MIN_SIZE_PX,
  WATERMARK_POSITION_LABELS,
  WATERMARK_POSITIONS,
  checkImageMaxDimensions,
  clampWatermarkSize,
  toWatermarkPosition,
  type WatermarkPosition,
} from '@/lib/watermark';
import { WatermarkOverlay } from '@/components/WatermarkOverlay';
import {
  getExploreCategoriesWithItemsAction,
  type ExploreCategoryWithItems,
} from '@/app/actions/explore';
import type { AppThemeOption, EventCategoryOption, VenueOption } from '@/app/actions/events';
import { ExploreCategoryFormModal } from '@/app/dashboard/explore-categories/ExploreCategoryFormModal';
import styles from './events.module.scss';
import { emptyTeamContact, EventTeamFields, type TeamContactForm } from './EventTeamFields';

const STEPS = [
  { id: 1, label: 'Basic details' },
  { id: 2, label: 'Days & sessions' },
  { id: 3, label: 'Gallery watermark' },
  { id: 4, label: 'Planner & photographer' },
  { id: 5, label: 'Explore mapping' },
  { id: 6, label: 'Event highlights' },
  { id: 7, label: 'Event admins' },
];

const WATERMARK_SAMPLE_IMAGE = '/watermark-sample.svg';

type CreateEventWizardProps = {
  categories: EventCategoryOption[];
  venues: VenueOption[];
  themes: AppThemeOption[];
  createdBy: string;
  /** When set, wizard runs in edit mode: load event and prefill all steps */
  initialEventId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

function getDaysBetween(startStr: string, endStr: string): { date: string; title: string }[] {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
  const out: { date: string; title: string }[] = [];
  const d = new Date(start);
  while (d <= end) {
    out.push({ date: d.toISOString().slice(0, 10), title: '' });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * One entry per date from start to end: existing days keep their title and sessions, missing dates get an empty
 * session row. Days outside the range are kept only if they still have a titled session (nothing is dropped silently).
 */
function mergeDaysWithRange(
  existing: EventDayInput[],
  startStr: string,
  endStr: string,
  defaultVenueId: string | null
): EventDayInput[] {
  const byDate = new Map(existing.map((d) => [String(d.date).slice(0, 10), d]));
  const inRange = getDaysBetween(startStr, endStr).map(
    (d) => byDate.get(d.date) ?? { date: d.date, title: null, sessions: [emptySessionRow(defaultVenueId)] }
  );
  const rangeDates = new Set(inRange.map((d) => d.date));
  const outside = existing.filter(
    (d) => !rangeDates.has(String(d.date).slice(0, 10)) && (d.sessions ?? []).some((s) => s.title?.trim())
  );
  return [...inRange, ...outside].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Ensure server-loaded days always have a sessions array and string session titles (safe for controlled inputs). */
function normalizeLoadedEventDays(days: EventDayInput[]): EventDayInput[] {
  return days.map((d) => {
    const dateStr =
      typeof d.date === 'string' && d.date.length >= 10 ? d.date.slice(0, 10) : String(d.date ?? '').slice(0, 10);
    const rawSessions = Array.isArray(d.sessions) ? d.sessions : [];
    return {
      date: dateStr,
      title: d.title ?? null,
      sessions: rawSessions.map((s) => ({
        id: s?.id ?? null,
        title: s?.title ?? '',
        description: typeof s?.description === 'string' ? s.description : '',
        start_time:
          typeof s?.start_time === 'string' && s.start_time.length >= 5
            ? s.start_time.slice(0, 5)
            : s?.start_time ?? null,
        end_time:
          typeof s?.end_time === 'string' && s.end_time.length >= 5
            ? s.end_time.slice(0, 5)
            : s?.end_time ?? null,
        venue_id: s?.venue_id ?? null,
        venue_subvenue_id: s?.venue_subvenue_id ?? null,
        event_organizer_id: s?.event_organizer_id ?? null,
        session_theme: s?.session_theme ?? null,
        offering_master_ids: Array.isArray(s?.offering_master_ids) ? s.offering_master_ids : [],
        event_session_bg_url:
          typeof s?.event_session_bg_url === 'string' && s.event_session_bg_url.trim()
            ? s.event_session_bg_url
            : '',
      })),
    };
  });
}

function emptySessionRow(venueId: string | null): EventDayInput['sessions'][number] {
  return {
    id: null,
    title: '',
    description: '',
    start_time: null,
    end_time: null,
    venue_id: venueId,
    venue_subvenue_id: null,
    event_organizer_id: null,
    session_theme: null,
    offering_master_ids: [],
    event_session_bg_url: '',
  };
}

export function CreateEventWizard({
  categories,
  venues,
  themes,
  createdBy,
  initialEventId = null,
  onClose,
  onSuccess,
}: CreateEventWizardProps) {
  const [step, setStep] = useState(1);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [basicPayload, setBasicPayload] = useState<CreateEventInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!initialEventId);
  /** From GET event — merged into theme dropdown when editing */
  const [loadedThemeDetail, setLoadedThemeDetail] = useState<AppThemeOption | null>(null);
  const [postEventPdf, setPostEventPdf] = useState<{
    url: string;
    originalName: string | null;
    uploadedAt: string | null;
  } | null>(null);
  const [postEventReport, setPostEventReport] = useState<PostEventReportSettings>({
    title: '',
    ...ALL_PHASES_ON,
  });
  /** Captured at step 1 submit so step 2 initial sessions get the correct default venue */
  const mainVenueIdRef = useRef<string | null>(null);

  // Step 2: days with sessions
  const [days, setDays] = useState<EventDayInput[]>([]);
  const [sessionLookups, setSessionLookups] = useState<{
    organizers: { id: string; name: string }[];
    offeringMasters: { id: string; title: string }[];
  } | null>(null);

  const [organizerModalCtx, setOrganizerModalCtx] = useState<{
    dayIdx: number;
    sessionIdx: number;
  } | null>(null);
  const [organizerDraft, setOrganizerDraft] = useState({
    name: '',
    logo_url: '',
    contact_email: '',
    contact_phone: '',
    website_url: '',
  });
  const [offeringModalCtx, setOfferingModalCtx] = useState<{
    dayIdx: number;
    sessionIdx: number;
  } | null>(null);
  const [offeringDraft, setOfferingDraft] = useState({ title: '', description: '' });
  const [sessionModalSubmitting, setSessionModalSubmitting] = useState(false);
  const [sessionModalError, setSessionModalError] = useState<string | null>(null);

  // Step 3: gallery watermark (drawn over session media images)
  const [watermarkUrl, setWatermarkUrl] = useState('');
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>(DEFAULT_WATERMARK_POSITION);
  const [watermarkOpacity, setWatermarkOpacity] = useState(DEFAULT_WATERMARK_OPACITY);
  const [watermarkSize, setWatermarkSize] = useState(DEFAULT_WATERMARK_SIZE);
  const [planner, setPlanner] = useState<TeamContactForm>(emptyTeamContact);
  const [photographer, setPhotographer] = useState<TeamContactForm>(emptyTeamContact);
  const [teamLoadedFor, setTeamLoadedFor] = useState<string | null>(null);

  // Step 4: explore categories with items + selected item ids
  const [exploreCategories, setExploreCategories] = useState<ExploreCategoryWithItems[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);

  // Step 5: event highlights
  const [highlights, setHighlights] = useState<EventHighlightItemInput[]>([]);
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);

  // Step 6: event admins (event_admin role only)
  const [adminOptions, setAdminOptions] = useState<
    { id: string; full_name: string; email: string; role_name: string }[]
  >([]);
  const [selectedAdminIds, setSelectedAdminIds] = useState<Set<string>>(new Set());
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [adminsLoaded, setAdminsLoaded] = useState(false);

  // Edit mode: preload event, days, explore item ids, highlights, admin ids
  useEffect(() => {
    if (!initialEventId) {
      setInitialLoading(false);
      return;
    }
    let cancelled = false;
    setInitialLoading(true);
    setError(null);
    Promise.all([
      getEventByIdAction(initialEventId),
      getEventDaysAction(initialEventId),
      getEventExploreItemIdsAction(initialEventId),
      getEventHighlightsAction(initialEventId),
      getEventAdminUserIdsAction(initialEventId),
      getExploreCategoriesWithItemsAction(),
      getAdminUsersForSelectAction(),
    ])
      .then(([eventRes, daysRes, exploreRes, highlightsRes, adminsRes, categoriesRes, adminOptionsRes]) => {
        if (cancelled) return;
        if (!eventRes.ok) {
          setError(eventRes.error ?? 'Failed to load event');
          setInitialLoading(false);
          return;
        }
        const event = eventRes.data as unknown as {
          id: string;
          category_id: string;
          title: string;
          slug: string;
          event_code: string;
          description?: string | null;
          groom_name?: string | null;
          bride_name?: string | null;
          greetings_text?: string | null;
          linkedin_url?: string | null;
          app_theme_id?: string | null;
          app_themes?: AppThemeOption | null;
          cover_image?: string | null;
          event_cover_images?: { image_url: string }[];
          e_invite_pdf_url?: string | null;
          post_event_pdf_url?: string | null;
          post_event_pdf_original_name?: string | null;
          post_event_pdf_uploaded_at?: string | null;
          post_event_pdf_title?: string | null;
          post_event_pdf_show_pre_event?: boolean;
          post_event_pdf_show_ongoing_event?: boolean;
          post_event_pdf_show_post_event?: boolean;
          start_date: string | Date;
          end_date: string | Date;
          main_venue_id?: string | null;
          status: string;
          created_by: string;
          watermark_url?: string | null;
          watermark_position?: string | null;
          watermark_opacity?: number | null;
          watermark_size?: number | null;
          event_organizers?: {
            name: string | null;
            logo_url: string | null;
            contact_email: string | null;
            contact_phone: string | null;
            website_url: string | null;
          }[];
        };
        setLoadedThemeDetail(event.app_themes ?? null);
        setWatermarkUrl(event.watermark_url ?? '');
        setWatermarkPosition(toWatermarkPosition(event.watermark_position));
        setWatermarkOpacity(event.watermark_opacity ?? DEFAULT_WATERMARK_OPACITY);
        setWatermarkSize(clampWatermarkSize(event.watermark_size));
        setPostEventPdf({
          url: event.post_event_pdf_url ?? '',
          originalName: event.post_event_pdf_original_name ?? null,
          uploadedAt: event.post_event_pdf_uploaded_at ?? null,
        });
        setPostEventReport({
          title: event.post_event_pdf_title ?? '',
          show_pre_event: event.post_event_pdf_show_pre_event ?? true,
          show_ongoing_event: event.post_event_pdf_show_ongoing_event ?? true,
          show_post_event: event.post_event_pdf_show_post_event ?? true,
        });
        const primaryOrganizer = Array.isArray(event.event_organizers) ? event.event_organizers[0] : undefined;
        const startDate = typeof event.start_date === 'string' ? event.start_date.slice(0, 10) : (event.start_date instanceof Date ? event.start_date.toISOString().slice(0, 10) : '');
        const endDate = typeof event.end_date === 'string' ? event.end_date.slice(0, 10) : (event.end_date instanceof Date ? event.end_date.toISOString().slice(0, 10) : '');
        setCreatedEventId(initialEventId);
        setBasicPayload({
          category_id: event.category_id,
          title: event.title,
          slug: event.slug,
          event_code: event.event_code,
          description: event.description ?? undefined,
          app_theme_id: event.app_theme_id ?? undefined,
          organizer_name: primaryOrganizer?.name ?? undefined,
          organizer_logo_url: primaryOrganizer?.logo_url ?? undefined,
          organizer_contact_email: primaryOrganizer?.contact_email ?? undefined,
          organizer_contact_phone: primaryOrganizer?.contact_phone ?? undefined,
          organizer_website_url: primaryOrganizer?.website_url ?? undefined,
          groom_name: event.groom_name ?? undefined,
          bride_name: event.bride_name ?? undefined,
          greetings_text: event.greetings_text ?? undefined,
          linkedin_url: event.linkedin_url ?? undefined,
          cover_image: event.cover_image ?? undefined,
          cover_images: event.event_cover_images?.length
            ? event.event_cover_images.map((c) => c.image_url)
            : event.cover_image
              ? [event.cover_image]
              : [],
          e_invite_pdf_url: event.e_invite_pdf_url ?? undefined,
          start_date: startDate,
          end_date: endDate,
          main_venue_id: event.main_venue_id ?? undefined,
          status: event.status ?? 'draft',
          created_by: event.created_by,
        });
        mainVenueIdRef.current = event.main_venue_id && typeof event.main_venue_id === 'string' ? event.main_venue_id : null;
        const defaultVenueId = mainVenueIdRef.current;
        const templateDays = () =>
          getDaysBetween(startDate, endDate).map((d) => ({
            date: d.date,
            title: d.title || null,
            sessions: [emptySessionRow(defaultVenueId)],
          }));

        if (daysRes.ok && Array.isArray(daysRes.data)) {
          setDays(mergeDaysWithRange(normalizeLoadedEventDays(daysRes.data), startDate, endDate, defaultVenueId));
        } else {
          if (initialEventId) {
            setError(
              !daysRes.ok
                ? daysRes.error
                : 'Could not load days and sessions. Check the server log and ensure the database schema is up to date (e.g. event_sessions.venue_subvenue_id).'
            );
          }
          setDays(templateDays());
        }
        if (exploreRes.ok) setSelectedItemIds(new Set(exploreRes.data));
        if (highlightsRes.ok) {
          setHighlights(
            highlightsRes.data.map((h) => ({
              title: h.title,
              description: h.description ?? '',
              media_url: h.media_url ?? '',
              media_type: h.media_type ?? 'image',
              display_order: h.display_order ?? 0,
            }))
          );
          setHighlightsLoaded(true);
        }
        if (adminOptionsRes.ok) setAdminOptions(adminOptionsRes.data);
        if (adminsRes.ok) {
          setSelectedAdminIds(new Set(adminsRes.data));
          setAdminsLoaded(true);
        }
        if (categoriesRes.ok) setExploreCategories(categoriesRes.data);
        setInitialLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load event');
          setInitialLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialEventId]);

  useEffect(() => {
    const isCreateFlow = initialEventId == null;
    if (basicPayload && step === 2 && days.length === 0 && isCreateFlow) {
      const dayList = getDaysBetween(basicPayload.start_date, basicPayload.end_date);
      const defaultVenueId =
        mainVenueIdRef.current ??
        (typeof basicPayload.main_venue_id === 'string' && basicPayload.main_venue_id.trim()
          ? basicPayload.main_venue_id.trim()
          : null);
      setDays(
        dayList.map((d) => ({
          date: d.date,
          title: d.title || null,
          sessions: [emptySessionRow(defaultVenueId)],
        }))
      );
    }
  }, [basicPayload, step, days.length, initialEventId]);

  useEffect(() => {
    if (step === 5 && exploreCategories.length === 0) {
      getExploreCategoriesWithItemsAction().then((res) => {
        if (res.ok) setExploreCategories(res.data);
      });
    }
  }, [step, exploreCategories.length]);

  useEffect(() => {
    if (step === 4 && createdEventId && teamLoadedFor !== createdEventId) {
      getEventTeamAction(createdEventId).then((res) => {
        if (res.ok && res.data) {
          setPlanner({
            name: res.data.planner?.name ?? '',
            phone: res.data.planner?.phone ?? '',
            email: res.data.planner?.email ?? '',
            image_url: res.data.planner?.image_url ?? '',
          });
          setPhotographer({
            name: res.data.photographer?.name ?? '',
            phone: res.data.photographer?.phone ?? '',
            email: res.data.photographer?.email ?? '',
            image_url: res.data.photographer?.image_url ?? '',
          });
        }
        setTeamLoadedFor(createdEventId);
      });
    }
  }, [step, createdEventId, teamLoadedFor]);

  useEffect(() => {
    if (step === 6 && createdEventId && !highlightsLoaded) {
      getEventHighlightsAction(createdEventId).then((res) => {
        if (res.ok) {
          setHighlights(
            res.data.map((h) => ({
              title: h.title,
              description: h.description ?? '',
              media_url: h.media_url ?? '',
              media_type: h.media_type ?? 'image',
              display_order: h.display_order ?? 0,
            }))
          );
        }
        setHighlightsLoaded(true);
      });
    }
  }, [step, createdEventId, highlightsLoaded]);

  // Create flow never runs the edit preload; load event_admin users when opening step 6.
  useEffect(() => {
    if (step !== 6) return;
    if (adminOptions.length > 0) return;
    let cancelled = false;
    getAdminUsersForSelectAction().then((res) => {
      if (cancelled) return;
      if (res.ok) setAdminOptions(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [step, adminOptions.length]);

  useEffect(() => {
    if (step !== 2 || !createdEventId) return;
    let cancelled = false;
    getEventSessionLookupsAction(createdEventId).then((res) => {
      if (cancelled) return;
      if (res.ok) setSessionLookups(res.data);
      else setSessionLookups({ organizers: [], offeringMasters: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [step, createdEventId]);

  async function handleStep1Next(payload: CreateEventInput) {
    setSubmitting(true);
    setError(null);
    const mainVenueId =
      typeof payload.main_venue_id === 'string' && payload.main_venue_id.trim()
        ? payload.main_venue_id.trim()
        : null;
    mainVenueIdRef.current = mainVenueId;
    try {
      if (createdEventId) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit for update
        const { created_by, ...updatePayload } = payload;
        const result = await updateEventAction(createdEventId, updatePayload);
        if (!result.ok) throw new Error(result.error);
        const reportRes = await setPostEventReportSettingsAction(createdEventId, {
          ...postEventReport,
          title: postEventReport.title.trim() || null,
        });
        if (!reportRes.ok) throw new Error(reportRes.error);
        setBasicPayload(payload);
        setDays((prev) =>
          prev.length > 0 ? mergeDaysWithRange(prev, payload.start_date, payload.end_date, mainVenueId) : prev
        );
        setStep(2);
      } else {
        const result = await createEventAction(payload);
        if (!result.ok) throw new Error(result.error);
        setCreatedEventId(result.data.id);
        setBasicPayload(payload);
        setStep(2);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSubmitting(false);
    }
  }

  function handleStep2Next() {
    setError(null);
    for (const day of days) {
      for (const session of day.sessions ?? []) {
        const hasTitle = !!session.title?.trim();
        if (!hasTitle) continue;
        const hasStart = !!session.start_time;
        const hasEnd = !!session.end_time;
        if (hasStart !== hasEnd) {
          setError('For each session, select both start time and end time.');
          return;
        }
        if (hasStart && hasEnd && session.end_time! < session.start_time!) {
          setError('Session end time must be equal to or after start time.');
          return;
        }
        if (!session.description?.trim()) {
          setError('Each session with a title must have a description.');
          return;
        }
        const bg = session.event_session_bg_url?.trim() ?? '';
        if (!bg || (!bg.startsWith('/') && !bg.startsWith('http'))) {
          setError('Each session with a title must have a background image uploaded.');
          return;
        }
      }
    }
    const daysWithSessions = days.filter((d) => (d.sessions ?? []).some((s) => s.title?.trim()));
    if (daysWithSessions.length === 0) {
      setError('At least one day must have at least one session with a title.');
      return;
    }
    const payload = {
      start_date: basicPayload!.start_date,
      end_date: basicPayload!.end_date,
      days: daysWithSessions.map((d) => ({
        date: d.date,
        title: d.title || null,
        sessions: d.sessions.filter((s) => s.title?.trim()).map((s) => ({
          id: s.id ?? null,
          title: s.title!.trim(),
          description: s.description.trim(),
          start_time: s.start_time || null,
          end_time: s.end_time || null,
          venue_id: s.venue_id || null,
          venue_subvenue_id: s.venue_subvenue_id ?? null,
          event_organizer_id: s.event_organizer_id ?? null,
          session_theme: s.session_theme?.trim() ? s.session_theme.trim().slice(0, 200) : null,
          offering_master_ids: s.offering_master_ids ?? [],
          event_session_bg_url: s.event_session_bg_url!.trim(),
        })),
      })),
    };
    if (!payload.days.some((d) => d.sessions.length > 0)) {
      setError('At least one day must have at least one session.');
      return;
    }
    setSubmitting(true);
    upsertEventDaysWithSessionsAction(createdEventId!, payload)
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setStep(3);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save'))
      .finally(() => setSubmitting(false));
  }

  function openOrganizerModal(dayIdx: number, sessionIdx: number) {
    setOrganizerDraft({
      name: '',
      logo_url: '',
      contact_email: '',
      contact_phone: '',
      website_url: '',
    });
    setSessionModalError(null);
    setOrganizerModalCtx({ dayIdx, sessionIdx });
  }

  function openOfferingModal(dayIdx: number, sessionIdx: number) {
    setOfferingDraft({ title: '', description: '' });
    setSessionModalError(null);
    setOfferingModalCtx({ dayIdx, sessionIdx });
  }

  async function submitOrganizerModal() {
    if (!createdEventId || !organizerModalCtx) return;
    setSessionModalSubmitting(true);
    setSessionModalError(null);
    try {
      const res = await addEventOrganizerAction(createdEventId, {
        name: organizerDraft.name,
        logo_url: organizerDraft.logo_url || null,
        contact_email: organizerDraft.contact_email || null,
        contact_phone: organizerDraft.contact_phone || null,
        website_url: organizerDraft.website_url || null,
      });
      if (!res.ok) throw new Error(res.error);
      const { dayIdx, sessionIdx } = organizerModalCtx;
      setSessionLookups((prev) =>
        prev ? { ...prev, organizers: [...prev.organizers, res.data] } : prev
      );
      setDays((prev) =>
        prev.map((d, i) =>
          i === dayIdx
            ? {
                ...d,
                sessions: d.sessions.map((s, j) =>
                  j === sessionIdx ? { ...s, event_organizer_id: res.data.id } : s
                ),
              }
            : d
        )
      );
      setOrganizerModalCtx(null);
    } catch (e) {
      setSessionModalError(e instanceof Error ? e.message : 'Failed to add organizer');
    } finally {
      setSessionModalSubmitting(false);
    }
  }

  async function submitOfferingModal() {
    if (!createdEventId || !offeringModalCtx) return;
    setSessionModalSubmitting(true);
    setSessionModalError(null);
    try {
      const res = await createEventOfferingMasterAction(createdEventId, {
        title: offeringDraft.title,
        description: offeringDraft.description || null,
      });
      if (!res.ok) throw new Error(res.error);
      const { dayIdx, sessionIdx } = offeringModalCtx;
      setSessionLookups((prev) =>
        prev
          ? {
              ...prev,
              offeringMasters: [...prev.offeringMasters, res.data].sort((a, b) =>
                a.title.localeCompare(b.title)
              ),
            }
          : prev
      );
      setDays((prev) =>
        prev.map((d, i) =>
          i === dayIdx
            ? {
                ...d,
                sessions: d.sessions.map((s, j) => {
                  if (j !== sessionIdx) return s;
                  const ids = s.offering_master_ids ?? [];
                  if (ids.includes(res.data.id)) return s;
                  return { ...s, offering_master_ids: [...ids, res.data.id] };
                }),
              }
            : d
        )
      );
      setOfferingModalCtx(null);
    } catch (e) {
      setSessionModalError(e instanceof Error ? e.message : 'Failed to create offering');
    } finally {
      setSessionModalSubmitting(false);
    }
  }

  function handleWatermarkNext() {
    setSubmitting(true);
    setError(null);
    setEventWatermarkAction(createdEventId!, {
      watermark_url: watermarkUrl.trim() || null,
      watermark_position: watermarkPosition,
      watermark_opacity: watermarkOpacity,
      watermark_size: watermarkSize,
    })
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setStep(4);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save'))
      .finally(() => setSubmitting(false));
  }

  function handleTeamNext() {
    setSubmitting(true);
    setError(null);
    setEventTeamAction(createdEventId!, { planner, photographer })
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setStep(5);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save'))
      .finally(() => setSubmitting(false));
  }

  function handleExploreNext() {
    setSubmitting(true);
    setError(null);
    setEventExploreItemsAction(createdEventId!, Array.from(selectedItemIds))
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setStep(6);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save'))
      .finally(() => setSubmitting(false));
  }

  function handleHighlightsNext() {
    setError(null);
    const trimmed = highlights.map((h, i) => ({
      title: h.title.trim(),
      description: (h.description ?? '').trim(),
      media_url: (h.media_url ?? '').trim(),
      media_type: h.media_type ?? 'image',
      display_order: h.display_order ?? i,
    }));
    const invalid = trimmed.find(
      (h) => !h.title || !h.description || !h.media_url
    );
    if (invalid) {
      setError('Each highlight must have Title, Description, and an uploaded image.');
      return;
    }
    setSubmitting(true);
    setEventHighlightsAction(createdEventId!, trimmed)
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setStep(7);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save'))
      .finally(() => setSubmitting(false));
  }

  function toggleAdmin(id: string) {
    setSelectedAdminIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdminsFinish() {
    setSubmitting(true);
    setError(null);
    setEventAdminsAction(createdEventId!, { admin_user_ids: Array.from(selectedAdminIds), assigned_by: createdBy })
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        onSuccess();
        onClose();
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save'))
      .finally(() => setSubmitting(false));
  }

  function toggleExploreItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddCategorySuccess() {
    getExploreCategoriesWithItemsAction().then((res) => {
      if (res.ok) setExploreCategories(res.data);
    });
    setAddCategoryOpen(false);
  }

  if (initialLoading) {
    return <ContentSkeleton variant="form" />;
  }

  /** After the event exists (edit load or create step 1 saved), any step can be opened from the header. */
  const canNavigateSteps = !!(createdEventId && basicPayload);

  function goToStep(targetStep: number) {
    if (targetStep < 1 || targetStep > STEPS.length) return;
    if (targetStep > 1 && !canNavigateSteps) return;
    setError(null);
    setStep(targetStep);
  }

  return (
    <>
      <div className={styles.wizardSteps} role="navigation" aria-label="Event wizard steps">
        {STEPS.map((s) => {
          const isActive = step === s.id;
          const isPast = step > s.id;
          const canClick = (s.id === 1 || canNavigateSteps) && !isActive;
          const stepClass = `${styles.wizardStep} ${isActive ? styles.wizardStepActive : ''} ${isPast ? styles.wizardStepDone : ''}`;

          if (isActive) {
            return (
              <span key={s.id} className={stepClass} aria-current="step">
                {s.id}. {s.label}
              </span>
            );
          }

          if (!canClick) {
            return (
              <span key={s.id} className={`${stepClass} ${styles.wizardStepDisabled}`} aria-disabled="true">
                {s.id}. {s.label}
              </span>
            );
          }

          return (
            <button
              key={s.id}
              type="button"
              className={`${stepClass} ${styles.wizardStepBtn}`}
              aria-label={`Go to step ${s.id}: ${s.label}`}
              onClick={() => goToStep(s.id)}
            >
              {s.id}. {s.label}
            </button>
          );
        })}
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      {step === 1 && (
        <EventForm
          mode={createdEventId ? 'edit' : 'create'}
          event={
            createdEventId && basicPayload
              ? {
                  id: createdEventId,
                  category_id: basicPayload.category_id,
                  title: basicPayload.title,
                  slug: basicPayload.slug,
                  event_code: basicPayload.event_code,
                  description: basicPayload.description ?? null,
                  app_theme_id: basicPayload.app_theme_id ?? null,
                  app_themes: loadedThemeDetail,
                  organizer_name: basicPayload.organizer_name ?? null,
                  organizer_logo_url: basicPayload.organizer_logo_url ?? null,
                  organizer_contact_email: basicPayload.organizer_contact_email ?? null,
                  organizer_contact_phone: basicPayload.organizer_contact_phone ?? null,
                  organizer_website_url: basicPayload.organizer_website_url ?? null,
                  groom_name: basicPayload.groom_name ?? null,
                  bride_name: basicPayload.bride_name ?? null,
                  greetings_text: basicPayload.greetings_text ?? null,
                  linkedin_url: basicPayload.linkedin_url ?? null,
                  cover_image: basicPayload.cover_image ?? null,
                  cover_images: basicPayload.cover_images ?? [],
                  e_invite_pdf_url: basicPayload.e_invite_pdf_url ?? null,
                  post_event_pdf_url: postEventPdf?.url ?? null,
                  post_event_pdf_original_name: postEventPdf?.originalName ?? null,
                  post_event_pdf_uploaded_at: postEventPdf?.uploadedAt ?? null,
                  start_date: basicPayload.start_date,
                  end_date: basicPayload.end_date,
                  main_venue_id: basicPayload.main_venue_id ?? null,
                  status: basicPayload.status,
                }
              : null
          }
          categories={categories}
          venues={venues}
          themes={themes}
          createdBy={createdBy}
          onSubmit={handleStep1Next}
          onCancel={onClose}
          onPostEventPdfChanged={(next) =>
            setPostEventPdf({
              url: next.url,
              originalName: next.originalName,
              uploadedAt: next.uploadedAt,
            })
          }
          postEventReportSettings={postEventReport}
          onPostEventReportSettingsChange={setPostEventReport}
          submitLabel="Next: Days & sessions"
          cancelLabel="Cancel"
          loading={submitting}
          error={null}
        />
      )}

      {step === 2 && basicPayload && (
        <div className={styles.wizardStep2}>
          <p className={styles.wizardStepDesc}>
            Add at least one session for one or more days between {basicPayload.start_date} and {basicPayload.end_date}.
            Session description and background image are required for each session. Optional: dress or vibe theme,
            organizer, and offerings.
          </p>
          {sessionLookups === null && (
            <p className={styles.wizardSessionLookupsLoading}>Loading organizers and offerings…</p>
          )}
          <div className={styles.daysList}>
            {days.map((day, dayIdx) => (
              <div key={`${day.date}-${dayIdx}`} className={styles.dayCard}>
                <div className={styles.dayHeader}>
                  <strong>Day: {day.date}</strong>
                  <input
                    type="text"
                    placeholder="Day title (optional)"
                    value={day.title ?? ''}
                    onChange={(e) =>
                      setDays((prev) => {
                        const next = [...prev];
                        next[dayIdx] = { ...next[dayIdx], title: e.target.value || null };
                        return next;
                      })
                    }
                    className={styles.dayTitleInput}
                  />
                </div>
                <div className={styles.sessionsList}>
                  {(day.sessions ?? []).map((session, sessionIdx) => {
                    const sessionVenue = venues.find((v) => v.id === session.venue_id);
                    const sessionSubvenues = sessionVenue?.subvenues ?? [];
                    const subvenueSelectValue =
                      session.venue_subvenue_id &&
                      sessionSubvenues.some((sv) => sv.id === session.venue_subvenue_id)
                        ? session.venue_subvenue_id
                        : '';
                    const offeringMasters = sessionLookups?.offeringMasters ?? [];
                    const organizers = sessionLookups?.organizers ?? [];
                    return (
                      <div key={sessionIdx} className={styles.sessionCard}>
                        <div className={styles.sessionRowTop}>
                          <input
                            type="text"
                            placeholder="Session title *"
                            value={session.title}
                            onChange={(e) =>
                              setDays((prev) => {
                                const next = prev.map((d, i) =>
                                  i === dayIdx
                                    ? {
                                        ...d,
                                        sessions: d.sessions.map((s, j) =>
                                          j === sessionIdx ? { ...s, title: e.target.value } : s
                                        ),
                                      }
                                    : d
                                );
                                return next;
                              })
                            }
                            className={styles.sessionTitleInput}
                          />
                          <input
                            type="time"
                            value={session.start_time ?? ''}
                            onChange={(e) =>
                              setDays((prev) =>
                                prev.map((d, i) =>
                                  i === dayIdx
                                    ? {
                                        ...d,
                                        sessions: d.sessions.map((s, j) =>
                                          j === sessionIdx
                                            ? {
                                                ...s,
                                                start_time: e.target.value || null,
                                                end_time:
                                                  s.end_time &&
                                                  e.target.value &&
                                                  s.end_time < e.target.value
                                                    ? null
                                                    : s.end_time,
                                              }
                                            : s
                                        ),
                                      }
                                    : d
                                )
                              )
                            }
                            className={styles.timeInput}
                            step={60}
                          />
                          <input
                            type="time"
                            value={session.end_time ?? ''}
                            onChange={(e) =>
                              setDays((prev) =>
                                prev.map((d, i) =>
                                  i === dayIdx
                                    ? {
                                        ...d,
                                        sessions: d.sessions.map((s, j) =>
                                          j === sessionIdx
                                            ? (() => {
                                                const nextEnd = e.target.value || null;
                                                if (!nextEnd) return { ...s, end_time: null };
                                                if (!s.start_time) return { ...s, end_time: null };
                                                if (nextEnd < s.start_time) return { ...s, end_time: null };
                                                return { ...s, end_time: nextEnd };
                                              })()
                                            : s
                                        ),
                                      }
                                    : d
                                )
                              )
                            }
                            className={styles.timeInput}
                            min={session.start_time ?? undefined}
                            disabled={!session.start_time}
                            title={!session.start_time ? 'Select start time first' : undefined}
                            step={60}
                          />
                          <div className={styles.sessionVenueFields}>
                            <select
                              value={session.venue_id ?? ''}
                              onChange={(e) => {
                                const venue_id = e.target.value || null;
                                setDays((prev) =>
                                  prev.map((d, i) =>
                                    i === dayIdx
                                      ? {
                                          ...d,
                                          sessions: d.sessions.map((s, j) =>
                                            j === sessionIdx
                                              ? { ...s, venue_id, venue_subvenue_id: null }
                                              : s
                                          ),
                                        }
                                      : d
                                  )
                                );
                              }}
                              className={styles.venueSelect}
                              aria-label="Venue"
                            >
                              <option value="">No venue</option>
                              {venues.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                            {sessionSubvenues.length > 0 && (
                              <select
                                value={subvenueSelectValue}
                                onChange={(e) => {
                                  const venue_subvenue_id = e.target.value || null;
                                  setDays((prev) =>
                                    prev.map((d, i) =>
                                      i === dayIdx
                                        ? {
                                            ...d,
                                            sessions: d.sessions.map((s, j) =>
                                              j === sessionIdx ? { ...s, venue_subvenue_id } : s
                                            ),
                                          }
                                        : d
                                    )
                                  );
                                }}
                                className={styles.venueSelect}
                                aria-label="Sub-venue"
                              >
                                <option value="">Select sub-venue</option>
                                {sessionSubvenues.map((sv) => (
                                  <option key={sv.id} value={sv.id}>
                                    {sv.title}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setDays((prev) =>
                                prev.map((d, i) =>
                                  i === dayIdx
                                    ? { ...d, sessions: d.sessions.filter((_, j) => j !== sessionIdx) }
                                    : d
                                )
                              )
                            }
                            className={styles.removeBtn}
                            title="Remove session"
                          >
                            ×
                          </button>
                        </div>
                        <textarea
                          placeholder="Session description *"
                          value={session.description ?? ''}
                          required
                          aria-required
                          rows={2}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((d, i) =>
                                i === dayIdx
                                  ? {
                                      ...d,
                                      sessions: d.sessions.map((s, j) =>
                                        j === sessionIdx
                                          ? { ...s, description: e.target.value }
                                          : s
                                      ),
                                    }
                                  : d
                              )
                            )
                          }
                          className={styles.sessionDescriptionInput}
                        />
                        <div className={styles.sessionBgUpload}>
                          <ImageUploadField
                            compact
                            required
                            label="Session background image *"
                            uploadPrefix="events"
                            value={session.event_session_bg_url ?? ''}
                            onChange={(url) =>
                              setDays((prev) =>
                                prev.map((d, i) =>
                                  i === dayIdx
                                    ? {
                                        ...d,
                                        sessions: d.sessions.map((s, j) =>
                                          j === sessionIdx
                                            ? { ...s, event_session_bg_url: url || '' }
                                            : s
                                        ),
                                      }
                                    : d
                                )
                              )
                            }
                          />
                        </div>
                        <div className={styles.sessionMetaRow}>
                          <input
                            type="text"
                            placeholder="Session theme / dress code (optional)"
                            value={session.session_theme ?? ''}
                            maxLength={200}
                            onChange={(e) =>
                              setDays((prev) =>
                                prev.map((d, i) =>
                                  i === dayIdx
                                    ? {
                                        ...d,
                                        sessions: d.sessions.map((s, j) =>
                                          j === sessionIdx
                                            ? { ...s, session_theme: e.target.value || null }
                                            : s
                                        ),
                                      }
                                    : d
                                )
                              )
                            }
                            className={styles.sessionThemeInput}
                          />
                        </div>
                        {sessionLookups && (
                          <>
                            <div className={styles.sessionOrganizerRow}>
                              <select
                                value={session.event_organizer_id ?? ''}
                                onChange={(e) =>
                                  setDays((prev) =>
                                    prev.map((d, i) =>
                                      i === dayIdx
                                        ? {
                                            ...d,
                                            sessions: d.sessions.map((s, j) =>
                                              j === sessionIdx
                                                ? {
                                                    ...s,
                                                    event_organizer_id: e.target.value || null,
                                                  }
                                                : s
                                            ),
                                          }
                                        : d
                                    )
                                  )
                                }
                                className={styles.sessionOrganizerSelect}
                                aria-label="Session organizer"
                              >
                                <option value="">No session organizer</option>
                                {organizers.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className={styles.addLinkBtn}
                                onClick={() => openOrganizerModal(dayIdx, sessionIdx)}
                              >
                                + Add organizer
                              </button>
                            </div>
                            <div className={styles.sessionOfferingsBlock}>
                              <div className={styles.sessionOfferingsHeader}>
                                <span className={styles.sessionOfferingsLabel}>Offerings</span>
                                <button
                                  type="button"
                                  className={styles.addLinkBtn}
                                  onClick={() => openOfferingModal(dayIdx, sessionIdx)}
                                >
                                  + Add new offering
                                </button>
                              </div>
                              <select
                                multiple
                                className={styles.sessionMultiSelect}
                                size={Math.min(10, Math.max(4, offeringMasters.length || 1))}
                                value={session.offering_master_ids ?? []}
                                onChange={(e) => {
                                  const selected = Array.from(
                                    e.target.selectedOptions,
                                    (opt) => opt.value
                                  );
                                  setDays((prev) =>
                                    prev.map((d, i) =>
                                      i === dayIdx
                                        ? {
                                            ...d,
                                            sessions: d.sessions.map((s, j) =>
                                              j === sessionIdx
                                                ? { ...s, offering_master_ids: selected }
                                                : s
                                            ),
                                          }
                                        : d
                                    )
                                  );
                                }}
                                aria-label="Session offerings (multi-select)"
                              >
                                {offeringMasters.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.title}
                                  </option>
                                ))}
                              </select>
                              <p className={styles.multiSelectHint}>
                                Hold Ctrl (Windows) or ⌘ (Mac) and click to select multiple. Scroll the list to see all
                                options.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDays((prev) =>
                      prev.map((d, i) =>
                        i === dayIdx
                          ? {
                              ...d,
                              sessions: [
                                ...d.sessions,
                                emptySessionRow(
                                  mainVenueIdRef.current ??
                                    (typeof basicPayload?.main_venue_id === 'string'
                                      ? basicPayload.main_venue_id
                                      : null)
                                ),
                              ],
                            }
                          : d
                      )
                    )
                  }
                  className={styles.addSessionBtn}
                >
                  + Add session
                </button>
              </div>
            ))}
          </div>
          <div className={styles.wizardActions}>
            <button type="button" onClick={() => setStep(1)} className={styles.btnSecondary}>
              Back
            </button>
            <button
              type="button"
              onClick={handleStep2Next}
              disabled={submitting || sessionLookups === null}
              className={styles.btnPrimary}
            >
              {submitting ? 'Saving…' : 'Next: Gallery watermark'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={styles.wizardStepWatermark}>
          <p className={styles.wizardStepDesc}>
            Optional. Upload a watermark (e.g. a logo, ideally a PNG with a transparent background). It is shown on
            top of the images uploaded for this event&apos;s sessions, in the mobile app and in the media gallery.
            The uploaded files are not changed, so you can update or remove the watermark any time.
          </p>
          <div className={styles.watermarkLayout}>
            <div className={styles.watermarkControls}>
              <ImageUploadField
                label="Watermark image"
                value={watermarkUrl}
                onChange={setWatermarkUrl}
                uploadPrefix="events"
                validateFile={(file) => checkImageMaxDimensions(file, WATERMARK_MAX_UPLOAD_PX)}
                note={`PNG, JPG, GIF or WebP, at most ${WATERMARK_MAX_UPLOAD_PX}×${WATERMARK_MAX_UPLOAD_PX} px (a square PNG with a transparent background works best).`}
              />
              {watermarkUrl && (
                <>
                  <fieldset className={styles.watermarkFieldset}>
                    <legend className={styles.watermarkLegend}>Where should it be shown on the image?</legend>
                    <div className={styles.watermarkPositionGrid}>
                      {WATERMARK_POSITIONS.map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          className={`${styles.watermarkPositionBtn} ${styles[`watermarkPos_${pos}`]} ${
                            watermarkPosition === pos ? styles.watermarkPositionBtnActive : ''
                          }`}
                          aria-pressed={watermarkPosition === pos}
                          onClick={() => setWatermarkPosition(pos)}
                        >
                          {WATERMARK_POSITION_LABELS[pos]}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className={styles.watermarkOpacityLabel}>
                    <span>
                      Watermark strength: <strong>{watermarkOpacity}%</strong>
                    </span>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      step={5}
                      value={watermarkOpacity}
                      onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                      className={styles.watermarkOpacityRange}
                    />
                    <span className={styles.watermarkOpacityScale}>
                      <span>Light (faint)</span>
                      <span>Dense (solid)</span>
                    </span>
                  </label>
                  <label className={styles.watermarkOpacityLabel}>
                    <span>
                      Watermark size (square):{' '}
                      <strong>
                        {watermarkSize}×{watermarkSize} px
                      </strong>{' '}
                      on the actual image
                    </span>
                    <input
                      type="range"
                      min={WATERMARK_MIN_SIZE_PX}
                      max={WATERMARK_MAX_SIZE_PX}
                      step={4}
                      value={watermarkSize}
                      onChange={(e) => setWatermarkSize(clampWatermarkSize(Number(e.target.value)))}
                      className={styles.watermarkOpacityRange}
                    />
                    <span className={styles.watermarkOpacityScale}>
                      <span>Small ({WATERMARK_MIN_SIZE_PX} px)</span>
                      <span>Large ({WATERMARK_MAX_SIZE_PX} px)</span>
                    </span>
                  </label>
                </>
              )}
            </div>
            <div className={styles.watermarkPreviewCol}>
              <div className={styles.watermarkLegend}>Preview on a sample image</div>
              <div className={styles.watermarkPreview}>
                {/* eslint-disable-next-line @next/next/no-img-element -- static sample */}
                <img src={WATERMARK_SAMPLE_IMAGE} alt="Sample" className={styles.watermarkPreviewImg} />
                <WatermarkOverlay
                  url={watermarkUrl}
                  position={watermarkPosition}
                  opacity={watermarkOpacity}
                  size={watermarkSize}
                />
              </div>
              {!watermarkUrl && (
                <p className={styles.watermarkHint}>Upload a watermark image to see how it will look.</p>
              )}
            </div>
          </div>
          <div className={styles.wizardActions}>
            <button type="button" onClick={() => setStep(2)} className={styles.btnSecondary}>
              Back
            </button>
            <button
              type="button"
              onClick={handleWatermarkNext}
              disabled={submitting}
              className={styles.btnPrimary}
            >
              {submitting ? 'Saving…' : 'Next: Planner & photographer'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className={styles.wizardStepWatermark}>
          <p className={styles.wizardStepDesc}>
            Optional. Add the event planner and the photographer shown in the mobile app. Leave a name blank to skip
            that person.
          </p>
          <div className={styles.teamGrid}>
            <EventTeamFields
              title="Event planner"
              description="The person planning this event."
              value={planner}
              onChange={setPlanner}
            />
            <EventTeamFields
              title="Photographer"
              description="The photographer covering this event."
              value={photographer}
              onChange={setPhotographer}
            />
          </div>
          <div className={styles.wizardActions}>
            <button type="button" onClick={() => setStep(3)} className={styles.btnSecondary}>
              Back
            </button>
            <button type="button" onClick={handleTeamNext} disabled={submitting} className={styles.btnPrimary}>
              {submitting ? 'Saving…' : 'Next: Explore mapping'}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className={styles.wizardStep3}>
          <p className={styles.wizardStepDesc}>
            Select explore items to link to this event. You can add a new category if needed.
          </p>
          <button
            type="button"
            onClick={() => setAddCategoryOpen(true)}
            className={styles.addCategoryBtn}
          >
            + Add new explore category
          </button>
          <div className={styles.exploreCategoriesList}>
            {exploreCategories.map((cat) => (
              <div key={cat.id} className={styles.exploreCategoryCard}>
                <div className={styles.exploreCategoryTitle}>{cat.title}</div>
                <div className={styles.exploreItemsList}>
                  {cat.explore_items.length === 0 ? (
                    <span className={styles.noItems}>No items in this category</span>
                  ) : (
                    cat.explore_items.map((item) => (
                      <label key={item.id} className={styles.exploreItemLabel}>
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => toggleExploreItem(item.id)}
                        />
                        {item.title}
                        {item.city || item.country ? ` (${[item.city, item.country].filter(Boolean).join(', ')})` : ''}
                      </label>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.wizardActions}>
            <button type="button" onClick={() => setStep(4)} className={styles.btnSecondary}>
              Back
            </button>
            <button
              type="button"
              onClick={handleExploreNext}
              disabled={submitting}
              className={styles.btnPrimary}
            >
              {submitting ? 'Saving…' : 'Next: Event highlights'}
            </button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className={styles.wizardStep4}>
          <p className={styles.wizardStepDesc}>
            Add event highlights. All fields are required: title, description, and image upload. Order is used for display.
          </p>
          <div className={styles.highlightsList}>
            {highlights.map((h, idx) => (
              <div key={idx} className={styles.highlightCard}>
                <div className={styles.highlightRow}>
                  <input
                    type="text"
                    placeholder="Title *"
                    value={h.title}
                    onChange={(e) =>
                      setHighlights((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                      )
                    }
                    className={styles.highlightInput}
                    maxLength={200}
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Order"
                    value={h.display_order ?? ''}
                    onChange={(e) =>
                      setHighlights((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                display_order:
                                  e.target.value === ''
                                    ? idx
                                    : parseInt(e.target.value, 10),
                              }
                            : x
                        )
                      )
                    }
                    className={styles.highlightOrder}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setHighlights((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className={styles.removeHighlightBtn}
                    aria-label="Remove highlight"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  placeholder="Description *"
                  value={h.description ?? ''}
                  onChange={(e) =>
                    setHighlights((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x))
                    )
                  }
                  className={styles.highlightInputFull}
                  maxLength={2000}
                  rows={2}
                  required
                />
                <div className={styles.highlightImageUpload}>
                  <ImageUploadField
                    label="Image *"
                    value={h.media_url ?? ''}
                    onChange={(url) =>
                      setHighlights((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, media_url: url } : x))
                      )
                    }
                    uploadPrefix="events"
                    required
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setHighlights((prev) => [
                ...prev,
                {
                  title: '',
                  description: '',
                  media_url: '',
                  media_type: 'image',
                  display_order: prev.length,
                },
              ])
            }
            className={styles.addHighlightBtn}
          >
            + Add highlight
          </button>
          <div className={styles.wizardActions}>
            <button type="button" onClick={() => setStep(5)} className={styles.btnSecondary}>
              Back
            </button>
            <button
              type="button"
              onClick={handleHighlightsNext}
              disabled={submitting}
              className={styles.btnPrimary}
            >
              {submitting ? 'Saving…' : 'Next: Event admins'}
            </button>
          </div>
        </div>
      )}

      {step === 7 && (
        <div className={styles.wizardStep5}>
          <p className={styles.wizardStepDesc}>
            Assign event admins (role: <strong>event_admin</strong>) who can manage this event.
          </p>

          {adminOptions.length === 0 ? (
            <div className={styles.adminEmpty}>No event admins found. Create users with role “Event Admin” first.</div>
          ) : (
            <div className={styles.adminList}>
              {adminOptions.map((u) => (
                <label key={u.id} className={styles.adminItem}>
                  <input
                    type="checkbox"
                    checked={selectedAdminIds.has(u.id)}
                    onChange={() => toggleAdmin(u.id)}
                  />
                  <span>
                    {u.full_name}{' '}
                    <span className={styles.adminMeta}>({u.email})</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className={styles.wizardActions}>
            <button type="button" onClick={() => setStep(6)} className={styles.btnSecondary}>
              Back
            </button>
            <button
              type="button"
              onClick={handleAdminsFinish}
              disabled={submitting}
              className={styles.btnPrimary}
            >
              {submitting ? 'Finishing…' : 'Finish'}
            </button>
          </div>
        </div>
      )}

      {organizerModalCtx && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="organizer-modal-title"
        >
          <div className={`${styles.modal} ${styles.modalCompact}`}>
            <div className={styles.modalHeader}>
              <h2 id="organizer-modal-title" className={styles.modalTitle}>
                Add organizer
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => !sessionModalSubmitting && setOrganizerModalCtx(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className={styles.modalSubtitle}>
              Creates an organizer for this event and selects them for this session.
            </p>
            {sessionModalError && <p className={styles.errorText}>{sessionModalError}</p>}
            <div className={styles.modalFormStack}>
              <label className={styles.modalFieldLabel}>
                Name *
                <input
                  type="text"
                  className={styles.modalTextInput}
                  value={organizerDraft.name}
                  onChange={(e) => setOrganizerDraft((d) => ({ ...d, name: e.target.value }))}
                  maxLength={200}
                  disabled={sessionModalSubmitting}
                />
              </label>
              <ImageUploadField
                compact
                label="Logo (optional)"
                uploadPrefix="events"
                value={organizerDraft.logo_url}
                onChange={(url) => setOrganizerDraft((d) => ({ ...d, logo_url: url }))}
              />
              <label className={styles.modalFieldLabel}>
                Contact email (optional)
                <input
                  type="email"
                  className={styles.modalTextInput}
                  value={organizerDraft.contact_email}
                  onChange={(e) => setOrganizerDraft((d) => ({ ...d, contact_email: e.target.value }))}
                  maxLength={150}
                  disabled={sessionModalSubmitting}
                />
              </label>
              <label className={styles.modalFieldLabel}>
                Phone (optional)
                <input
                  type="text"
                  className={styles.modalTextInput}
                  value={organizerDraft.contact_phone}
                  onChange={(e) => setOrganizerDraft((d) => ({ ...d, contact_phone: e.target.value }))}
                  maxLength={50}
                  disabled={sessionModalSubmitting}
                />
              </label>
              <label className={styles.modalFieldLabel}>
                Website (optional)
                <input
                  type="text"
                  className={styles.modalTextInput}
                  value={organizerDraft.website_url}
                  onChange={(e) => setOrganizerDraft((d) => ({ ...d, website_url: e.target.value }))}
                  maxLength={500}
                  disabled={sessionModalSubmitting}
                  placeholder="https://…"
                />
              </label>
            </div>
            <div className={styles.modalActionsRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={sessionModalSubmitting}
                onClick={() => setOrganizerModalCtx(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={sessionModalSubmitting || !organizerDraft.name.trim()}
                onClick={() => void submitOrganizerModal()}
              >
                {sessionModalSubmitting ? 'Saving…' : 'Add & select'}
              </button>
            </div>
          </div>
        </div>
      )}

      {offeringModalCtx && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="offering-modal-title"
        >
          <div className={`${styles.modal} ${styles.modalCompact}`}>
            <div className={styles.modalHeader}>
              <h2 id="offering-modal-title" className={styles.modalTitle}>
                Add offering
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => !sessionModalSubmitting && setOfferingModalCtx(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className={styles.modalSubtitle}>
              New tags are shared across all events and appear in this session&apos;s selection.
            </p>
            {sessionModalError && <p className={styles.errorText}>{sessionModalError}</p>}
            <div className={styles.modalFormStack}>
              <label className={styles.modalFieldLabel}>
                Title *
                <input
                  type="text"
                  className={styles.modalTextInput}
                  value={offeringDraft.title}
                  onChange={(e) => setOfferingDraft((d) => ({ ...d, title: e.target.value }))}
                  maxLength={200}
                  disabled={sessionModalSubmitting}
                />
              </label>
              <label className={styles.modalFieldLabel}>
                Description (optional)
                <textarea
                  className={styles.modalTextarea}
                  rows={3}
                  value={offeringDraft.description}
                  onChange={(e) => setOfferingDraft((d) => ({ ...d, description: e.target.value }))}
                  maxLength={2000}
                  disabled={sessionModalSubmitting}
                />
              </label>
            </div>
            <div className={styles.modalActionsRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={sessionModalSubmitting}
                onClick={() => setOfferingModalCtx(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={sessionModalSubmitting || !offeringDraft.title.trim()}
                onClick={() => void submitOfferingModal()}
              >
                {sessionModalSubmitting ? 'Saving…' : 'Create & select'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ExploreCategoryFormModal
        open={addCategoryOpen}
        mode="create"
        categoryId={null}
        onClose={() => setAddCategoryOpen(false)}
        onSuccess={handleAddCategorySuccess}
      />
    </>
  );
}
