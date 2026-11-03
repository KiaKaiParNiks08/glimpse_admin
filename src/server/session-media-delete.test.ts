import test from 'node:test';
import assert from 'node:assert/strict';

function evaluateMediaPermissions(item: {
  id: string;
  event_session_id: string | null;
  uploaded_by?: string | null;
}, viewer: {
  userId?: string | null;
  isAdmin?: boolean;
  canUploadSessions?: Set<string>;
}) {
  const isOwner = Boolean(viewer.userId && item.uploaded_by && item.uploaded_by === viewer.userId);
  const canDelete = Boolean(viewer.isAdmin || isOwner);
  const canUpload = item.event_session_id
    ? Boolean(viewer.isAdmin || viewer.canUploadSessions?.has(item.event_session_id))
    : false;

  return {
    id: item.id,
    event_session_id: item.event_session_id,
    can_delete: canDelete,
    can_upload: canUpload,
  };
}

test('session media permissions contract', async (t) => {
  const mediaItem = {
    id: '11111111-1111-4111-8111-111111111111',
    event_session_id: '22222222-2222-4222-8222-222222222222',
    uploaded_by: 'user-guest-a',
  };

  await t.test('guest A (uploader) sees can_delete: true and can_upload: true', () => {
    const res = evaluateMediaPermissions(mediaItem, {
      userId: 'user-guest-a',
      isAdmin: false,
      canUploadSessions: new Set(['22222222-2222-4222-8222-222222222222']),
    });

    assert.equal(res.id, mediaItem.id);
    assert.equal(res.event_session_id, mediaItem.event_session_id);
    assert.equal(res.can_delete, true);
    assert.equal(res.can_upload, true);
  });

  await t.test('guest B (non-owner) sees can_delete: false', () => {
    const res = evaluateMediaPermissions(mediaItem, {
      userId: 'user-guest-b',
      isAdmin: false,
      canUploadSessions: new Set(['22222222-2222-4222-8222-222222222222']),
    });

    assert.equal(res.id, mediaItem.id);
    assert.equal(res.can_delete, false);
    assert.equal(res.can_upload, true);
  });

  await t.test('unauthenticated visitor sees can_delete: false', () => {
    const res = evaluateMediaPermissions(mediaItem, {
      userId: null,
      isAdmin: false,
    });

    assert.equal(res.can_delete, false);
    assert.equal(res.can_upload, false);
  });

  await t.test('admin sees can_delete: true even if not uploader', () => {
    const res = evaluateMediaPermissions(mediaItem, {
      userId: 'admin-user',
      isAdmin: true,
    });

    assert.equal(res.can_delete, true);
    assert.equal(res.can_upload, true);
  });
});
