import { overlayEventProfile, type UserEventProfileFields } from '@/lib/user-event-profile';
import prisma from '@/server/prisma';

export { overlayEventProfile, type UserEventProfileFields };

export async function getUserEventProfile(
  userId: string,
  eventId: string
): Promise<UserEventProfileFields | null> {
  const row = await prisma.user_event_profiles.findUnique({
    where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    select: { full_name: true, avatar_url: true, instagram_id: true },
  });
  return row;
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
    },
    update: {},
  });
}

export async function upsertUserEventProfile(
  userId: string,
  eventId: string,
  fields: Partial<UserEventProfileFields>
): Promise<UserEventProfileFields> {
  const data = {
    ...(fields.full_name !== undefined ? { full_name: fields.full_name } : {}),
    ...(fields.avatar_url !== undefined ? { avatar_url: fields.avatar_url } : {}),
    ...(fields.instagram_id !== undefined ? { instagram_id: fields.instagram_id } : {}),
  };
  return prisma.user_event_profiles.upsert({
    where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    create: {
      user_id: userId,
      event_id: eventId,
      full_name: fields.full_name ?? '',
      avatar_url: fields.avatar_url ?? null,
      instagram_id: fields.instagram_id ?? null,
    },
    update: data,
    select: { full_name: true, avatar_url: true, instagram_id: true },
  });
}
