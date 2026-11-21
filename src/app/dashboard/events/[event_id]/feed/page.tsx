'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listEventPostsForModerationAction,
  moderatePostAction,
  restorePostAction,
  getPostModerationAuditsAction,
  type ModeratedPostItem,
  type PostModerationAuditItem,
} from '@/app/actions/feed-moderation';
import styles from './feed.module.scss';

const MODERATION_REASONS = [
  'Inappropriate Content',
  'Spam',
  'Harassment / Abuse',
  'Copyright Infringement',
  'Off-topic / Irrelevant',
  'Other',
];

export default function EventFeedModerationPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const { event_id } = use(params);

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'moderated'>('all');
  const [posts, setPosts] = useState<ModeratedPostItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [targetPost, setTargetPost] = useState<ModeratedPostItem | null>(null);
  const [reason, setReason] = useState(MODERATION_REASONS[0]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Audit history state
  const [auditPostId, setAuditPostId] = useState<string | null>(null);
  const [auditList, setAuditList] = useState<PostModerationAuditItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    void loadPosts();
  }, [event_id, activeTab]);

  async function loadPosts() {
    setLoading(true);
    setError(null);
    const res = await listEventPostsForModerationAction(event_id, {
      status: activeTab,
      page: 1,
      limit: 50,
    });
    if (!res.ok) {
      setError(res.error);
    } else {
      setPosts(res.data.posts);
      setTotal(res.data.total);
    }
    setLoading(false);
  }

  async function handleModerate() {
    if (!targetPost) return;
    setSubmitting(true);
    try {
      const res = await moderatePostAction({
        eventId: event_id,
        postId: targetPost.id,
        reason,
        comment: comment.trim() || undefined,
      });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setTargetPost(null);
      setComment('');
      await loadPosts();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore(post: ModeratedPostItem) {
    if (!confirm('Restore this post to active status? It will be visible again in the event feed.')) {
      return;
    }
    const res = await restorePostAction({ eventId: event_id, postId: post.id });
    if (!res.ok) {
      alert(res.error);
      return;
    }
    await loadPosts();
  }

  async function openAuditHistory(post: ModeratedPostItem) {
    setAuditPostId(post.id);
    setAuditLoading(true);
    try {
      const res = await getPostModerationAuditsAction({ eventId: event_id, postId: post.id });
      if (res.ok) {
        setAuditList(res.data);
      } else {
        alert(res.error);
      }
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div>
        <Link href="/dashboard/events" className={styles.backLink}>
          ← Back to Events
        </Link>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Event Feed Moderation</h1>
            <p className={styles.subtitle}>
              Monitor, moderate, or restore guest social posts for this event.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.filterTabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'all' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Posts ({activeTab === 'all' ? total : ''})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'active' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'moderated' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('moderated')}
        >
          Moderated / Removed
        </button>
      </div>

      {error && <p style={{ color: '#b91c1c', fontSize: '0.9rem' }}>{error}</p>}

      {loading ? (
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading feed posts…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No posts found in this view.</p>
      ) : (
        <div className={styles.postGrid}>
          {posts.map((post) => {
            const firstMedia = post.media[0];
            const isModerated = post.status === 'moderated';
            return (
              <div key={post.id} className={styles.postCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.authorInfo}>
                    {post.author.avatar_url ? (
                      <img
                        src={post.author.avatar_url}
                        alt={post.author.full_name}
                        className={styles.avatar}
                      />
                    ) : (
                      <div className={styles.avatarPlaceholder}>
                        {(post.author.full_name || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className={styles.authorName}>{post.author.full_name}</div>
                      <div className={styles.postDate}>
                        {post.created_at ? new Date(post.created_at).toLocaleDateString() : '—'}
                      </div>
                    </div>
                  </div>
                  <span className={isModerated ? styles.badgeModerated : styles.badgeActive}>
                    {isModerated ? 'Moderated' : 'Active'}
                  </span>
                </div>

                {firstMedia && (
                  <div className={styles.mediaContainer}>
                    {firstMedia.media_type === 'video' ? (
                      <video
                        src={firstMedia.media_url}
                        controls
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <img
                        src={firstMedia.media_url}
                        alt={post.caption || 'Media'}
                        className={styles.mediaImage}
                      />
                    )}
                    {post.media.length > 1 && (
                      <div className={styles.mediaCountBadge}>+{post.media.length - 1}</div>
                    )}
                  </div>
                )}

                <div className={styles.cardBody}>
                  {post.caption && <p className={styles.caption}>{post.caption}</p>}

                  {post.latest_audit && (
                    <div
                      className={`${styles.auditBox} ${
                        post.latest_audit.action === 'restored' ? styles.auditBoxRestored : ''
                      }`}
                    >
                      <strong>
                        {post.latest_audit.action === 'moderated'
                          ? `Removed: ${post.latest_audit.reason || 'Moderated'}`
                          : 'Restored by admin'}
                      </strong>
                      <span>By {post.latest_audit.moderator.full_name}</span>
                      {post.latest_audit.comment && <span>&ldquo;{post.latest_audit.comment}&rdquo;</span>}
                    </div>
                  )}

                  <div className={styles.statsRow}>
                    <span>❤️ {post.like_count} likes</span>
                    <span>💬 {post.comment_count} comments</span>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.historyBtn}
                    onClick={() => openAuditHistory(post)}
                  >
                    Audits
                  </button>
                  {isModerated ? (
                    <button
                      type="button"
                      className={styles.restoreBtn}
                      onClick={() => void handleRestore(post)}
                    >
                      Restore Post
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => setTargetPost(post)}
                    >
                      Remove Post
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Moderate Reason Dialog */}
      {targetPost && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogHeader}>
              <h3>Remove Post</h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setTargetPost(null)}
              >
                ×
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
              The post will be soft-removed from the mobile event feed. The post author (
              <strong>{targetPost.author.full_name}</strong>) will receive a notification.
            </p>

            <div>
              <label className={styles.label}>Reason *</label>
              <select
                className={styles.select}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {MODERATION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={styles.label}>Moderator Note (optional)</label>
              <textarea
                className={styles.textarea}
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Internal audit notes or explanation for the creator..."
              />
            </div>

            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.cancelActionBtn}
                onClick={() => setTargetPost(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryActionBtn}
                disabled={submitting}
                onClick={() => void handleModerate()}
              >
                {submitting ? 'Removing…' : 'Remove Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {auditPostId && (
        <div className={styles.overlay}>
          <div className={styles.dialog} style={{ maxWidth: '520px' }}>
            <div className={styles.dialogHeader}>
              <h3>Moderation Audit Trail</h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setAuditPostId(null)}
              >
                ×
              </button>
            </div>

            {auditLoading ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading audits…</p>
            ) : auditList.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No audits recorded for this post.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '360px', overflowY: 'auto' }}>
                {auditList.map((audit) => (
                  <div
                    key={audit.id}
                    style={{
                      padding: '0.65rem 0.85rem',
                      background: '#f8fafc',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <strong style={{ textTransform: 'capitalize', color: audit.action === 'moderated' ? '#b91c1c' : '#166534' }}>
                        {audit.action}
                      </strong>
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                        {audit.created_at ? new Date(audit.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                    {audit.reason && <div style={{ color: '#334155' }}>Reason: {audit.reason}</div>}
                    {audit.comment && <div style={{ color: '#64748b', fontStyle: 'italic', marginTop: '0.2rem' }}>&ldquo;{audit.comment}&rdquo;</div>}
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                      Moderator: {audit.moderator.full_name} ({audit.moderator.email})
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.cancelActionBtn}
                onClick={() => setAuditPostId(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
