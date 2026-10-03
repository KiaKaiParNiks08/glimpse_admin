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
