import type { Prisma } from '@prisma/client';
import prisma from '@/server/prisma';
import type { CreateCommentBody, ListCommentsQuery } from '@/lib/validations/comments';

export const commentSelect = {
  id: true,
  post_id: true,
  user_id: true,
  parent_comment_id: true,
  comment_text: true,
  status: true,
  created_at: true,
  updated_at: true,
  users: {
    select: {
      full_name: true,
      avatar_url: true,
    },
  },
} as const;

export type CommentResult = {
  id: string;
  post_id: string;
  user_id: string;
  parent_comment_id: string | null;
  comment_text: string;
  status: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  users: {
    full_name: string;
    avatar_url: string | null;
  };
};

/** A top-level comment plus every reply in its thread. */
export type CommentWithReplies = CommentResult & {
  replies: CommentResult[];
};

/**
 * Create a comment on a post and increment the post's comment_count.
 * Use a transaction so both succeed or both roll back.
 */
export async function createComment(
  postId: string,
  input: CreateCommentBody
): Promise<CommentResult> {
  const comment = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.comments.create({
      data: {
        post_id: postId,
        user_id: input.user_id,
        comment_text: input.comment_text,
        parent_comment_id: input.parent_comment_id ?? null,
        status: 'active',
      },
      select: commentSelect,
    });
    await tx.posts.update({
      where: { id: postId },
      data: { comment_count: { increment: 1 } },
    });
    return created;
  });
  return comment as CommentResult;
}

/**
 * Check if a post exists by id.
 */
export async function postExists(postId: string): Promise<boolean> {
  const post = await prisma.posts.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  return post !== null;
}

/**
 * Walk parent links until the reply sits under a top-level comment on this page.
 * A reply to a reply stays in that same thread.
 */
function rootCommentId(
  reply: CommentResult,
  rootIds: Set<string>,
  byId: Map<string, CommentResult>
): string | null {
  let parentId = reply.parent_comment_id;
  const seen = new Set<string>([reply.id]);
  while (parentId) {
    if (rootIds.has(parentId)) return parentId;
    if (seen.has(parentId)) return null;
    seen.add(parentId);
    parentId = byId.get(parentId)?.parent_comment_id ?? null;
  }
  return null;
}

/**
 * List comments for a post with pagination.
 * Pages are top-level comments (newest first). Each comment includes `replies`
 * for that thread (oldest first), including a reply to a reply.
 */
export async function listComments(
  postId: string,
  query: ListCommentsQuery
): Promise<{ comments: CommentWithReplies[]; total: number }> {
  const { page, limit, status } = query;
  const skip = (page - 1) * limit;
  const where = {
    post_id: postId,
    parent_comment_id: null,
    ...(status && { status }),
  };
  const [comments, total, replyRows] = await Promise.all([
    prisma.comments.findMany({
      where,
      select: commentSelect,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.comments.count({ where }),
    prisma.comments.findMany({
      where: {
        post_id: postId,
        parent_comment_id: { not: null },
        ...(status && { status }),
      },
      select: commentSelect,
      orderBy: { created_at: 'asc' },
    }),
  ]);

  const roots = comments as CommentResult[];
  const replies = replyRows as CommentResult[];
  const rootIds = new Set(roots.map((comment) => comment.id));
  const byId = new Map(replies.map((reply) => [reply.id, reply]));
  const grouped = new Map<string, CommentResult[]>();

  for (const reply of replies) {
    const rootId = rootCommentId(reply, rootIds, byId);
    if (!rootId) continue;
    const thread = grouped.get(rootId) ?? [];
    thread.push(reply);
    grouped.set(rootId, thread);
  }

  return {
    comments: roots.map((comment) => ({
      ...comment,
      replies: grouped.get(comment.id) ?? [],
    })),
    total,
  };
}

/**
 * Soft-delete a comment, only if it belongs to the given user.
 * Returns:
 * - 'not_found' when comment doesn't exist for the given post
 * - 'forbidden' when it exists but belongs to a different user
 * - 'already_deleted' when comment is already deleted
 * - 'deleted' when comment was set to deleted
 *
 * Note: We soft-delete (status='deleted') to avoid cascading deletes of replies.
 */
export async function deleteCommentOwnedByUser(
  postId: string,
  commentId: string,
  userId: string
): Promise<'not_found' | 'forbidden' | 'already_deleted' | 'deleted'> {
  const existing = await prisma.comments.findFirst({
    where: { id: commentId, post_id: postId },
    select: { id: true, user_id: true, status: true },
  });

  if (!existing) return 'not_found';
  if (existing.user_id !== userId) return 'forbidden';
  if (existing.status === 'deleted') return 'already_deleted';

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.comments.update({
      where: { id: commentId },
      data: { status: 'deleted' },
    });
    await tx.posts.update({
      where: { id: postId },
      data: { comment_count: { decrement: 1 } },
    });
  });

  return 'deleted';
}
