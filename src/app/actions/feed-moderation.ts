'use server';

import prisma from '@/server/prisma';
import { canContextAccessEvent, getEventEffectiveEntitlements, requireAdminContextFromCookies } from '@/server/access';
import { notifyPostModerated } from '@/server/notifications/service';
import type { post_status } from '@prisma/client';

export type PostModerationAuditItem = {
  id: string;
  post_id: string;
  event_id: string;
  action: string;
  reason: string | null;
  comment: string | null;
  created_at: string | null;
  moderator: {
    id: string;
    full_name: string;
    email: string;
  };
};

export type ModeratedPostItem = {
  id: string;
  event_id: string | null;
  user_id: string;
  caption: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  author: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
  media: Array<{
    id: string;
    media_type: string;
    media_url: string;
    thumbnail_url: string | null;
    media_width: number | null;
    media_height: number | null;
  }>;
  like_count: number;
  comment_count: number;
  latest_audit?: PostModerationAuditItem | null;
};

async function requireEventModeratorAccess(eventId: string) {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  const canAccess = await canContextAccessEvent(gate.ctx, eventId);
  if (!canAccess) return { ok: false as const, error: 'Forbidden' };

  const entitlements = await getEventEffectiveEntitlements(eventId);
  if (!entitlements.hasFeature('mobile_feed')) {
    return { ok: false as const, error: 'Social feed is not enabled for this event plan' };
  }

  return { ok: true as const, ctx: gate.ctx, entitlements };
}

