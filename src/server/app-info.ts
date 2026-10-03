import prisma from '@/server/prisma';

export type AppInfoResult = {
  primary_color: string | null;
  secondary_color: string | null;
  button_primary_color: string | null;
  button_secondary_color: string | null;
  event_status: string | null;
  app_configurations: Array<{
    platform: string;
    store_url: string;
    current_version: string | null;
    force_update: boolean | null;
  }>;
};

/**
 * Theme colors for the event (from app_themes) plus app store rows with a fixed column set.
 */
export async function getAppInfo(eventId: string, userId: string, platform?: string): Promise<AppInfoResult | null> {
  const [user, event, configs] = await Promise.all([
    prisma.users.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.events.findUnique({
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
    }),
    prisma.app_configurations.findMany({
      where: {
        ...(platform && { platform }),
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

  if (!user || !event) return null;

  const theme = event.app_themes;

  return {
    primary_color: theme?.primary_color ?? null,
    secondary_color: theme?.secondary_color ?? null,
    button_primary_color: theme?.button_primary_color ?? null,
    button_secondary_color: theme?.button_secondary_color ?? null,
    event_status: event.status ?? null,
    app_configurations: configs,
  };
}
