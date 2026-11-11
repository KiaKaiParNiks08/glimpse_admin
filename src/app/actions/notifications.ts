'use server';

import prisma from '@/server/prisma';
import {
  requireAdminContextFromCookies,
  buildAccessibleEventsWhere,
  canContextAccessEvent,
  type AdminAccessContext,
} from '@/server/access';
import { sendFcmPush } from '@/server/notifications/firebase-http';
import { appPublicOrigin } from '@/lib/app-share';
import { createPresignedGetUrl } from '@/lib/s3-presign';
import { isS3Configured } from '@/lib/upload';
import { storageKeyFromMediaUrl } from '@/server/people-media/storage';
import { extractPushTokenFromDevice } from '@/lib/push-device';

async function requireAdminSession(): Promise<
  | { ok: true; session: AdminAccessContext }
  | { ok: false; error: string }
> {
  const auth = await requireAdminContextFromCookies();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!auth.ctx.hasPermission('notifications.send')) {
    return { ok: false, error: 'Forbidden: push notifications are disabled for your role or plan' };
  }
  return { ok: true, session: auth.ctx };
}

export interface NotificationEventOption {
  id: string;
  title: string;
  event_code: string;
  status: string;
  cover_image: string | null;
  start_date: string;
  end_date: string;
}

export interface NotificationRecipientItem {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  raw_mobile: string;
  avatar_url: string | null;
  event_ids: string[];
  event_names: string[];
  joined_at: string | null;
  /** True only when the user has a valid FCM token ready to receive push notifications. */
  has_fcm_token: boolean;
  /** True if the user has logged in from any mobile device (even without an FCM token). */
  has_active_device: boolean;
  device_count: number;
  device_types: string[];
}

export type GetNotificationEventsResult =
  | { ok: true; data: NotificationEventOption[] }
  | { ok: false; error: string };

export type GetNotificationRecipientsResult =
  | {
      ok: true;
      data: NotificationRecipientItem[];
      summary: {
        totalGuests: number;
        reachableCount: number;
        loggedInWithoutTokenCount: number;
      };
    }
  | { ok: false; error: string };

export type SendPushNotificationResult =
  | {
      ok: true;
      data: {
        inAppCount: number;
        deviceTokensCount: number;
        pushSuccessCount: number;
        pushFailureCount: number;
        missingTokenUsersCount: number;
        failureSamples: string[];
      };
    }
  | { ok: false; error: string };

/**
 * Resolve an absolute HTTPS URL that FCM, Android, and iOS can download directly without auth.
 * When S3 is configured without CloudFront, converts /api/upload/signed?t=... into a direct
 * 7-day S3 Presigned GET URL so mobile push daemons download images quickly without hitting app proxies.
 */
async function resolvePushImageUrl(rawUrl: string | null): Promise<string | undefined> {
  const imageUrl = (rawUrl || '').trim();
  if (!imageUrl) return undefined;

  const storageKey = storageKeyFromMediaUrl(imageUrl);
  if (storageKey && !storageKey.startsWith('uploads/') && isS3Configured() && !process.env.S3_PUBLIC_BASE_URL) {
    try {
      return await createPresignedGetUrl(storageKey, 60 * 60 * 24 * 7);
    } catch (err) {
      console.warn('[notifications] Failed to presign push image URL, falling back to app origin:', err);
    }
  }

  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('/')) {
    return `${appPublicOrigin()}${imageUrl}`;
  }
  return undefined;
}

/**
 * Fetch events available to the admin for notifications.
 */
export async function getEventsForNotificationAction(): Promise<GetNotificationEventsResult> {
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const { session } = sessionRes;

  try {
    const accessWhere = buildAccessibleEventsWhere(session);
    const whereCondition: Record<string, unknown> = {
      status: { notIn: ['cancelled', 'archived'] },
      ...(Object.keys(accessWhere).length > 0 ? { AND: [accessWhere] } : {}),
    };

    const events = await prisma.events.findMany({
      where: whereCondition,
      select: {
        id: true,
        title: true,
        event_code: true,
        status: true,
        cover_image: true,
        start_date: true,
        end_date: true,
      },
      orderBy: [{ start_date: 'desc' }, { created_at: 'desc' }],
      take: 100,
    });

    const data: NotificationEventOption[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      event_code: e.event_code,
      status: e.status,
      cover_image: e.cover_image,
      start_date: e.start_date.toISOString(),
      end_date: e.end_date.toISOString(),
    }));

    return { ok: true, data };
  } catch (error) {
    console.error('[getEventsForNotificationAction]', error);
    return { ok: false, error: 'Unable to load events' };
  }
}

