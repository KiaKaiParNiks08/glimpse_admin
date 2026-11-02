import type { device_type } from '@prisma/client';
import { isWeddingCategory } from '@/lib/event-categories';
import prisma from '@/server/prisma';

export interface UpsertUserDeviceInput {
  user_id: string;
  device_type: device_type;
  device_id: string;
  fcm_token?: string | null;
}

let userDevicesEnsured = false;
export async function ensureUserDevicesFcmColumn(): Promise<void> {
  if (userDevicesEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "user_devices"
        ADD COLUMN IF NOT EXISTS "fcm_token" TEXT;
      CREATE INDEX IF NOT EXISTS "idx_user_devices_fcm_token" ON "user_devices" ("fcm_token");
    `);
    userDevicesEnsured = true;
  } catch {
    userDevicesEnsured = true;
  }
}

/**
 * Create or update a user's device registration used for notifications.
 */
export type PreviousEventItem = {
  event_id: string;
  event_code: string;
  title: string;
  start_date: Date;
  end_date: Date;
  cover_image: string | null;
  status: string;
  event_type: string | null;
  show_wedding_side: boolean;
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
      event_code: true,
      title: true,
      start_date: true,
      end_date: true,
      cover_image: true,
      status: true,
      event_categories: { select: { slug: true, name: true } },
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
      event_code: event.event_code,
      title: event.title,
      start_date: event.start_date,
      end_date: event.end_date,
      cover_image: event.cover_image,
      status: event.status,
      event_type: event.event_categories.slug,
      show_wedding_side: isWeddingCategory(event.event_categories),
    });
  }
  return items;
}

export async function upsertUserDevice(input: UpsertUserDeviceInput): Promise<void> {
  await ensureUserDevicesFcmColumn();
  const { user_id, device_type, device_id, fcm_token } = input;
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
      updated_at: now,
      ...(fcm_token !== undefined ? { fcm_token: fcm_token ? fcm_token.trim() : null } : {}),
    },
    create: {
      user_id,
      device_type,
      device_id,
      fcm_token: fcm_token ? fcm_token.trim() : null,
      is_active: true,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    },
  });
}