export async function listEventPostsForModerationAction(
  eventId: string,
  options?: {
    status?: 'all' | 'active' | 'moderated';
    page?: number;
    limit?: number;
  }
): Promise<{
  ok: true;
  data: {
    posts: ModeratedPostItem[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
} | { ok: false; error: string }> {
  const access = await requireEventModeratorAccess(eventId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
    const skip = (page - 1) * limit;

    const statusFilter =
      options?.status === 'active'
        ? { status: 'active' as post_status }
        : options?.status === 'moderated'
        ? { status: 'moderated' as post_status }
        : { status: { in: ['active' as post_status, 'moderated' as post_status] } };

    const where = {
      event_id: eventId,
      ...statusFilter,
    };

    const [rows, total] = await Promise.all([
      prisma.posts.findMany({
        where,
        select: {
          id: true,
          event_id: true,
          user_id: true,
          caption: true,
          status: true,
          like_count: true,
          comment_count: true,
          created_at: true,
          updated_at: true,
          users: {
            select: {
              id: true,
              full_name: true,
              email: true,
              avatar_url: true,
            },
          },
          post_media: {
            select: {
              id: true,
              media_type: true,
              media_url: true,
              thumbnail_url: true,
              media_width: true,
              media_height: true,
            },
          },
          moderation_audits: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: {
              id: true,
              post_id: true,
              event_id: true,
              action: true,
              reason: true,
              comment: true,
              created_at: true,
              moderator: {
                select: {
                  id: true,
                  full_name: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.posts.count({ where }),
    ]);

    const posts: ModeratedPostItem[] = rows.map((r) => {
      const latest = r.moderation_audits[0];
      return {
        id: r.id,
        event_id: r.event_id,
        user_id: r.user_id,
        caption: r.caption,
        status: r.status ?? 'active',
        created_at: r.created_at ? r.created_at.toISOString() : null,
        updated_at: r.updated_at ? r.updated_at.toISOString() : null,
        author: {
          id: r.users.id,
          full_name: r.users.full_name,
          email: r.users.email,
          avatar_url: r.users.avatar_url,
        },
        media: r.post_media.map((pm) => ({
          id: pm.id,
          media_type: String(pm.media_type),
          media_url: pm.media_url,
          thumbnail_url: pm.thumbnail_url,
          media_width: pm.media_width,
          media_height: pm.media_height,
        })),
        like_count: r.like_count ?? 0,
        comment_count: r.comment_count ?? 0,
        latest_audit: latest
          ? {
              id: latest.id,
              post_id: latest.post_id,
              event_id: latest.event_id,
              action: latest.action,
              reason: latest.reason,
              comment: latest.comment,
              created_at: latest.created_at ? latest.created_at.toISOString() : null,
              moderator: {
                id: latest.moderator.id,
                full_name: latest.moderator.full_name,
                email: latest.moderator.email,
              },
            }
          : null,
      };
    });

    const total_pages = Math.max(1, Math.ceil(total / limit));
    return {
      ok: true,
      data: {
        posts,
        total,
        page,
        limit,
        total_pages,
      },
    };
  } catch (e: any) {
    console.error('[feed-moderation] listEventPostsForModerationAction error:', e);
    return { ok: false, error: e?.message || 'Failed to list posts' };
  }
}

export async function moderatePostAction(input: {
  eventId: string;
  postId: string;
  reason: string;
  comment?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await requireEventModeratorAccess(input.eventId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const post = await prisma.posts.findFirst({
      where: { id: input.postId, event_id: input.eventId },
      select: {
        id: true,
        user_id: true,
        status: true,
        events: { select: { id: true, title: true } },
      },
    });

    if (!post) {
      return { ok: false, error: 'Post not found on this event' };
    }

    await prisma.$transaction([
      prisma.posts.update({
        where: { id: post.id },
        data: { status: 'moderated', updated_at: new Date() },
      }),
      prisma.post_moderation_audits.create({
        data: {
          post_id: post.id,
          event_id: input.eventId,
          original_creator_id: post.user_id,
          moderator_user_id: access.ctx.id,
          action: 'moderated',
          reason: input.reason.trim(),
          comment: input.comment?.trim() || null,
          notification_sent: true,
        },
      }),
    ]);

    // Async notify creator
    notifyPostModerated({
      eventId: input.eventId,
      postId: post.id,
      creatorUserId: post.user_id,
      eventTitle: post.events?.title || 'Event',
      reason: input.reason.trim(),
      moderatedByUserId: access.ctx.id,
    }).catch((err) => {
      console.warn('[feed-moderation] notifyPostModerated non-fatal:', err);
    });

    return { ok: true };
  } catch (e: any) {
    console.error('[feed-moderation] moderatePostAction error:', e);
    return { ok: false, error: e?.message || 'Failed to moderate post' };
  }
}

export async function restorePostAction(input: {
  eventId: string;
  postId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await requireEventModeratorAccess(input.eventId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const post = await prisma.posts.findFirst({
      where: { id: input.postId, event_id: input.eventId },
      select: { id: true, user_id: true, status: true },
    });

    if (!post) {
      return { ok: false, error: 'Post not found on this event' };
    }

    await prisma.$transaction([
      prisma.posts.update({
        where: { id: post.id },
        data: { status: 'active', updated_at: new Date() },
      }),
      prisma.post_moderation_audits.create({
        data: {
          post_id: post.id,
          event_id: input.eventId,
          original_creator_id: post.user_id,
          moderator_user_id: access.ctx.id,
          action: 'restored',
          reason: 'Restored by admin',
          comment: null,
          notification_sent: false,
        },
      }),
    ]);

    return { ok: true };
  } catch (e: any) {
    console.error('[feed-moderation] restorePostAction error:', e);
    return { ok: false, error: e?.message || 'Failed to restore post' };
  }
}

export async function getPostModerationAuditsAction(input: {
  eventId: string;
  postId: string;
}): Promise<{ ok: true; data: PostModerationAuditItem[] } | { ok: false; error: string }> {
  const access = await requireEventModeratorAccess(input.eventId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const audits = await prisma.post_moderation_audits.findMany({
      where: { post_id: input.postId, event_id: input.eventId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        post_id: true,
        event_id: true,
        action: true,
        reason: true,
        comment: true,
        created_at: true,
        moderator: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
    });

    return {
      ok: true,
      data: audits.map((a) => ({
        id: a.id,
        post_id: a.post_id,
        event_id: a.event_id,
        action: a.action,
        reason: a.reason,
        comment: a.comment,
        created_at: a.created_at ? a.created_at.toISOString() : null,
        moderator: {
          id: a.moderator.id,
          full_name: a.moderator.full_name,
          email: a.moderator.email,
        },
      })),
    };
  } catch (e: any) {
    console.error('[feed-moderation] getPostModerationAuditsAction error:', e);
    return { ok: false, error: e?.message || 'Failed to fetch audits' };
  }
}
