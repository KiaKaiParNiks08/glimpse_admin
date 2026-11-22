import {
  looksLikeLinkedInValue,
  overlayEventProfile,
  resolveAuthorUserWithEventProfile,
  resolveSocialLinks,
  type UserEventProfileFields,
} from '@/lib/user-event-profile';
import prisma from '@/server/prisma';

export { overlayEventProfile, resolveAuthorUserWithEventProfile, type UserEventProfileFields };

const eventProfileSelect = {
  full_name: true,
  avatar_url: true,
  instagram_id: true,
  linkedin_url: true,
  is_instagram_visible: true,
  is_linkedin_visible: true,
  wedding_side: true,
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
    ...(fields.instagram_id !== undefined
      ? { instagram_id: fields.instagram_id }
      : clearLegacyLinkedInFallback
        ? { instagram_id: null }
        : {}),
    ...(fields.linkedin_url !== undefined ? { linkedin_url: fields.linkedin_url } : {}),
    ...(fields.is_instagram_visible !== undefined ? { is_instagram_visible: fields.is_instagram_visible } : {}),
    ...(fields.is_linkedin_visible !== undefined ? { is_linkedin_visible: fields.is_linkedin_visible } : {}),
    ...(fields.wedding_side !== undefined ? { wedding_side: fields.wedding_side } : {}),
  };

  return prisma.user_event_profiles.upsert({
    where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    create: {
      user_id: userId,
      event_id: eventId,
      full_name: fields.full_name ?? '',
      avatar_url: null,
      instagram_id: fields.instagram_id ?? null,
      linkedin_url: fields.linkedin_url ?? null,
      is_instagram_visible: fields.is_instagram_visible ?? true,
      is_linkedin_visible: fields.is_linkedin_visible ?? true,
      wedding_side: fields.wedding_side ?? null,
    },
    update: data,
    select: eventProfileSelect,
  });
}

/**
 * Batch-load event-scoped profile preferences (`full_name`, `instagram_id`, `linkedin_url`, `is_instagram_visible`, `is_linkedin_visible`, `wedding_side`)
 * for display on feed authors, comments, and likes.
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
      avatar_url: null,
      instagram_id: row.instagram_id,
      linkedin_url: row.linkedin_url,
      is_instagram_visible: row.is_instagram_visible,
      is_linkedin_visible: row.is_linkedin_visible,
      wedding_side: row.wedding_side,
    });
  }
  return map;
}
