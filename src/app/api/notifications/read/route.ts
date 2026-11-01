import { NextRequest } from 'next/server';
import { badRequest, ok, serverError, unauthorized } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import prisma from '@/server/prisma';

export async function PATCH(request: NextRequest) {
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
    } = {};

    try {
      body = await request.json();
    } catch {
      return badRequest('Invalid JSON body');
    }

    if (body.all) {
      const updateResult = await prisma.notifications.updateMany({
        where: {
          recipient_user_id: userId,
          is_read: false,
          is_deleted: false,
        },
        data: {
          is_read: true,
        },
      });

      return ok({ ok: true, updated_count: updateResult.count });
    }

    const ids: string[] = [];
    if (body.notification_id && typeof body.notification_id === 'string') {
      ids.push(body.notification_id);
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

    const updateResult = await prisma.notifications.updateMany({
      where: {
        id: { in: ids },
        recipient_user_id: userId,
        is_deleted: false,
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
