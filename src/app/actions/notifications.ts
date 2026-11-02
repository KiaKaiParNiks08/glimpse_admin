'use server';

import prisma from '@/server/prisma';
import { getAdminSessionFromCookies, type AdminSessionUser } from '@/lib/admin-session';
import { getDeviceTokensForUsers } from '@/server/notifications/service';
import { sendFcmPush } from '@/server/notifications/firebase-http';

async function requireAdminSession(): Promise<
  | { ok: true; session: AdminSessionUser }
  | { ok: false; error: string }
> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  return { ok: true, session };
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
      };
    }
  | { ok: false; error: string };

/**
 * Fetch events available to the admin for notifications.
 */
export async function getEventsForNotificationAction(): Promise<GetNotificationEventsResult> {
  const sessionRes = await requireAdminSession();
  if (!sessionRes.ok) return { ok: false, error: sessionRes.error };
  const { session } = sessionRes;

  try {
    let whereCondition: Record<string, unknown> = {
      status: { notIn: ['cancelled', 'archived'] },
    };

    if (session.role_name === 'event_admin') {
      const assigned = await prisma.event_admins.findMany({
        where: { user_id: session.id },
        select: { event_id: true },
      });
      const assignedIds = assigned.map((a) => a.event_id);
      if (assignedIds.length === 0) {
        return { ok: true, data: [] };
      }
      whereCondition = {
        id: { in: assignedIds },
        ...whereCondition,
      };
    }

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

  const eventIds = params.eventIds.filter(Boolean);
  if (eventIds.length === 0) {
    return { ok: true, data: [], summary: { totalGuests: 0, reachableCount: 0 } };
  }

  try {
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
              is_active: true,
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
      const hasFcm = Boolean(dev.fcm_token?.trim() || (dev.device_id && dev.device_id.trim().length > 50));
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
      const hasActiveDevice = userDevs.some((d) => d.has_fcm);
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
          has_active_device: hasActiveDevice,
          device_count: userDevs.length,
          device_types: [...new Set(userDevs.map((d) => d.device_type))],
        });
      }
    }

    const data = Array.from(userMap.values());
    const reachableCount = data.filter((d) => d.has_active_device).length;

    return {
      ok: true,
      data,
      summary: {
        totalGuests: data.length,
        reachableCount,
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
    // 1. Bulk record in-app notifications
    await prisma.notifications.createMany({
      data: userIds.map((userId) => ({
        recipient_user_id: userId,
        sender_user_id: session.id,
        notification_type: 'event_update',
        reference_id: primaryEventId,
        reference_type: 'event',
        title,
        message: body,
      })),
    });

    // 2. Fetch active FCM device tokens for all selected users
    const tokens = await getDeviceTokensForUsers(userIds);

    // 3. Dispatch FCM Push Notifications
    let pushSuccessCount = 0;
    let pushFailureCount = 0;

    if (tokens.length > 0) {
      const pushRes = await sendFcmPush({
        tokens,
        notification: {
          title,
          body,
          ...(imageUrl ? { image: imageUrl } : {}),
        },
        data: {
          screen: 'notifications',
          type: 'announcement',
          event_id: primaryEventId,
          image_url: imageUrl || '',
        },
      });

      pushSuccessCount = pushRes.successCount;
      pushFailureCount = pushRes.failureCount;
    }

    return {
      ok: true,
      data: {
        inAppCount: userIds.length,
        deviceTokensCount: tokens.length,
        pushSuccessCount,
        pushFailureCount,
      },
    };
  } catch (error) {
    console.error('[sendAdminPushNotificationAction]', error);
    return { ok: false, error: 'Failed to send notifications' };
  }
}