/**
 * Fetch guests who have logged in/joined the selected event(s), along with their active mobile device status.
 */
export async function getEventGuestsForNotificationAction(params: {
  eventIds: string[];
}): Promise<GetNotificationRecipientsResult> {
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const { session } = sessionRes;

  const eventIds = params.eventIds.filter(Boolean);
  if (eventIds.length === 0) {
    return {
      ok: true,
      data: [],
      summary: { totalGuests: 0, reachableCount: 0, loggedInWithoutTokenCount: 0 },
    };
  }

  try {
    const checks = await Promise.all(eventIds.map((id) => canContextAccessEvent(session, id)));
    if (checks.some((allowed) => !allowed)) {
      return { ok: false, error: 'Forbidden' };
    }

    const [guests, eventsList] = await Promise.all([
      prisma.event_guests.findMany({
        where: {
          event_id: { in: eventIds },
          users_event_guests_user_idTousers: {
            is_active: true,
            roles: { name: 'user' },
          },
        },
        select: {
          user_id: true,
          event_id: true,
          joined_at: true,
          users_event_guests_user_idTousers: {
            select: {
              id: true,
              full_name: true,
              email: true,
              mobile_number: true,
              country_code: true,
              avatar_url: true,
            },
          },
        },
        orderBy: { joined_at: 'desc' },
      }),
      prisma.events.findMany({
        where: { id: { in: eventIds } },
        select: { id: true, title: true, event_code: true },
      }),
    ]);

    const eventNameById = new Map(eventsList.map((e) => [e.id, e.title]));

    const userIds = [...new Set(guests.map((g) => g.user_id))];
    const devices =
      userIds.length === 0
        ? []
        : await prisma.user_devices.findMany({
            where: {
              user_id: { in: userIds },
              is_active: { not: false },
            },
            select: {
              user_id: true,
              device_type: true,
              fcm_token: true,
              device_id: true,
              last_seen_at: true,
            },
          });

    const devicesByUser = new Map<
      string,
      Array<{ device_type: string; has_fcm: boolean; last_seen_at: Date | null }>
    >();
    for (const dev of devices) {
      const list = devicesByUser.get(dev.user_id) ?? [];
      const hasFcm = extractPushTokenFromDevice(dev) !== null;
      list.push({
        device_type: dev.device_type,
        has_fcm: hasFcm,
        last_seen_at: dev.last_seen_at,
      });
      devicesByUser.set(dev.user_id, list);
    }

    const userMap = new Map<string, NotificationRecipientItem>();
    for (const g of guests) {
      const u = g.users_event_guests_user_idTousers;
      const userDevs = devicesByUser.get(u.id) ?? [];
      const hasActiveDevice = userDevs.length > 0;
      const hasFcmToken = userDevs.some((d) => d.has_fcm);
      const formattedMobile = [u.country_code, u.mobile_number].filter(Boolean).join(' ').trim();
      const rawMobile = (u.mobile_number || '').replace(/\D/g, '');

      const existing = userMap.get(u.id);
      if (existing) {
        if (!existing.event_ids.includes(g.event_id)) {
          existing.event_ids.push(g.event_id);
          existing.event_names.push(eventNameById.get(g.event_id) || 'Event');
        }
      } else {
        userMap.set(u.id, {
          id: u.id,
          full_name: u.full_name || 'Guest',
          email: u.email || '',
          mobile_number: formattedMobile,
          raw_mobile: rawMobile,
          avatar_url: u.avatar_url,
          event_ids: [g.event_id],
          event_names: [eventNameById.get(g.event_id) || 'Event'],
          joined_at: g.joined_at ? g.joined_at.toISOString() : null,
          has_fcm_token: hasFcmToken,
          has_active_device: hasActiveDevice,
          device_count: userDevs.length,
          device_types: [...new Set(userDevs.map((d) => d.device_type))],
        });
      }
    }

    const data = Array.from(userMap.values());
    const reachableCount = data.filter((d) => d.has_fcm_token).length;
    const loggedInWithoutTokenCount = data.filter((d) => d.has_active_device && !d.has_fcm_token).length;

    return {
      ok: true,
      data,
      summary: {
        totalGuests: data.length,
        reachableCount,
        loggedInWithoutTokenCount,
      },
    };
  } catch (error) {
    console.error('[getEventGuestsForNotificationAction]', error);
    return { ok: false, error: 'Unable to load event guests' };
  }
}

/**
 * Dispatch an admin push notification and in-app notification to selected users.
 */
