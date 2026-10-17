import type { device_type } from '@prisma/client';
import prisma from '@/server/prisma';

export interface UpsertUserDeviceInput {
  user_id: string;
  device_type: device_type;
  device_id: string;
}

/**
 * Create or update a user's device registration used for notifications.
 */
export type PreviousEventItem = {
  event_id: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
  status: string;
};

export async function listPreviousEventsForDevice(deviceId: string): Promise<PreviousEventItem[]> {
  const devices = await prisma.user_devices.findMany({
    where: { device_id: deviceId },
    select: { user_id: true },
  });
  const userIds = [...new Set(devices.map((row) => row.user_id))];
  if (userIds.length === 0) return [];
  return listPreviousEventsForUsers(userIds);
}

export async function listPreviousEventsForUsers(userIds: string[]): Promise<PreviousEventItem[]> {
  if (userIds.length === 0) return [];
  const guests = await prisma.event_guests.findMany({
    where: { user_id: { in: userIds } },
    select: { event_id: true, joined_at: true },
    orderBy: { joined_at: 'desc' },
  });
  const eventIds = [...new Set(guests.map((row) => row.event_id))];
  if (eventIds.length === 0) return [];
  const events = await prisma.events.findMany({
    where: { id: { in: eventIds } },
    select: {
      id: true,
      title: true,
      start_date: true,
      end_date: true,
      cover_image: true,
      status: true,
    },
  });
  const byId = new Map(events.map((event) => [event.id, event]));
  const items: PreviousEventItem[] = [];
  const seen = new Set<string>();
  for (const guest of guests) {
    if (seen.has(guest.event_id)) continue;
    const event = byId.get(guest.event_id);
    if (!event) continue;
    seen.add(event.id);
    items.push({
      event_id: event.id,
      title: event.title,
      start_date: event.start_date,
      end_date: event.end_date,
      cover_image: event.cover_image,
      status: event.status,
    });
  }
  return items;
}

export async function upsertUserDevice(input: UpsertUserDeviceInput): Promise<void> {
  const { user_id, device_type, device_id } = input;
  const now = new Date();

  await prisma.user_devices.upsert({
    where: {
      user_id_device_id: {
        user_id,
        device_id,
      },
    },
    update: {
      device_type,
      is_active: true,
      last_seen_at: now,
    },
    create: {
      user_id,
      device_type,
      device_id,
      is_active: true,
      last_seen_at: now,
    },
  });
}
