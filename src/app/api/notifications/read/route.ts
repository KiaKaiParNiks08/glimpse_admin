import { NextRequest } from 'next/server';
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import prisma from '@/server/prisma';

export async function handleMarkRead(request: NextRequest) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    const admin = getAdminFromAuthorizationHeader(request);

    const userId = user?.id || admin?.id;
    if (!userId) {
      return unauthorized('Authentication required');
    }

    let body: {
      notification_id?: string;
      notification_ids?: string[];
      all?: boolean;
      event_id?: string;
    } = {};

    try {
      body = await request.json();
    } catch {
      return badRequest('Invalid JSON body');
    }

    const bodyEventId = typeof body.event_id === 'string' ? body.event_id.trim() : null;
    const sessionEventId = user?.event_id;

    // Check conflict between body event_id and JWT session event_id
    if (bodyEventId && sessionEventId && bodyEventId !== sessionEventId) {
      return badRequest('Requested event_id conflicts with active session event');
    }

    const targetEventId = bodyEventId || sessionEventId || null;

    if (body.all) {
      const updateResult = await prisma.notifications.updateMany({
        where: {
          recipient_user_id: userId,
          is_read: false,
          is_deleted: false,
          ...(targetEventId ? { event_id: targetEventId } : {}),
        },
        data: {
          is_read: true,
        },
      });

      return ok({ ok: true, updated_count: updateResult.count });
    }

    const ids: string[] = [];
    if (body.notification_id && typeof body.notification_id === 'string') {
      const trimmed = body.notification_id.trim();
      if (trimmed) ids.push(trimmed);
    }
    if (Array.isArray(body.notification_ids)) {
      for (const id of body.notification_ids) {
        if (typeof id === 'string' && id.trim()) {
          ids.push(id.trim());
        }
      }
    }

    if (ids.length === 0) {
      return badRequest('Provide notification_id, notification_ids, or set all: true');
    }

    // Verify existing notifications belonging to this user
    const existing = await prisma.notifications.findMany({
      where: {
        id: { in: ids },
        recipient_user_id: userId,
        is_deleted: false,
      },
      select: {
        id: true,
        event_id: true,
      },
    });

    if (existing.length === 0) {
      return notFound('Notification not found');
    }

    // If caller has an event scope (targetEventId), verify all requested IDs belong to that event
    if (targetEventId) {
      const crossEvent = existing.find((n) => n.event_id !== targetEventId);
      if (crossEvent) {
        return forbidden('Cannot mark notification from another event as read');
      }
    }

    const matchingIds = existing.map((n) => n.id);
    const updateResult = await prisma.notifications.updateMany({
      where: {
        id: { in: matchingIds },
        recipient_user_id: userId,
        is_deleted: false,
        ...(targetEventId ? { event_id: targetEventId } : {}),
      },
      data: {
        is_read: true,
      },
    });

    return ok({ ok: true, updated_count: updateResult.count });
  } catch (err) {
    console.error('[notifications] PATCH /api/notifications/read error:', err);
    return serverError('Unable to mark notifications as read');
  }
}

export async function PATCH(request: NextRequest) {
  return handleMarkRead(request);
}

export async function POST(request: NextRequest) {
  return handleMarkRead(request);
}
