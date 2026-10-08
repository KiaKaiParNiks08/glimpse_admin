import prisma from '@/server/prisma';
import { getFavoritedItemIds } from '@/server/favorites';
import type { CreatePostInput, ListPostsQuery } from '@/lib/validations/posts';

/** Select for list/get. */
export const postSelect = {
  id: true,
  user_id: true,
  event_id: true,
  caption: true,
  status: true,
  like_count: true,
  comment_count: true,
  created_at: true,
  updated_at: true,
  users: {
    select: {
      full_name: true,
      avatar_url: true,
    },
  },
  post_media: {
    select: {
      id: true,
      media_type: true,
      media_url: true,
      thumbnail_url: true,
      media_order: true,
    },
  },
} as const;

export type PostWithMedia = {
  id: string;
  user_id: string;
  event_id: string | null;
  caption: string | null;
  status: string | null;
  like_count: number;
  comment_count: number;
  created_at: Date | null;
  updated_at: Date | null;
  liked_by_viewer?: boolean;
  is_favorite?: boolean;
  users: {
    full_name: string;
    avatar_url: string | null;
  };
  post_media: Array<{
    id: string;
    media_type: string;
    media_url: string;
    thumbnail_url: string | null;
    media_order: number | null;
  }>;
};

function toPostWithMedia(row: PostWithMedia): PostWithMedia {
  return row;
}

export interface CreatePostMediaItem {
  media_type: 'image' | 'video';
  media_url: string;
  thumbnail_url?: string | null;
  media_order?: number;
}

/**
 * Create a feed post with optional media (images/videos).
 */
export async function createPost(
  input: CreatePostInput & { event_id?: string | null },
  media: CreatePostMediaItem[] = []
): Promise<PostWithMedia> {
  const post = await prisma.posts.create({
    data: {
      user_id: input.user_id,
      event_id: input.event_id ?? null,
      caption: input.caption ?? null,
      status: input.status ?? 'active',
      post_media:
        media.length > 0
          ? {
              create: media.map((m, i) => ({
                media_type: m.media_type,
                media_url: m.media_url,
                thumbnail_url: m.thumbnail_url ?? null,
                media_order: m.media_order ?? i + 1,
              })),
            }
          : undefined,
    },
    select: postSelect,
  });
  return toPostWithMedia(post as Parameters<typeof toPostWithMedia>[0]);
}

/**
 * List feed posts with optional filters and pagination.
 * like_count and comment_count are computed from post_likes and comments tables.
 */
