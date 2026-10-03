import { parseParams, parseQuery } from '@/lib/validations';
import { eventDetailsQuerySchema, eventIdPathSchema } from '@/lib/validations/events';
import { ok, notFound, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import {
  DEFAULT_CURRENT_HAPPENING_TITLE,
  DEFAULT_POST_EVENT_REPORT_TITLE,
  getEventPhase,
  getEventTimezone,
  getTodayYmd,
  isVisibleInPhase,
  toYmd,
  type PhaseFlags,
} from '@/lib/event-phase';
import { buildEventWatermark } from '@/lib/watermark';
import { getEventDetailsById, formatSessionTimeToHHmm } from '@/server/events';
import { getEventDaysByEventId } from '@/server/event-days';
import { getEventDayMediaByEventId } from '@/server/event-day-media';
import { getFavoritedItemIds } from '@/server/favorites';
import { getCurrentHappeningByEventId } from '@/server/current-happening';

/**
 * GET /api/events/[event_id]
 * Returns full event details plus the current phase (pre / ongoing / post, from start_date and end_date),
 * all sessions and the gallery media grouped as "All media" followed by one section per session.
 * `watermark`, `current_happening` and `post_event_report` are omitted when they have no data; the last two
 * are also omitted when the admin did not enable them for the current phase.
 * Admin tokens may pass ?phase= to preview another phase; ?viewer_user_id= adds is_favorite per media item.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ event_id: string }> }
) {
  try {
    const params = await context.params;
    const [path, err] = parseParams(params, eventIdPathSchema);
    if (err) return err;
    const [query, queryErr] = parseQuery(new URL(request.url).searchParams, eventDetailsQuerySchema);
    if (queryErr) return queryErr;

    const event = await getEventDetailsById(path.event_id);
    if (!event) return notFound('Event not found');

    const timezone = getEventTimezone();
    const today = getTodayYmd(timezone);
    const actualPhase = getEventPhase(toYmd(event.start_date), toYmd(event.end_date), today);
    const previewPhase = getAdminFromAuthorizationHeader(request) ? query.phase : undefined;
    const current = previewPhase ?? actualPhase;

    const [days, mediaRows] = await Promise.all([
      getEventDaysByEventId(event.id),
      getEventDayMediaByEventId(event.id),
    ]);

    const favorited = query.viewer_user_id
      ? await getFavoritedItemIds(query.viewer_user_id, 'day_media', mediaRows.map((m) => m.id))
      : null;
    const allMedia = mediaRows.map(({ media_key, ...m }) => ({
      ...m,
      ...(favorited && { is_favorite: favorited.has(m.id) }),
    }));
    const mediaBySession = new Map<string, typeof allMedia>();
    for (const m of allMedia) {
      if (!m.event_session_id) continue;
      const list = mediaBySession.get(m.event_session_id) ?? [];
      list.push(m);
      mediaBySession.set(m.event_session_id, list);
    }

    const event_sessions = days.flatMap((day) =>
      day.event_sessions
        .map((s) => ({
          ...s,
          start_time: formatSessionTimeToHHmm(s.start_time),
          end_time: formatSessionTimeToHHmm(s.end_time),
          date: day.date,
          event_day: { id: day.id, title: day.title, date: day.date },
          media_count: mediaBySession.get(s.id)?.length ?? 0,
        }))
        .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'))
    );

    const media_sections = [
      {
        key: 'all',
        title: 'All media',
        event_session_id: null,
        date: null,
        start_time: null,
        media_count: allMedia.length,
        media: allMedia,
      },
      ...event_sessions.map((s) => {
        const media = mediaBySession.get(s.id) ?? [];
        return {
          key: s.id,
          title: s.title,
          event_session_id: s.id,
          date: s.date,
          start_time: s.start_time,
          media_count: media.length,
          media,
        };
      }),
    ];

    const happeningFlags: PhaseFlags = {
      show_pre_event: event.current_happening_show_pre_event,
      show_ongoing_event: event.current_happening_show_ongoing_event,
      show_post_event: event.current_happening_show_post_event,
    };
    const reportFlags: PhaseFlags = {
      show_pre_event: event.post_event_pdf_show_pre_event,
      show_ongoing_event: event.post_event_pdf_show_ongoing_event,
      show_post_event: event.post_event_pdf_show_post_event,
    };

    const happeningItems = isVisibleInPhase(happeningFlags, current)
      ? (await getCurrentHappeningByEventId(event.id)).map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- photos: GET /api/events/current-happening/photos
          ({ happening_photos, ...item }) => item
        )
      : [];
    const current_happening =
      happeningItems.length > 0
        ? {
            title: event.current_happening_title?.trim() || DEFAULT_CURRENT_HAPPENING_TITLE,
            items: happeningItems,
          }
        : undefined;

    const post_event_report =
      event.post_event_pdf_url && isVisibleInPhase(reportFlags, current)
        ? {
            title: event.post_event_pdf_title?.trim() || DEFAULT_POST_EVENT_REPORT_TITLE,
            url: event.post_event_pdf_url,
            original_name: event.post_event_pdf_original_name,
            size: event.post_event_pdf_size,
            uploaded_at: event.post_event_pdf_uploaded_at,
          }
        : undefined;

    const watermark = buildEventWatermark(event) ?? undefined;

    /* eslint-disable @typescript-eslint/no-unused-vars -- returned as nested objects (only when shown) instead */
    const {
      watermark_url,
      watermark_position,
      watermark_opacity,
      watermark_size,
      current_happening_title,
      current_happening_show_pre_event,
      current_happening_show_ongoing_event,
      current_happening_show_post_event,
      post_event_pdf_url,
      post_event_pdf_original_name,
      post_event_pdf_size,
      post_event_pdf_uploaded_by,
      post_event_pdf_uploaded_at,
      post_event_pdf_title,
      post_event_pdf_show_pre_event,
      post_event_pdf_show_ongoing_event,
      post_event_pdf_show_post_event,
      event_cover_images,
      ...eventFields
    } = event;
    /* eslint-enable @typescript-eslint/no-unused-vars */

    return ok({
      data: {
        ...eventFields,
        cover_images: event.event_cover_images.map((c) => c.image_url),
        phase: { current, is_preview: previewPhase !== undefined, today, timezone },
        event_sessions,
        ...(watermark && { watermark }),
        media_sections,
        ...(current_happening && { current_happening }),
        ...(post_event_report && { post_event_report }),
      },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event details');
  }
}
