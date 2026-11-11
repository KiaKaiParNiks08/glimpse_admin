import {
  looksLikeLinkedInValue,
  overlayEventProfile,
  resolveSocialLinks,
  type UserEventProfileFields,
} from '@/lib/user-event-profile';
import prisma from '@/server/prisma';

export { overlayEventProfile, type UserEventProfileFields };

const eventProfileSelect = {
  full_name: true,
  avatar_url: true,
  instagram_id: true,
  linkedin_url: true,
} as const;

export async function getUserEventProfile(
  userId: string,
  eventId: string
): Promise<UserEventProfileFields | null> {
  return prisma.user_event_profiles.findUnique({
    where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    select: eventProfileSelect,
  });
}

/** Empty row for a newly joined event. Does not copy another event's profile. */
export async function createEmptyUserEventProfile(userId: string, eventId: string): Promise<void> {
  await prisma.user_event_profiles.upsert({
    where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    create: {
      user_id: userId,
      event_id: eventId,
      full_name: '',
      avatar_url: null,
      instagram_id: null,
      linkedin_url: null,
    },
    update: {},
  });
}

export async function upsertUserEventProfile(
  userId: string,
  eventId: string,
  fields: Partial<UserEventProfileFields>
): Promise<UserEventProfileFields> {
  let clearLegacyLinkedInFallback = false;
  if (fields.linkedin_url === null && fields.instagram_id === undefined) {
    const existing = await prisma.user_event_profiles.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: eventId } },
      select: { instagram_id: true, linkedin_url: true },
    });
    if (existing && !existing.linkedin_url && looksLikeLinkedInValue(existing.instagram_id)) {
      clearLegacyLinkedInFallback = true;
    }
  }

  const data = {
    ...(fields.full_name !== undefined ? { full_name: fields.full_name } : {}),
    ...(fields.avatar_url !== undefined ? { avatar_url: fields.avatar_url } : {}),
    ...(fields.instagram_id !== undefined
      ? { instagram_id: fields.instagram_id }
      : clearLegacyLinkedInFallback
        ? { instagram_id: null }
        : {}),
    ...(fields.linkedin_url !== undefined ? { linkedin_url: fields.linkedin_url } : {}),
  };

  return prisma.user_event_profiles.upsert({
    where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    create: {
      user_id: userId,
      event_id: eventId,
      full_name: fields.full_name ?? '',
      avatar_url: fields.avatar_url ?? null,
      instagram_id: fields.instagram_id ?? null,
      linkedin_url: fields.linkedin_url ?? null,
    },
    update: data,
    select: eventProfileSelect,
  });
}

/**
 * Batch-load event-scoped profile overrides (`full_name`, `avatar_url`, `instagram_id`, `linkedin_url`)
 * for display on feed authors, comments, and likes, applying corporate LinkedIn-in-`instagram_id` read fallback.
 */
export async function getEventProfileMapForUsers(
  eventId: string | null | undefined,
  userIds: string[]
): Promise<Map<string, UserEventProfileFields>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, UserEventProfileFields>();
  if (!eventId || uniqueIds.length === 0) return map;

  const rows = await prisma.user_event_profiles.findMany({
    where: { event_id: eventId, user_id: { in: uniqueIds } },
    select: { user_id: true, ...eventProfileSelect },
  });
  for (const row of rows) {
    map.set(row.user_id, {
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      instagram_id: row.instagram_id,
      linkedin_url: row.linkedin_url,
    });
  }
  return map;
}

export function resolveAuthorUserWithEventProfile(
  user: {
    full_name: string;
    avatar_url: string | null;
    instagram_id: string | null;
    linkedin_url: string | null;
  },
  eventProfile?: UserEventProfileFields | null
): {
  full_name: string;
  avatar_url: string | null;
  instagram_id: string;
  linkedin_url: string;
} {
  const useEventProfile =
    eventProfile &&
    (Boolean(eventProfile.full_name?.trim()) ||
      eventProfile.avatar_url !== null ||
      eventProfile.instagram_id !== null ||
      eventProfile.linkedin_url !== null);

  const source = useEventProfile
    ? {
        full_name: eventProfile.full_name?.trim() || user.full_name,
        avatar_url: eventProfile.avatar_url ?? user.avatar_url,
        ...resolveSocialLinks(eventProfile),
      }
    : {
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        ...resolveSocialLinks(user),
      };

  return source;
}
