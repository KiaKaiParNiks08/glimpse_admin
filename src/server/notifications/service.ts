import type { notification_type } from '@prisma/client';
import { extractPushTokenFromDevice } from '@/lib/push-device';
import { getEventEffectiveFeatures } from '@/server/access';
import prisma from '@/server/prisma';
import { sendFcmPush } from './firebase-http';

/**
 * Get active FCM device tokens for a given set of user IDs.
 * Prefers fcm_token; falls back to device_id only if it looks like an FCM token (> 50 chars)
 * rather than an installation UUID.
 */
export async function getDeviceTokensForUsers(userIds: string[]): Promise<string[]> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const devices = await prisma.user_devices.findMany({
    where: {
      user_id: { in: uniqueIds },
      is_active: { not: false },
    },
    select: {
      device_id: true,
      fcm_token: true,
    },
  });

  const tokens = devices
    .map((d) => extractPushTokenFromDevice(d))
    .filter((token): token is string => Boolean(token));

  return [...new Set(tokens)];
}

/**
 * Send FCM push notifications only if the event's purchased plan allows push_notifications.
 */
async function dispatchEventPush(input: {
  eventId?: string | null;
  userIds: string[];
  notification: { title: string; body: string; image?: string };
  data?: Record<string, string>;
}): Promise<void> {
  if (input.userIds.length === 0) return;
  if (input.eventId) {
    const features = await getEventEffectiveFeatures(input.eventId);
    if (!features.push_notifications) return;
  }

  const tokens = await getDeviceTokensForUsers(input.userIds);
  if (tokens.length > 0) {
    await sendFcmPush({
      tokens,
      notification: input.notification,
      data: input.data,
    });
  }
}

interface InAppNotificationInput {
  recipient_user_id: string;
  sender_user_id?: string | null;
  notification_type: notification_type;
  reference_id?: string | null;
  reference_type?: string | null;
  title: string;
  message: string;
}

/**
 * Persist an in-app notification record.
 */
async function recordNotification(input: InAppNotificationInput) {
  try {
    return await prisma.notifications.create({
      data: {
        recipient_user_id: input.recipient_user_id,
        sender_user_id: input.sender_user_id ?? null,
        notification_type: input.notification_type,
        reference_id: input.reference_id ?? null,
        reference_type: input.reference_type ?? null,
        title: input.title,
        message: input.message,
      },
    });
  } catch (error) {
    console.error('[notifications] Failed to record in-app notification:', error);
    return null;
  }
}

/**
 * Persist multiple in-app notification records in bulk.
 */
async function recordNotificationsBulk(inputs: InAppNotificationInput[]) {
  if (inputs.length === 0) return;
  try {
    await prisma.notifications.createMany({
      data: inputs.map((input) => ({
        recipient_user_id: input.recipient_user_id,
        sender_user_id: input.sender_user_id ?? null,
        notification_type: input.notification_type,
        reference_id: input.reference_id ?? null,
        reference_type: input.reference_type ?? null,
        title: input.title,
        message: input.message,
      })),
    });
  } catch (error) {
    console.error('[notifications] Failed to bulk record notifications:', error);
  }
}

// ---------------------------------------------------------------------------
// 1. Session Media Uploaded: Case A (Broadcast to all guests)
// ---------------------------------------------------------------------------
export interface SessionMediaUploadBroadcastInput {
  eventId: string;
  eventSessionId: string;
  count: number;
  uploaderUserId?: string | null;
}

