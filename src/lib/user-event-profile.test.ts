import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { overlayEventProfile } from './user-event-profile.ts';

describe('overlayEventProfile', () => {
  const user = {
    id: 'u1',
    full_name: 'Global Name',
    avatar_url: 'https://example.com/global.jpg',
    instagram_id: 'global_ig',
  };

  it('keeps global fields when this event has no profile row', () => {
    assert.deepEqual(overlayEventProfile(user, null), user);
  });

  it('uses the event profile even when name and photo are empty', () => {
    assert.deepEqual(
      overlayEventProfile(user, { full_name: '', avatar_url: null, instagram_id: null }),
      { ...user, full_name: '', avatar_url: null, instagram_id: null }
    );
  });

  it('does not mix another event’s stored values when a row exists', () => {
    assert.equal(
      overlayEventProfile(user, { full_name: 'Event B', avatar_url: null, instagram_id: 'b_ig' }).full_name,
      'Event B'
    );
  });
});
