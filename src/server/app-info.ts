import prisma from '@/server/prisma';
import type { AppInfoQuery } from '@/lib/validations/app-info';
import {
  listPreviousEventsForDevice,
  listPreviousEventsForUsers,
  type PreviousEventItem,
} from '@/server/user-devices';

export type AppInfoResult = {
  primary_color: string | null;
  secondary_color: string | null;
  button_primary_color: string | null;
  button_secondary_color: string | null;
  event_status: string | null;
  allow_new_event_login: boolean;
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

/**
 * Theme colors for the event (from app_themes) plus store rows and events this device/user has joined.
 */
export async function getAppInfo(query: AppInfoQuery): Promise<AppInfoResult | null> {
  const [user, event, configs] = await Promise.all([
    query.user_id
      ? prisma.users.findUnique({ where: { id: query.user_id }, select: { id: true } })
      : Promise.resolve(null),
    query.event_id
      ? prisma.events.findUnique({
          where: { id: query.event_id },
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
        })
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
  if (query.device_id) {
    previous_events = mapPrevious(await listPreviousEventsForDevice(query.device_id));
  } else if (query.user_id) {
    previous_events = mapPrevious(await listPreviousEventsForUsers([query.user_id]));
  }

  const theme = event?.app_themes;

  return {
    primary_color: theme?.primary_color ?? null,
    secondary_color: theme?.secondary_color ?? null,
    button_primary_color: theme?.button_primary_color ?? null,
    button_secondary_color: theme?.button_secondary_color ?? null,
    event_status: event?.status ?? null,
    allow_new_event_login: true,
    previous_events,
    app_configurations: configs,
  };
}