export async function notifySessionMediaUploaded(input: SessionMediaUploadBroadcastInput): Promise<void> {
  const { eventId, eventSessionId, count, uploaderUserId } = input;
  if (count <= 0) return;

  try {
    const session = await prisma.event_sessions.findUnique({
      where: { id: eventSessionId },
      select: {
        id: true,
        title: true,
      },
    });

    const sessionName = session?.title || 'Event';
    const title = 'New Media Uploaded 📸';
    const body = `${count} media files uploaded to the ${sessionName} session. Check them out!`;

    // Fetch all guests in the event except the uploader
    const guests = await prisma.event_guests.findMany({
      where: {
        event_id: eventId,
        ...(uploaderUserId ? { user_id: { not: uploaderUserId } } : {}),
      },
      select: { user_id: true },
    });

    if (guests.length === 0) return;
    const recipientUserIds = guests.map((g) => g.user_id);

    // Save in-app notification records for all recipients
    await recordNotificationsBulk(
      recipientUserIds.map((userId) => ({
        recipient_user_id: userId,
        sender_user_id: uploaderUserId ?? null,
        notification_type: 'event_update',
        reference_id: eventSessionId,
        reference_type: 'session',
        title,
        message: body,
      }))
    );

    // Dispatch FCM push (gated by plan feature push_notifications)
    await dispatchEventPush({
      eventId,
      userIds: recipientUserIds,
      notification: { title, body },
      data: {
        screen: 'session_media',
        type: 'session_media_uploaded',
        event_id: eventId,
        event_session_id: eventSessionId,
      },
    });
  } catch (err) {
    console.error('[notifications] Error in notifySessionMediaUploaded:', err);
  }
}

// ---------------------------------------------------------------------------
// 1. Session Media Uploaded: Case B (Face Match complete for specific user)
// ---------------------------------------------------------------------------
export interface SessionFaceRecognizedInput {
  eventId: string;
  eventSessionId: string;
  userId: string;
  recognizedCount: number;
  totalCount?: number;
}

export async function notifySessionFaceRecognized(input: SessionFaceRecognizedInput): Promise<void> {
  const { eventId, eventSessionId, userId, recognizedCount, totalCount } = input;
  if (recognizedCount <= 0) return;

  try {
    const session = await prisma.event_sessions.findUnique({
      where: { id: eventSessionId },
      select: { title: true },
    });
    const sessionName = session?.title || 'Event';

    // Count session total if not provided
    let total = totalCount;
    if (typeof total !== 'number') {
      total = await prisma.event_day_media.count({
        where: { event_session_id: eventSessionId },
      });
    }

    const title = 'New Media Uploaded 📸';
    const body = `${total} media files uploaded to the ${sessionName} session. You have been recognized in ${recognizedCount} media files.`;

    await recordNotification({
      recipient_user_id: userId,
      notification_type: 'event_update',
      reference_id: eventSessionId,
      reference_type: 'session',
      title,
      message: body,
    });

    await dispatchEventPush({
      eventId,
      userIds: [userId],
      notification: { title, body },
      data: {
        screen: 'session_media',
        type: 'session_media_uploaded',
        event_id: eventId,
        event_session_id: eventSessionId,
        recognized_count: String(recognizedCount),
      },
    });
  } catch (err) {
    console.error('[notifications] Error in notifySessionFaceRecognized:', err);
  }
}

// ---------------------------------------------------------------------------
// 2 & 7. Post Liked (#2) & Post Liked With Recognized Person (#7)
// ---------------------------------------------------------------------------
export interface PostLikedInput {
  postId: string;
  likerUserId: string;
}

