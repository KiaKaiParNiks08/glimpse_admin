export type DeviceTokenCandidate = {
  fcm_token?: string | null;
  device_id?: string | null;
  is_active?: boolean | null;
};

/**
 * Normalize an incoming FCM registration token.
 * Blank strings, null, and undefined return undefined so callers never wipe an existing token by omission.
 */
export function normalizeFcmToken(token?: string | null): string | undefined {
  if (typeof token !== 'string') return undefined;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Extract a usable FCM push token from a user_devices row.
 * Prefers explicit fcm_token; falls back to legacy device_id values longer than 50 chars (ignoring UUIDs).
 */
export function extractPushTokenFromDevice(device: {
  fcm_token?: string | null;
  device_id?: string | null;
}): string | null {
  const fcm = normalizeFcmToken(device.fcm_token);
  if (fcm) return fcm;
  const dev = typeof device.device_id === 'string' ? device.device_id.trim() : '';
  return dev.length > 50 ? dev : null;
}

/**
 * Determine whether the mobile app needs to register/refresh its FCM token.
 * When deviceId is provided, checks that specific installation row so new installs self-heal immediately.
 */
export function computeNeedsFcmTokenSync(
  devices: DeviceTokenCandidate[],
  deviceId?: string | null
): boolean {
  const cleanDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';
  const relevant = cleanDeviceId
    ? devices.filter((d) => d.device_id?.trim() === cleanDeviceId)
    : devices;

  return !relevant.some(
    (d) => d.is_active !== false && extractPushTokenFromDevice(d) !== null
  );
}

/**
 * Build Prisma update/create payloads for user_devices upsert without overwriting existing tokens with null.
 */
export function buildUserDeviceUpsertData(input: {
  user_id: string;
  device_type: 'android' | 'ios' | 'web';
  device_id: string;
  fcm_token?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const cleanToken = normalizeFcmToken(input.fcm_token);
  return {
    update: {
      device_type: input.device_type,
      is_active: true,
      last_seen_at: now,
      updated_at: now,
      ...(cleanToken ? { fcm_token: cleanToken } : {}),
    },
    create: {
      user_id: input.user_id,
      device_type: input.device_type,
      device_id: input.device_id.trim(),
      fcm_token: cleanToken ?? null,
      is_active: true,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    },
  };
}

/**
 * Detect permanent FCM HTTP v1 token errors whose registration should be marked inactive.
 * Avoids deactivating healthy tokens on non-token payload validation errors (e.g. bad notification image URL).
 */
export function isPermanentInvalidFcmError(input: {
  errorCode?: number;
  errorStatus?: string;
  errorMessage?: string;
}): boolean {
  const code = input.errorCode;
  const status = (input.errorStatus || '').toUpperCase();
  const message = input.errorMessage || '';
  const upperMsg = message.toUpperCase();

  if (
    code === 404 ||
    status === 'NOT_FOUND' ||
    upperMsg.includes('UNREGISTERED') ||
    message.includes('registration-token-not-registered') ||
    message.includes('InvalidArgument') ||
    message.includes('not a valid FCM registration token')
  ) {
    return true;
  }

  return status === 'INVALID_ARGUMENT' && (upperMsg.includes('TOKEN') || upperMsg.includes('REGISTRATION'));
}
