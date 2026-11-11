import { parseParams, parseQuery } from '@/lib/validations';
import { eventDetailsQuerySchema, eventIdPathSchema } from '@/lib/validations/events';
import { ok, notFound, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import {
  needsFcmTokenSyncForUser,
  touchDeviceFcmTokenByDeviceId,
  upsertUserDevice,
} from '@/server/user-devices';
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
import { sessionIdsViewerCanUpload } from '@/server/session-uploaders';
import { getEventTeam } from '@/server/event-team';
import { getEventEffectiveFeatures } from '@/server/access';

/**
 * GET /api/events/[event_id]
 * Returns full event details plus the current phase (pre / ongoing / post, from start_date and end_date),
 * all sessions and the gallery media grouped as "All media" followed by one section per session.
 * Features not included in the event owner's purchased plan (`enabled_features`) are automatically masked.
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

    const userFromToken = getUserFromAuthorizationHeader(request);
    const effectiveUserId = query.viewer_user_id || userFromToken?.id;
    const deviceTouchPromise: Promise<{ has_fcm_token: boolean } | null> =
      query.device_id && effectiveUserId
        ? upsertUserDevice({
            user_id: effectiveUserId,
            device_id: query.device_id,
            device_type: query.device_type || 'android',
            fcm_token: query.fcm_token,
          }).catch((e) => {
            console.warn('[events/[event_id]] upsertUserDevice warning:', e);
            return null;
          })
        : effectiveUserId
          ? needsFcmTokenSyncForUser(effectiveUserId)
              .then((needsSync) => ({ has_fcm_token: !needsSync }))
              .catch(() => null)
          : query.device_id && query.fcm_token
            ? touchDeviceFcmTokenByDeviceId(query.device_id, query.fcm_token)
                .then(() => null)
                .catch((e) => {
                  console.warn('[events/[event_id]] updateMany warning:', e);
                  return null;
                })
            : Promise.resolve(null);

    const [event, deviceStatus] = await Promise.all([
      getEventDetailsById(path.event_id),
      deviceTouchPromise,
    ]);
    if (!event) return notFound('Event not found');

    const timezone = getEventTimezone();
    const today = getTodayYmd(timezone);
    const actualPhase = getEventPhase(toYmd(event.start_date), toYmd(event.end_date), today);
    const previewPhase = getAdminFromAuthorizationHeader(request) ? query.phase : undefined;
    const current = previewPhase ?? actualPhase;

    const [days, mediaRows, team, enabledFeatures, rawHappening] = await Promise.all([
      getEventDaysByEventId(event.id),
      getEventDayMediaByEventId(event.id),
      getEventTeam(event.id),
      getEventEffectiveFeatures(event.id),
      getCurrentHappeningByEventId(event.id),
    ]);

    const sessionIds = days.flatMap((day) => day.event_sessions.map((s) => s.id));
    const admin = getAdminFromAuthorizationHeader(request);
    const isAdmin = Boolean(admin);
    const [favorited, canUploadIds] = await Promise.all([
      effectiveUserId && enabledFeatures.mobile_favorites
        ? getFavoritedItemIds(effectiveUserId, 'day_media', mediaRows.map((m) => m.id))
        : Promise.resolve(null),
      enabledFeatures.session_media_upload
        ? isAdmin
          ? Promise.resolve(new Set(sessionIds))
          : sessionIdsViewerCanUpload(sessionIds, effectiveUserId)
        : Promise.resolve(new Set<string>()),
    ]);

    const allMedia = mediaRows.map(({ media_key, uploaded_by, ...m }) => {
      const isOwner = Boolean(effectiveUserId && uploaded_by && uploaded_by === effectiveUserId);
      const canUploadThis = Boolean(
        enabledFeatures.session_media_upload &&
          m.event_session_id &&
          canUploadIds.has(m.event_session_id)
      );
      return {
        ...m,
        ...(favorited && { is_favorite: favorited.has(m.id) }),
        can_upload: canUploadThis,
        can_delete: Boolean(isAdmin || isOwner),
      };
    });
    const mediaBySession = new Map<string, typeof allMedia>();
    for (const m of allMedia) {
      if (!m.event_session_id) continue;
      const list = mediaBySession.get(m.event_session_id) ?? [];
      list.push(m);
      mediaBySession.set(m.event_session_id, list);
    }

    const can_upload_media = Boolean(enabledFeatures.session_media_upload && canUploadIds.size > 0);

    const event_sessions = enabledFeatures.event_sessions
      ? days.flatMap((day) =>
          day.event_sessions
            .map((s) => ({
              ...s,
              start_time: formatSessionTimeToHHmm(s.start_time),
              end_time: formatSessionTimeToHHmm(s.end_time),
              date: day.date,
              event_day: { id: day.id, title: day.title, date: day.date },
              media_count: mediaBySession.get(s.id)?.length ?? 0,
              can_upload: canUploadIds.has(s.id),
            }))
            .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'))
        )
      : [];

    const media_sections = [
      {
        key: 'all',
        title: 'All media',
        event_session_id: null,
        date: null,
        start_time: null,
        media_count: allMedia.length,
        media: allMedia,
        can_upload: can_upload_media,
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
          can_upload: s.can_upload,
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

    const happeningItems =
      enabledFeatures.event_current_happening && isVisibleInPhase(happeningFlags, current)
        ? rawHappening.map((item) => ({
            ...item,
            photo_count: item.happening_photos.length,
          }))
        : [];
    const current_happening =
      happeningItems.length > 0
        ? {
            title: event.current_happening_title?.trim() || DEFAULT_CURRENT_HAPPENING_TITLE,
            items: happeningItems,
          }
        : undefined;

    const post_event_report =
      enabledFeatures.event_post_report &&
      event.post_event_pdf_url &&
      isVisibleInPhase(reportFlags, current)
        ? {
            title: event.post_event_pdf_title?.trim() || DEFAULT_POST_EVENT_REPORT_TITLE,
            url: event.post_event_pdf_url,
            original_name: event.post_event_pdf_original_name,
            size: event.post_event_pdf_size,
            uploaded_at: event.post_event_pdf_uploaded_at,
            thumbnail_url: event.post_event_pdf_thumbnail_url ?? null,
          }
        : undefined;

    const watermark = enabledFeatures.event_watermark ? buildEventWatermark(event) ?? undefined : undefined;

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
      post_event_pdf_thumbnail_url,
      post_event_pdf_thumbnail_key,
      event_cover_images,
      ...eventFields
    } = event;
    /* eslint-enable @typescript-eslint/no-unused-vars */

    const visibleTeam = enabledFeatures.event_team ? team : null;
    const fallbackOrganizers =
      event.event_organizers && event.event_organizers.length > 0
        ? event.event_organizers
        : visibleTeam?.planner
        ? [
            {
              id: 'event-planner',
              name: visibleTeam.planner.name,
              logo_url: visibleTeam.planner.image_url ?? '',
              contact_email: visibleTeam.planner.email ?? '',
              contact_phone: visibleTeam.planner.phone ?? '',
              website_url: '',
            },
          ]
        : [];

    const res = ok({
      data: {
        ...eventFields,
        event_organizers: fallbackOrganizers,
        event_team: visibleTeam,
        event_planner: visibleTeam?.planner ?? null,
        photographer: visibleTeam?.photographer ?? null,
        cover_images: event.event_cover_images.map((c) => c.image_url),
        phase: { current, is_preview: previewPhase !== undefined, today, timezone },
        event_sessions,
        can_upload_media,
        enabled_features: enabledFeatures,
        ...(deviceStatus !== null && { needs_fcm_token_sync: !deviceStatus.has_fcm_token }),
        ...(watermark && { watermark }),
        media_sections,
        ...(current_happening && { current_happening }),
        ...(post_event_report && { post_event_report }),
      },
    });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch event details');
  }
}