export async function listPosts(query: ListPostsQuery): Promise<{
  posts: PostWithMedia[];
  total: number;
}> {
  const { user_id, viewer_user_id, event_id, status, page, limit } = query;
  const skip = (page - 1) * limit;
  const where = {
    ...(user_id && { user_id }),
    ...(status && { status }),
    // A post with no event_id is not part of any event feed.
    ...(event_id && { event_id }),
  };

  const select = {
    ...postSelect,
    ...(viewer_user_id
      ? { post_likes: { where: { user_id: viewer_user_id }, select: { id: true } } }
      : {}),
  } as const;

  const [rows, total] = await Promise.all([
    prisma.posts.findMany({
      where,
      select,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.posts.count({ where }),
  ]);
  const posts = rows.map((row) => {
    const base = toPostWithMedia(row as unknown as PostWithMedia);
    const likedByViewer =
      viewer_user_id && 'post_likes' in (row as unknown as Record<string, unknown>)
        ? Array.isArray((row as unknown as { post_likes?: unknown }).post_likes) &&
          ((row as unknown as { post_likes?: unknown[] }).post_likes?.length ?? 0) > 0
        : undefined;
    return likedByViewer === undefined ? base : { ...base, liked_by_viewer: likedByViewer };
  });

  if (viewer_user_id && event_id) {
    const favorited = await getFavoritedItemIds(
      viewer_user_id,
      'post',
      posts.map((p) => p.id),
      event_id
    );
    return { posts: posts.map((p) => ({ ...p, is_favorite: favorited.has(p.id) })), total };
  }
  return { posts, total };
}

/**
 * Soft-delete a post, only if it belongs to the given user.
 * Returns:
 * - 'not_found' when the post doesn't exist
 * - 'forbidden' when the post exists but belongs to a different user
 * - 'already_deleted' when post is already deleted
 * - 'deleted' when the status was updated to deleted
 */
export async function deletePostOwnedByUser(
  postId: string,
  userId: string
): Promise<'not_found' | 'forbidden' | 'already_deleted' | 'deleted'> {
  const existing = await prisma.posts.findUnique({
    where: { id: postId },
    select: { id: true, user_id: true, status: true },
  });

  if (!existing) return 'not_found';
  if (existing.user_id !== userId) return 'forbidden';
  if (existing.status === 'deleted') return 'already_deleted';

  await prisma.posts.update({
    where: { id: postId },
    data: { status: 'deleted' },
  });
  return 'deleted';
}

const postLikeSelect = {
  id: true,
  post_id: true,
  user_id: true,
  created_at: true,
} as const;

export type PostLikeResult = {
  id: string;
  post_id: string;
  user_id: string;
  created_at: Date | null;
};

export type LikeAction = 'toggle' | 'like' | 'unlike';

/**
 * Add a like for a post by a user. Idempotent: if already liked, returns existing like.
 * Increments post like_count only when a new like is created.
 */
export async function addPostLike(
  postId: string,
  userId: string
): Promise<{ like: PostLikeResult; created: boolean }> {
  const existing = await prisma.post_likes.findUnique({
    where: {
      post_id_user_id: { post_id: postId, user_id: userId },
    },
    select: postLikeSelect,
  });
  if (existing) {
    return { like: existing as PostLikeResult, created: false };
  }
  const like = await prisma.$transaction(async (tx) => {
    const created = await tx.post_likes.create({
      data: { post_id: postId, user_id: userId },
      select: postLikeSelect,
    });
    await tx.posts.update({
      where: { id: postId },
      data: { like_count: { increment: 1 } },
    });
    return created;
  });
  return { like: like as PostLikeResult, created: true };
}

/**
 * Like / Unlike / Toggle like for a post. Returns the current liked status and updated like_count.
 */
export async function setPostLike(
  postId: string,
  userId: string,
  action: LikeAction = 'toggle'
): Promise<{ liked: boolean; like_count: number }> {
  const result = await prisma.$transaction(async (tx) => {
    const post = await tx.posts.findUnique({
      where: { id: postId },
      select: { id: true, like_count: true },
    });
    if (!post) {
      // Route should normally handle not-found; keep it safe.
      throw new Error('Post not found');
    }

    const existing = await tx.post_likes.findUnique({
      where: { post_id_user_id: { post_id: postId, user_id: userId } },
      select: { id: true },
    });

    const currentlyLiked = Boolean(existing);
    const shouldLike =
      action === 'like' ? true : action === 'unlike' ? false : !currentlyLiked;

    if (shouldLike && !currentlyLiked) {
      await tx.post_likes.create({ data: { post_id: postId, user_id: userId } });
      const updated = await tx.posts.update({
        where: { id: postId },
        data: { like_count: { increment: 1 } },
        select: { like_count: true },
      });
      return { liked: true, like_count: updated.like_count ?? 0 };
    }

    if (!shouldLike && currentlyLiked) {
      await tx.post_likes.delete({
        where: { post_id_user_id: { post_id: postId, user_id: userId } },
      });
      const updated = await tx.posts.update({
        where: { id: postId },
        data: { like_count: { decrement: 1 } },
        select: { like_count: true },
      });
      return { liked: false, like_count: updated.like_count ?? 0 };
    }

    // No-op (already in desired state)
    return { liked: shouldLike, like_count: post.like_count ?? 0 };
  });

  return result;
}

/** One row in the “who liked this post” list. */
export type PostLikedUser = {
  like_id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
};

/**
 * Get post liked users list.
 * Returns:
 * - 'not_found' when the post doesn't exist
 * - `{ likes }` with mapped user display fields (empty array if no likes)
 */
export async function getPostLikedUsers(
  postId: string
): Promise<'not_found' | { likes: PostLikedUser[] }> {
  const existing = await prisma.posts.findUnique({
    where: { id: postId },
    select: { id: true },
  });

  if (!existing) return 'not_found';

  const rows = await prisma.post_likes.findMany({
    where: { post_id: postId },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      user_id: true,
      users: {
        select: {
          full_name: true,
          avatar_url: true,
        },
      },
    },
  });

  const likes: PostLikedUser[] = rows.map((item) => ({
    like_id: item.id,
    user_id: item.user_id,
    full_name: item.users.full_name,
    avatar_url: item.users.avatar_url,
  }));

  return { likes };
}
