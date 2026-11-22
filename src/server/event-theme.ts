import prisma from '@/server/prisma';
import { getEventEffectiveEntitlements } from '@/server/access';
import {
  DEFAULT_APP_THEME,
  formatThemeResponse,
  CustomThemeEntitlementError,
  invalidateEventThemeCache,
  isEventThemeCached,
  getCachedEventTheme,
  setCachedEventTheme,
  type FormattedThemePayload,
} from '@/lib/theme-resolution';
import type { NormalizedEventThemeInput } from '@/lib/validations/event-theme';

export {
  CustomThemeEntitlementError,
  invalidateEventThemeCache,
  isEventThemeCached,
};

export interface PreviewAssets {
  event_title: string;
  cover_image: string | null;
  cover_images: string[];
  sample_session_cover: string | null;
  sample_gallery_image: string | null;
}

export interface EventThemeResult extends FormattedThemePayload {
  preview_assets: PreviewAssets;
}

/**
 * Retrieve the assigned theme for an event with plan entitlement enforcement.
 * If the event's plan does not include Custom App Themes, returns the default theme
 * with `custom_themes_enabled: false`.
 */
export async function getEventTheme(
  eventId: string,
  options?: { skipCache?: boolean }
): Promise<EventThemeResult | null> {
  if (!options?.skipCache) {
    const cached = getCachedEventTheme<EventThemeResult>(eventId);
    if (cached) {
      return cached;
    }
  }

  const [event, entitlements] = await Promise.all([
    prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        cover_image: true,
        app_theme_id: true,
        app_themes: {
          select: {
            id: true,
            name: true,
            primary_color: true,
            secondary_color: true,
            button_primary_color: true,
            button_secondary_color: true,
            created_at: true,
            updated_at: true,
          },
        },
        event_cover_images: {
          select: { image_url: true },
          orderBy: { display_order: 'asc' },
          take: 3,
        },
      },
    }),
    getEventEffectiveEntitlements(eventId),
  ]);

  if (!event) return null;

  const customThemesEnabled = entitlements.hasFeature('app_themes_manage');

  // Real preview assets from existing event data
  const [sampleSession, sampleMedia] = await Promise.all([
    prisma.event_sessions.findFirst({
      where: { event_days: { event_id: eventId }, event_session_bg_url: { not: null } },
      select: { event_session_bg_url: true },
    }),
    prisma.event_day_media.findFirst({
      where: { event_days: { event_id: eventId } },
      select: { media_url: true, thumbnail_url: true },
      orderBy: { created_at: 'desc' },
    }),
  ]);

  const previewAssets: PreviewAssets = {
    event_title: event.title,
    cover_image: event.cover_image ?? event.event_cover_images[0]?.image_url ?? null,
    cover_images: event.event_cover_images.map((c) => c.image_url),
    sample_session_cover: sampleSession?.event_session_bg_url ?? null,
    sample_gallery_image: sampleMedia?.thumbnail_url ?? sampleMedia?.media_url ?? null,
  };

  const formatted = formatThemeResponse({
    eventId,
    customThemesEnabled,
    themeRow: event.app_themes,
  });

  const result: EventThemeResult = {
    ...formatted,
    preview_assets: previewAssets,
  };

  setCachedEventTheme(eventId, result);

  return result;
}

/**
 * Create or update an event's theme colors.
 * Strictly verifies that the event's plan has `app_themes_manage` enabled.
 */
export async function saveEventTheme(
  eventId: string,
  input: NormalizedEventThemeInput,
  tenantOwnerId?: string | null
): Promise<EventThemeResult> {
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true, app_theme_id: true },
  });
  if (!event) {
    throw new Error('Event not found');
  }

  // 1. Enforce purchase entitlement
  const entitlements = await getEventEffectiveEntitlements(eventId);
  if (!entitlements.hasFeature('app_themes_manage')) {
    throw new CustomThemeEntitlementError();
  }

  // 2. Link existing preset theme OR create/update custom theme
  if (input.app_theme_id) {
    const preset = await prisma.app_themes.findUnique({
      where: { id: input.app_theme_id },
      select: { id: true, name: true },
    });
    if (!preset) throw new Error('Theme preset not found');

    await prisma.events.update({
      where: { id: eventId },
      data: {
        app_theme_id: preset.id,
        theme: preset.name,
      },
    });
  } else if (input.name && input.primary_color) {
    // If the event already has an app_theme_id, check if it is used by other events
    let themeIdToUse: string | null = null;
    if (event.app_theme_id) {
      const otherEventsCount = await prisma.events.count({
        where: { app_theme_id: event.app_theme_id, id: { not: eventId } },
      });
      if (otherEventsCount === 0) {
        // Dedicated to this event, update in place
        const updated = await prisma.app_themes.update({
          where: { id: event.app_theme_id },
          data: {
            name: input.name,
            primary_color: input.primary_color,
            secondary_color: input.secondary_color!,
            button_primary_color: input.button_primary_color!,
            button_secondary_color: input.button_secondary_color!,
          },
        });
        themeIdToUse = updated.id;
      }
    }

    if (!themeIdToUse) {
      // Create new dedicated theme for this event
      const created = await prisma.app_themes.create({
        data: {
          name: input.name,
          primary_color: input.primary_color,
          secondary_color: input.secondary_color!,
          button_primary_color: input.button_primary_color!,
          button_secondary_color: input.button_secondary_color!,
          tenant_owner_id: tenantOwnerId ?? null,
        },
      });
      themeIdToUse = created.id;
    }

    await prisma.events.update({
      where: { id: eventId },
      data: {
        app_theme_id: themeIdToUse,
        theme: input.name,
      },
    });
  }

  // 3. Invalidate cache
  invalidateEventThemeCache(eventId);

  const fresh = await getEventTheme(eventId, { skipCache: true });
  if (!fresh) throw new Error('Failed to load updated theme');
  return fresh;
}

/**
 * Remove custom theme from event and revert to default.
 */
export async function deleteEventTheme(eventId: string): Promise<EventThemeResult> {
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) throw new Error('Event not found');

  const entitlements = await getEventEffectiveEntitlements(eventId);
  if (!entitlements.hasFeature('app_themes_manage')) {
    throw new CustomThemeEntitlementError();
  }

  await prisma.events.update({
    where: { id: eventId },
    data: {
      app_theme_id: null,
      theme: null,
    },
  });

  invalidateEventThemeCache(eventId);

  const fresh = await getEventTheme(eventId, { skipCache: true });
  if (!fresh) throw new Error('Failed to load event theme');
  return fresh;
}
