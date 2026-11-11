import type { device_type } from '@prisma/client';
import { isWeddingCategory } from '@/lib/event-categories';
import {
  buildUserDeviceUpsertData,
  computeNeedsFcmTokenSync,
  extractPushTokenFromDevice,
  normalizeFcmToken,
} from '@/lib/push-device';
import prisma from '@/server/prisma';

export interface UpsertUserDeviceInput {
  user_id: string;
  device_type: device_type;
  device_id: string;
  fcm_token?: string | null;
}

export interface UpsertUserDeviceResult {
  has_fcm_token: boolean;
}

let userDevicesEnsured = false;
export async function ensureUserDevicesFcmColumn(): Promise<void> {
  if (userDevicesEnsured) return;
  try {
    await prisma.$queryRawUnsafe(`SELECT "fcm_token" FROM "user_devices" LIMIT 0`);
    userDevicesEnsured = true;
  } catch {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "fcm_token" TEXT`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "idx_user_devices_fcm_token" ON "user_devices" ("fcm_token")`
      );
    } catch {
      // Ignore concurrent DDL races
    }
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

export async function upsertUserDevice(
  input: UpsertUserDeviceInput
): Promise<UpsertUserDeviceResult> {
  await ensureUserDevicesFcmColumn();
  const { user_id, device_type, device_id, fcm_token } = input;
  const cleanDeviceId = device_id.trim();
  const payload = buildUserDeviceUpsertData({
    user_id,
    device_type,
    device_id: cleanDeviceId,
    fcm_token,
  });

  const saved = await prisma.user_devices.upsert({
    where: {
      user_id_device_id: {
        user_id,
        device_id: cleanDeviceId,
      },
    },
    update: payload.update,
    create: payload.create,
    select: {
      fcm_token: true,
      device_id: true,
    },
  });

  return {
    has_fcm_token: extractPushTokenFromDevice(saved) !== null,
  };
}

/**
 * Refresh fcm_token and reactivate device rows matching device_id when user_id is not yet resolved.
 */
export async function touchDeviceFcmTokenByDeviceId(
  deviceId: string,
  fcmToken: string
): Promise<void> {
  const cleanToken = normalizeFcmToken(fcmToken);
  const cleanDeviceId = deviceId.trim();
  if (!cleanToken || !cleanDeviceId) return;

  await ensureUserDevicesFcmColumn();
  const now = new Date();
  await prisma.user_devices.updateMany({
    where: { device_id: cleanDeviceId },
    data: {
      fcm_token: cleanToken,
      is_active: true,
      last_seen_at: now,
      updated_at: now,
    },
  });
}

/**
 * Check whether the mobile app should call POST /api/auth/fcm-token to sync a valid push token.
 */
export async function needsFcmTokenSyncForUser(
  userId: string,
  deviceId?: string | null
): Promise<boolean> {
  await ensureUserDevicesFcmColumn();
  const devices = await prisma.user_devices.findMany({
    where: {
      user_id: userId,
      ...(deviceId?.trim() ? { device_id: deviceId.trim() } : {}),
    },
    select: {
      device_id: true,
      fcm_token: true,
      is_active: true,
    },
  });
  return computeNeedsFcmTokenSync(devices, deviceId);
}

/**
 * Deactivate device registration(s) and clear push token(s) when a user explicitly logs out.
 */
export async function deactivateUserDevice(input: {
  user_id: string;
  device_id?: string | null;
}): Promise<void> {
  await ensureUserDevicesFcmColumn();
  const cleanDeviceId = input.device_id?.trim();
  await prisma.user_devices.updateMany({
    where: {
      user_id: input.user_id,
      ...(cleanDeviceId ? { device_id: cleanDeviceId } : {}),
    },
    data: {
      is_active: false,
      fcm_token: null,
      updated_at: new Date(),
    },
  });
}