export async function sendAdminPushNotificationAction(input: {
  eventIds: string[];
  userIds: string[];
  title: string;
  body: string;
  imageUrl?: string | null;
}): Promise<SendPushNotificationResult> {
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const { session } = sessionRes;

  const title = (input.title || '').trim();
  const body = (input.body || '').trim();
  const imageUrl = (input.imageUrl || '').trim() || null;
  const userIds = [...new Set((input.userIds || []).filter(Boolean))];
  const eventIds = [...new Set((input.eventIds || []).filter(Boolean))];

  if (!title) {
    return { ok: false, error: 'Notification title is required' };
  }
  if (!body) {
    return { ok: false, error: 'Notification message body is required' };
  }
  if (userIds.length === 0) {
    return { ok: false, error: 'Select at least one recipient user' };
  }
  if (eventIds.length === 0) {
    return { ok: false, error: 'Select at least one event' };
  }

  const primaryEventId = eventIds[0];

  try {
    const accessChecks = await Promise.all(eventIds.map((id) => canContextAccessEvent(session, id)));
    if (accessChecks.some((allowed) => !allowed)) {
      return { ok: false, error: 'Forbidden for one or more selected events' };
    }

    // Resolve which event each user belongs to among the selected events
    const guestEventRows = await prisma.event_guests.findMany({
      where: {
        user_id: { in: userIds },
        event_id: { in: eventIds },
      },
      select: {
        user_id: true,
        event_id: true,
      },
      orderBy: { joined_at: 'desc' },
    });

    const userEventMap = new Map<string, string>();
    for (const g of guestEventRows) {
      if (!userEventMap.has(g.user_id)) {
        userEventMap.set(g.user_id, g.event_id);
      }
    }

    // 1. Bulk record in-app notifications tied to each user's event
    await prisma.notifications.createMany({
      data: userIds.map((userId) => ({
        recipient_user_id: userId,
        sender_user_id: session.id,
        notification_type: 'event_update',
        reference_id: userEventMap.get(userId) || primaryEventId,
        reference_type: 'event',
        title,
        message: body,
      })),
    });

    // 2. Fetch active FCM device tokens for all selected users
    const devices = await prisma.user_devices.findMany({
      where: {
        user_id: { in: userIds },
        is_active: { not: false },
      },
      select: {
        user_id: true,
        device_id: true,
        fcm_token: true,
      },
    });

    // 3. Resolve direct HTTPS URL for FCM/APNs
    const fcmImageUrl = await resolvePushImageUrl(imageUrl);

    // 4. Group tokens by each user's target event & track users missing tokens
    const tokensByEventId = new Map<string, Set<string>>();
    const usersWithTokens = new Set<string>();
    for (const d of devices) {
      const token = extractPushTokenFromDevice(d);
      if (!token) continue;
      usersWithTokens.add(d.user_id);
      const targetEventId = userEventMap.get(d.user_id) || primaryEventId;
      if (!tokensByEventId.has(targetEventId)) {
        tokensByEventId.set(targetEventId, new Set());
      }
      tokensByEventId.get(targetEventId)!.add(token);
    }

    const missingTokenUsersCount = userIds.filter((uid) => !usersWithTokens.has(uid)).length;

    // 5. Dispatch FCM Push Notifications event-wise
    let pushSuccessCount = 0;
    let pushFailureCount = 0;
    let totalTokensCount = 0;
    const failureSamplesSet = new Set<string>();

    for (const [evtId, tokenSet] of tokensByEventId.entries()) {
      const tokens = Array.from(tokenSet);
      totalTokensCount += tokens.length;
      if (tokens.length === 0) continue;

      const pushRes = await sendFcmPush({
        tokens,
        notification: {
          title,
          body,
          ...(fcmImageUrl ? { image: fcmImageUrl } : {}),
        },
        data: {
          screen: 'notifications',
          type: 'announcement',
          event_id: evtId,
          ...(fcmImageUrl ? { image: fcmImageUrl, image_url: fcmImageUrl } : {}),
        },
      });

      pushSuccessCount += pushRes.successCount;
      pushFailureCount += pushRes.failureCount;
      for (const sample of pushRes.failureSamples ?? []) {
        if (failureSamplesSet.size < 5) failureSamplesSet.add(sample);
      }
    }

    return {
      ok: true,
      data: {
        inAppCount: userIds.length,
        deviceTokensCount: totalTokensCount,
        pushSuccessCount,
        pushFailureCount,
        missingTokenUsersCount,
        failureSamples: Array.from(failureSamplesSet),
      },
    };
  } catch (error) {
    console.error('[sendAdminPushNotificationAction]', error);
    return { ok: false, error: 'Failed to send notifications' };
  }
}
