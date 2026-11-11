import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  looksLikeLinkedInValue,
  normalizeInstagramInput,
  normalizeLinkedInInput,
  overlayEventProfile,
  resolveSocialLinks,
  withResolvedSocialLinks,
} from './user-event-profile.ts';

describe('overlayEventProfile', () => {
  const user = {
    id: 'u1',
    full_name: 'Global Name',
    avatar_url: 'https://example.com/global.jpg',
    instagram_id: 'global_ig',
    linkedin_url: 'https://www.linkedin.com/in/global',
  };

  it('keeps global fields when this event has no profile row', () => {
    assert.deepEqual(overlayEventProfile(user, null), user);
  });

  it('uses the event profile even when name and photo are empty', () => {
    assert.deepEqual(
      overlayEventProfile(user, {
        full_name: '',
        avatar_url: null,
        instagram_id: null,
        linkedin_url: null,
      }),
      { ...user, full_name: '', avatar_url: null, instagram_id: null, linkedin_url: null }
    );
  });

  it('does not mix another event’s stored values when a row exists', () => {
    const overlaid = overlayEventProfile(user, {
      full_name: 'Event B',
      avatar_url: null,
      instagram_id: 'b_ig',
      linkedin_url: 'https://www.linkedin.com/in/event-b',
    });
    assert.equal(overlaid.full_name, 'Event B');
    assert.equal(overlaid.instagram_id, 'b_ig');
    assert.equal(overlaid.linkedin_url, 'https://www.linkedin.com/in/event-b');
  });
});

describe('profile social links normalization and fallback', () => {
  it('accepts empty strings for both instagram_id and linkedin_url (both optional)', () => {
    assert.deepEqual(normalizeInstagramInput(''), { value: null, valid: true });
    assert.deepEqual(normalizeLinkedInInput(''), { value: null, valid: true });
    assert.deepEqual(normalizeInstagramInput('   '), { value: null, valid: true });
    assert.deepEqual(normalizeLinkedInInput('   '), { value: null, valid: true });
  });

  it('normalizes Instagram handle by stripping leading @ and keeps full URLs', () => {
    assert.deepEqual(normalizeInstagramInput('@nikhil_02'), { value: 'nikhil_02', valid: true });
    assert.deepEqual(normalizeInstagramInput('https://instagram.com/nikhil_02'), {
      value: 'https://instagram.com/nikhil_02',
      valid: true,
    });
    // Keeps legacy LinkedIn URLs if an un-updated mobile client still sends it in instagram_id
    assert.deepEqual(normalizeInstagramInput('https://www.linkedin.com/in/legacy-corp'), {
      value: 'https://www.linkedin.com/in/legacy-corp',
      valid: true,
    });
    assert.equal(normalizeInstagramInput('bad handle').valid, false);
  });

  it('normalizes LinkedIn slugs to full URLs and rejects non-linkedin domains', () => {
    assert.deepEqual(normalizeLinkedInInput('john-doe'), {
      value: 'https://www.linkedin.com/in/john-doe',
      valid: true,
    });
    assert.deepEqual(normalizeLinkedInInput('in/john-doe/'), {
      value: 'https://www.linkedin.com/in/john-doe',
      valid: true,
    });
    assert.deepEqual(normalizeLinkedInInput('linkedin.com/in/john-doe'), {
      value: 'https://linkedin.com/in/john-doe',
      valid: true,
    });
    assert.deepEqual(normalizeLinkedInInput('https://www.linkedin.com/in/john-doe'), {
      value: 'https://www.linkedin.com/in/john-doe',
      valid: true,
    });
    assert.equal(normalizeLinkedInInput('https://example.com/john-doe').valid, false);
  });

  it('treats legacy corporate LinkedIn-in-instagram_id rows as linkedin_url on read when linkedin_url is empty', () => {
    assert.equal(looksLikeLinkedInValue('https://www.linkedin.com/in/corp-user'), true);
    assert.deepEqual(
      resolveSocialLinks({
        instagram_id: 'https://www.linkedin.com/in/corp-user',
        linkedin_url: null,
      }),
      {
        instagram_id: '',
        linkedin_url: 'https://www.linkedin.com/in/corp-user',
      }
    );

    // When both are set explicitly, keep both independently
    assert.deepEqual(
      withResolvedSocialLinks({
        id: 'u1',
        instagram_id: 'wedding_ig',
        linkedin_url: 'https://www.linkedin.com/in/corp-user',
      }),
      {
        id: 'u1',
        instagram_id: 'wedding_ig',
        linkedin_url: 'https://www.linkedin.com/in/corp-user',
      }
    );
  });
});
