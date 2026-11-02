import { NextRequest } from 'next/server';
import { forbidden, ok, serverError, unauthorized } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import prisma from '@/server/prisma';

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromAuthorizationHeader(request);
    const admin = getAdminFromAuthorizationHeader(request);

    // Caller must be an authenticated app user or admin
    const userId = user?.id || admin?.id;
    if (!userId) {
      return unauthorized('Authentication required');
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));
    const isReadParam = searchParams.get('is_read');

    const where = {
      recipient_user_id: userId,
      is_deleted: false,
      ...(isReadParam === 'true'
        ? { is_read: true }
        : isReadParam === 'false'
        ? { is_read: false }
        : {}),
    };

    const [total, unreadCount, rows] = await Promise.all([
      prisma.notifications.count({ where }),
      prisma.notifications.count({
        where: {
          recipient_user_id: userId,
          is_deleted: false,
          is_read: false,
        },
      }),
      prisma.notifications.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          users_notifications_sender_user_idTousers: {
            select: {
              id: true,
              full_name: true,
              avatar_url: true,
            },
          },
        },
      }),
    ]);

    // Batch resolve event_id and post_id across referenced entities for accurate cross-event deep-linking
    const sessionIds = rows
      .filter((r) => r.reference_type === 'session' && r.reference_id)
      .map((r) => r.reference_id as string);
    const postRefIds = rows
      .filter(
        (r) =>
          (r.reference_type === 'post' ||
            r.reference_type === 'spotlight' ||
            r.reference_type === 'recognized_post') &&
          r.reference_id
      )
      .map((r) => r.reference_id as string);
    const commentRefIds = rows
      .filter((r) => (r.reference_type === 'comment' || r.reference_type === 'reply') && r.reference_id)
      .map((r) => r.reference_id as string);

    const [sessions, posts, comments] = await Promise.all([
      sessionIds.length > 0
        ? prisma.event_sessions.findMany({
            where: { id: { in: sessionIds } },
            select: { id: true, event_days: { select: { event_id: true } } },
          })
        : [],
      postRefIds.length > 0
        ? prisma.posts.findMany({
            where: { id: { in: postRefIds } },
            select: { id: true, event_id: true },
          })
        : [],
      commentRefIds.length > 0
        ? prisma.comments.findMany({
            where: { id: { in: commentRefIds } },
            select: {
              id: true,
              post_id: true,
              posts: { select: { event_id: true } },
            },
          })
        : [],
    ]);

    const sessionToEventId = new Map(sessions.map((s) => [s.id, s.event_days?.event_id ?? null]));
    const postToEventId = new Map(posts.map((p) => [p.id, p.event_id]));
    const commentToData = new Map(
      comments.map((c) => [c.id, { postId: c.post_id, eventId: c.posts?.event_id ?? null }])
    );

    // Build routing metadata for Flutter mobile navigation
    const data = rows.map((row) => {
      const sender = row.users_notifications_sender_user_idTousers
        ? {
            id: row.users_notifications_sender_user_idTousers.id,
            full_name: row.users_notifications_sender_user_idTousers.full_name,
            avatar_url: row.users_notifications_sender_user_idTousers.avatar_url,
          }
        : null;

      let screen = 'notifications';
      let routingType = String(row.notification_type);
      let eventId: string | null = user?.event_id ?? null;
      let eventSessionId: string | null = null;
      let postId: string | null = null;
      let commentId: string | null = null;

      if (row.reference_type === 'session') {
        screen = 'session_media';
        routingType = 'session_media_uploaded';
        eventSessionId = row.reference_id;
        if (row.reference_id && sessionToEventId.has(row.reference_id)) {
          eventId = sessionToEventId.get(row.reference_id) ?? eventId;
        }
      } else if (
        row.reference_type === 'post' ||
        row.reference_type === 'spotlight' ||
        row.reference_type === 'recognized_post'
      ) {
        screen = 'post_details';
        postId = row.reference_id;
        routingType =
          row.reference_type === 'spotlight'
            ? 'spotlight_post'
            : row.reference_type === 'recognized_post'
            ? 'recognized_post_liked'
            : row.notification_type === 'post_like'
            ? 'post_like'
            : 'new_post';
        if (row.reference_id && postToEventId.has(row.reference_id)) {
          eventId = postToEventId.get(row.reference_id) ?? eventId;
        }
      } else if (row.reference_type === 'comment' || row.reference_type === 'reply') {
        screen = 'post_details';
        commentId = row.reference_id;
        routingType = row.reference_type === 'reply' ? 'comment_reply' : 'post_comment';
        if (row.reference_id && commentToData.has(row.reference_id)) {
          const resolved = commentToData.get(row.reference_id);
          if (resolved?.postId) postId = resolved.postId;
          if (resolved?.eventId) eventId = resolved.eventId;
        }
      }

      return {
        id: row.id,
        title: row.title,
        message: row.message,
        notification_type: row.notification_type,
        reference_type: row.reference_type,
        reference_id: row.reference_id,
        is_read: row.is_read ?? false,
        created_at: row.created_at,
        sender,
        routing: {
          screen,
          type: routingType,
          event_id: eventId,
          event_session_id: eventSessionId,
          post_id: postId,
          comment_id: commentId,
        },
      };
    });

    return ok(
      {
        data,
        meta: {
          total,
          unread_count: unreadCount,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      200
    );
  } catch (err) {
    console.error('[notifications] GET /api/notifications error:', err);
    return serverError('Unable to fetch notifications');
  }
}
