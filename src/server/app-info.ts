import prisma from '@/server/prisma';
import { getEventEffectiveEntitlements } from '@/server/access';
import type { AppInfoQuery } from '@/lib/validations/app-info';
import { normalizeFcmToken } from '@/lib/push-device';
import {
  listPreviousEventsForDevice,
  listPreviousEventsForUsers,
  needsFcmTokenSyncForUser,
  touchDeviceFcmTokenByDeviceId,
  upsertUserDevice,
  type PreviousEventItem,
} from '@/server/user-devices';

export type AppInfoResult = {
  primary_color: string | null;
  secondary_color: string | null;
  button_primary_color: string | null;
  button_secondary_color: string | null;
  text_color?: string | null;
  body_text_color?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  buttonPrimaryColor?: string | null;
  buttonSecondaryColor?: string | null;
  textColor?: string | null;
  bodyTextColor?: string | null;
  event_status: string | null;
  allow_new_event_login: boolean;
  needs_fcm_token_sync: boolean;
  previous_events: Array<{
    event_id: string;
    title: string;
    start_date: Date;
    end_date: Date;
    cover_image: string | null;
    status: string;
  }>;
  app_configurations: Array<{
    platform: string;
    store_url: string;
    current_version: string | null;
    force_update: boolean | null;
  }>;
};

function mapPrevious(items: PreviousEventItem[]): AppInfoResult['previous_events'] {
  return items.map((item) => ({
    event_id: item.event_id,
    title: item.title,
    start_date: item.start_date,
    end_date: item.end_date,
    cover_image: item.cover_image,
    status: item.status,
  }));
}

async function getEventForAppInfo(eventId: string) {
  try {
    return await prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        app_themes: {
          select: {
            primary_color: true,
            secondary_color: true,
            button_primary_color: true,
            button_secondary_color: true,
            text_color: true,
            body_text_color: true,
          },
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('text_color') ||
      msg.includes('body_text_color') ||
      msg.includes('Unknown field') ||
      msg.includes('column')
    ) {
      const fallback = await prisma.events.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          status: true,
          app_themes: {
            select: {
              primary_color: true,
              secondary_color: true,
              button_primary_color: true,
              button_secondary_color: true,
            },
          },
        },
      });
      if (!fallback) return null;
      return {
        ...fallback,
        app_themes: fallback.app_themes
          ? {
              ...fallback.app_themes,
              text_color: '#FFFFFF',
              body_text_color: '#CBD5E1',
            }
          : null,
      };
    }
    throw err;
  }
}

/**
 * Theme colors for the event (from app_themes) plus store rows and events this device/user has joined.
 */
export async function getAppInfo(query: AppInfoQuery): Promise<AppInfoResult | null> {
  const [user, event, configs] = await Promise.all([
    query.user_id
      ? prisma.users.findUnique({ where: { id: query.user_id }, select: { id: true } })
      : Promise.resolve(null),
    query.event_id
      ? getEventForAppInfo(query.event_id)
      : Promise.resolve(null),
    prisma.app_configurations.findMany({
      where: {
        ...(query.platform && { platform: query.platform }),
      },
      select: {
        platform: true,
        store_url: true,
        current_version: true,
        force_update: true,
      },
      orderBy: { platform: 'asc' },
    }),
  ]);

  if (query.event_id && !event) return null;
  if (query.user_id && !user) return null;

  let previous_events: AppInfoResult['previous_events'] = [];
  let needs_fcm_token_sync = false;

  if (query.device_id) {
    previous_events = mapPrevious(await listPreviousEventsForDevice(query.device_id));

    // Passively register or refresh device & fcm_token only when non-empty; never wipe an existing token.
    const trimmedToken = normalizeFcmToken(query.fcm_token);
    if (query.user_id && user) {
      const dType = query.platform === 'ios' ? 'ios' : 'android';
      const deviceStatus = await upsertUserDevice({
        user_id: query.user_id,
        device_type: dType,
        device_id: query.device_id,
        fcm_token: trimmedToken,
      }).catch((e) => {
        console.warn('[getAppInfo] upsertUserDevice warning:', e);
        return null;
      });
      needs_fcm_token_sync = deviceStatus
        ? !deviceStatus.has_fcm_token
        : await needsFcmTokenSyncForUser(query.user_id, query.device_id);
    } else if (trimmedToken) {
      await touchDeviceFcmTokenByDeviceId(query.device_id, trimmedToken).catch((e) =>
        console.warn('[getAppInfo] updateMany fcm_token warning:', e)
      );
    }
  } else if (query.user_id && user) {
    const [prevRows, needsSync] = await Promise.all([
      listPreviousEventsForUsers([query.user_id]),
      needsFcmTokenSyncForUser(query.user_id),
    ]);
    previous_events = mapPrevious(prevRows);
    needs_fcm_token_sync = needsSync;
  }

  let customThemeAllowed = true;
  if (query.event_id) {
    const entitlements = await getEventEffectiveEntitlements(query.event_id);
    customThemeAllowed = entitlements.hasFeature('app_themes_manage');
  }

  const theme = customThemeAllowed ? event?.app_themes : null;
  const pColor = theme?.primary_color ?? null;
  const sColor = theme?.secondary_color ?? null;
  const bpColor = theme?.button_primary_color ?? null;
  const bsColor = theme?.button_secondary_color ?? null;
  const tColor = theme?.text_color ?? '#FFFFFF';
  const btColor = theme?.body_text_color ?? '#CBD5E1';

  return {
    primary_color: pColor,
    secondary_color: sColor,
    button_primary_color: bpColor,
    button_secondary_color: bsColor,
    text_color: tColor,
    body_text_color: btColor,
    primaryColor: pColor,
    secondaryColor: sColor,
    buttonPrimaryColor: bpColor,
    buttonSecondaryColor: bsColor,
    textColor: tColor,
    bodyTextColor: btColor,
    event_status: event?.status ?? null,
    allow_new_event_login: true,
    needs_fcm_token_sync,
    previous_events,
    app_configurations: configs,
  };
}