export async function notifyPostLiked(input: PostLikedInput): Promise<void> {
  const { postId, likerUserId } = input;

  try {
    const [post, liker] = await Promise.all([
      prisma.posts.findUnique({
        where: { id: postId },
        select: {
          id: true,
          user_id: true,
          event_id: true,
          post_media: {
            select: {
              media_assets: {
                select: {
                  media_matches: {
                    select: { user_id: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.users.findUnique({
        where: { id: likerUserId },
        select: { id: true, full_name: true },
      }),
    ]);

    if (!post) return;
    const likerName = liker?.full_name || 'Someone';

    // 2. Notify Post Author (Someone liked your post ❤️)
    if (post.user_id !== likerUserId) {
      const authorTitle = 'Someone liked your post ❤️';
      const authorBody = `${likerName} liked your post.`;

      await recordNotification({
        recipient_user_id: post.user_id,
        sender_user_id: likerUserId,
        notification_type: 'post_like',
        reference_id: postId,
        reference_type: 'post',
        title: authorTitle,
        message: authorBody,
      });

      await dispatchEventPush({
        eventId: post.event_id,
        userIds: [post.user_id],
        notification: { title: authorTitle, body: authorBody },
        data: {
          screen: 'post_details',
          type: 'post_like',
          event_id: post.event_id ?? '',
          post_id: postId,
        },
      });
    }

    // 7. Notify Recognized People In That Post (Your Post Got Some Love ❤️)
    const recognizedUserIds = new Set<string>();
    for (const pm of post.post_media) {
      if (pm.media_assets?.media_matches) {
        for (const mm of pm.media_assets.media_matches) {
          if (mm.user_id && mm.user_id !== likerUserId && mm.user_id !== post.user_id) {
            recognizedUserIds.add(mm.user_id);
          }
        }
      }
    }

    if (recognizedUserIds.size > 0) {
      const recognizedTitle = 'Your Post Got Some Love ❤️';
      const recognizedBody = `${likerName} liked your post, where you've been recognized.`;
      const recognizedList = [...recognizedUserIds];

      await recordNotificationsBulk(
        recognizedList.map((userId) => ({
          recipient_user_id: userId,
          sender_user_id: likerUserId,
          notification_type: 'post_like',
          reference_id: postId,
          reference_type: 'recognized_post',
          title: recognizedTitle,
          message: recognizedBody,
        }))
      );

      await dispatchEventPush({
        eventId: post.event_id,
        userIds: recognizedList,
        notification: { title: recognizedTitle, body: recognizedBody },
        data: {
          screen: 'post_details',
          type: 'recognized_post_liked',
          event_id: post.event_id ?? '',
          post_id: postId,
        },
      });
    }
  } catch (err) {
    console.error('[notifications] Error in notifyPostLiked:', err);
  }
}

// ---------------------------------------------------------------------------
// 3 & 4. New Comment (#3) & New Reply (#4)
// ---------------------------------------------------------------------------
export interface CommentAddedInput {
  postId: string;
  commentId: string;
  commentText: string;
  authorUserId: string;
  parentCommentId?: string | null;
}

export async function notifyCommentAdded(input: CommentAddedInput): Promise<void> {
  const { postId, commentId, commentText, authorUserId, parentCommentId } = input;

  try {
    const [author, post] = await Promise.all([
      prisma.users.findUnique({
        where: { id: authorUserId },
        select: { id: true, full_name: true },
      }),
      prisma.posts.findUnique({
        where: { id: postId },
        select: { id: true, user_id: true, event_id: true },
      }),
    ]);

    if (!post) return;
    const authorName = author?.full_name || 'Someone';
    const preview = commentText.length > 80 ? commentText.slice(0, 77) + '...' : commentText;

    if (parentCommentId) {
      // 4. Comment Reply (New Reply 💬)
      const parentComment = await prisma.comments.findUnique({
        where: { id: parentCommentId },
        select: { user_id: true },
      });

      if (parentComment && parentComment.user_id !== authorUserId) {
        const replyTitle = 'New Reply 💬';
        const replyBody = `${authorName} replied to your comment: "${preview}"`;

        await recordNotification({
          recipient_user_id: parentComment.user_id,
          sender_user_id: authorUserId,
          notification_type: 'post_comment',
          reference_id: commentId,
          reference_type: 'reply',
          title: replyTitle,
          message: replyBody,
        });

        await dispatchEventPush({
          eventId: post.event_id,
          userIds: [parentComment.user_id],
          notification: { title: replyTitle, body: replyBody },
          data: {
            screen: 'post_details',
            type: 'comment_reply',
            event_id: post.event_id ?? '',
            post_id: postId,
            comment_id: commentId,
            parent_comment_id: parentCommentId,
          },
        });
      }
    } else {
      // 3. Top-level Comment (New Comment 💬)
      if (post.user_id !== authorUserId) {
        const commentTitle = 'New Comment 💬';
        const commentBody = `${authorName} commented on your post: "${preview}"`;

        await recordNotification({
          recipient_user_id: post.user_id,
          sender_user_id: authorUserId,
          notification_type: 'post_comment',
          reference_id: commentId,
          reference_type: 'comment',
          title: commentTitle,
          message: commentBody,
        });

        await dispatchEventPush({
          eventId: post.event_id,
          userIds: [post.user_id],
          notification: { title: commentTitle, body: commentBody },
          data: {
            screen: 'post_details',
            type: 'post_comment',
            event_id: post.event_id ?? '',
            post_id: postId,
            comment_id: commentId,
          },
        });
      }
    }
  } catch (err) {
    console.error('[notifications] Error in notifyCommentAdded:', err);
  }
}

// ---------------------------------------------------------------------------
// 5. New Post in Event (#5)
// ---------------------------------------------------------------------------
export interface NewPostInEventInput {
  postId: string;
  eventId: string;
  authorUserId: string;
}

export async function notifyNewPostInEvent(input: NewPostInEventInput): Promise<void> {
  const { postId, eventId, authorUserId } = input;

  try {
    const [author, event, guests] = await Promise.all([
      prisma.users.findUnique({
        where: { id: authorUserId },
        select: { id: true, full_name: true },
      }),
      prisma.events.findUnique({
        where: { id: eventId },
        select: { id: true, title: true },
      }),
      prisma.event_guests.findMany({
        where: {
          event_id: eventId,
          user_id: { not: authorUserId },
        },
        select: { user_id: true },
      }),
    ]);

    if (!event || guests.length === 0) return;
    const authorName = author?.full_name || 'Someone';
    const eventName = event.title || 'the event';

    const title = 'New Post 📸';
    const body = `${authorName} shared a new post in ${eventName}. Check it out!`;
    const recipientUserIds = guests.map((g) => g.user_id);

    await recordNotificationsBulk(
      recipientUserIds.map((userId) => ({
        recipient_user_id: userId,
        sender_user_id: authorUserId,
        notification_type: 'general',
        reference_id: postId,
        reference_type: 'post',
        title,
        message: body,
      }))
    );

    await dispatchEventPush({
      eventId,
      userIds: recipientUserIds,
      notification: { title, body },
      data: {
        screen: 'post_details',
        type: 'new_post',
        event_id: eventId,
        post_id: postId,
      },
    });
  } catch (err) {
    console.error('[notifications] Error in notifyNewPostInEvent:', err);
  }
}

// ---------------------------------------------------------------------------
// 6. Person Recognized in Post / Spotlight (#6)
// ---------------------------------------------------------------------------
export interface SpotlightPostInput {
  postId: string;
  eventId: string;
  authorUserId: string;
  recognizedUserId: string;
}

export async function notifySpotlightPost(input: SpotlightPostInput): Promise<void> {
  const { postId, eventId, authorUserId, recognizedUserId } = input;
  if (!recognizedUserId || recognizedUserId === authorUserId) return;

  try {
    const author = await prisma.users.findUnique({
      where: { id: authorUserId },
      select: { full_name: true },
    });

    const authorName = author?.full_name || 'Someone';
    const title = "You're in the Spotlight! 📸";
    const body = `${authorName} shared a new post, and you've been recognized in it. Tap to view!`;

    await recordNotification({
      recipient_user_id: recognizedUserId,
      sender_user_id: authorUserId,
      notification_type: 'general',
      reference_id: postId,
      reference_type: 'spotlight',
      title,
      message: body,
    });

    await dispatchEventPush({
      eventId,
      userIds: [recognizedUserId],
      notification: { title, body },
      data: {
        screen: 'post_details',
        type: 'spotlight_post',
        event_id: eventId,
        post_id: postId,
      },
    });
  } catch (err) {
    console.error('[notifications] Error in notifySpotlightPost:', err);
  }
}
