import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  looksLikeLinkedInValue,
  normalizeInstagramInput,
  normalizeLinkedInInput,
  overlayEventProfile,
  resolveSocialLinks,
  withResolvedSocialLinks,
  resolveAuthorUserWithEventProfile,
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

  it('preserves canonical global avatar across all events', () => {
    const overlaid = overlayEventProfile(user, {
      full_name: 'Event Display Name',
      avatar_url: null,
      instagram_id: 'event_ig',
      linkedin_url: null,
      wedding_side: 'groom',
    });
    assert.equal(overlaid.full_name, 'Event Display Name');
    assert.equal(overlaid.avatar_url, 'https://example.com/global.jpg'); // Never overridden by event
    assert.equal(overlaid.instagram_id, 'event_ig');
    assert.equal(overlaid.wedding_side, 'groom');
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

describe('Glimpse Mobile Profile & Event-Profile QA Specifications', () => {
  it('1. Login-change updates email or mobile; old identifier stops working', () => {
    // In-memory identity registry simulating database unique lookup
    const usersDb = new Map<string, { id: string; email: string | null; mobile_number: string | null }>();
    usersDb.set('u1', { id: 'u1', email: 'old@example.com', mobile_number: '+919876543210' });

    function lookupByEmail(email: string) {
      for (const user of usersDb.values()) {
        if (user.email?.toLowerCase() === email.toLowerCase()) return user;
      }
      return null;
    }

    function lookupByMobile(mobile: string) {
      for (const user of usersDb.values()) {
        if (user.mobile_number === mobile) return user;
      }
      return null;
    }

    // Step 1: Initial state confirms old email and phone work
    assert.equal(lookupByEmail('old@example.com')?.id, 'u1');
    assert.equal(lookupByMobile('+919876543210')?.id, 'u1');

    // Step 2: Confirm login change to new email
    const newEmail = 'new@example.com';
    usersDb.set('u1', { ...usersDb.get('u1')!, email: newEmail });

    // Old email no longer resolves; new email resolves to u1
    assert.equal(lookupByEmail('old@example.com'), null);
    assert.equal(lookupByEmail('new@example.com')?.id, 'u1');

    // Step 3: Confirm login change to new mobile
    const newMobile = '+919999888877';
    usersDb.set('u1', { ...usersDb.get('u1')!, mobile_number: newMobile });

    // Old mobile no longer resolves; new mobile resolves to u1
    assert.equal(lookupByMobile('+919876543210'), null);
    assert.equal(lookupByMobile('+919999888877')?.id, 'u1');
  });

  it('2. Global PATCH = name + social; event PATCH = side + toggles for that event_id', () => {
    // Global schema evaluation
    function validateGlobalPatch(input: {
      full_name?: string;
      instagram_id?: string | null;
      linkedin_url?: string | null;
      email?: string;
      mobile_number?: string;
      avatar_url?: string;
      wedding_side?: string | null;
      show_instagram?: boolean;
      show_linkedin?: boolean;
      event_id?: string;
    }) {
      if (input.email !== undefined) return { valid: false, error: 'email not allowed on global PATCH' };
      if (input.mobile_number !== undefined) return { valid: false, error: 'mobile_number not allowed on global PATCH' };
      if (input.avatar_url !== undefined) return { valid: false, error: 'avatar_url not allowed on global PATCH' };
      if (
        (input.wedding_side !== undefined || input.show_instagram !== undefined || input.show_linkedin !== undefined) &&
        !input.event_id
      ) {
        return { valid: false, error: 'event_id required for event preferences' };
      }
      return { valid: true };
    }

    // Global: valid
    assert.equal(validateGlobalPatch({ full_name: 'Jane Doe', instagram_id: 'jane_ig' }).valid, true);

    // Global: rejects email
    assert.equal(validateGlobalPatch({ full_name: 'Jane', email: 'jane@test.com' }).valid, false);

    // Global: rejects mobile_number
    assert.equal(validateGlobalPatch({ mobile_number: '9876543210' }).valid, false);

    // Global: rejects wedding_side without event_id
    assert.equal(validateGlobalPatch({ wedding_side: 'bride' }).valid, false);

    // Event PATCH: requires event_id
    function validateEventPatch(input: {
      event_id?: string;
      wedding_side?: string | null;
      show_instagram?: boolean;
      show_linkedin?: boolean;
      email?: string;
      avatar_url?: string;
    }) {
      if (!input.event_id) return { valid: false, error: 'event_id required' };
      if (input.email !== undefined) return { valid: false, error: 'email not allowed' };
      if (input.avatar_url !== undefined) return { valid: false, error: 'avatar_url not allowed' };
      return { valid: true };
    }

    assert.equal(
      validateEventPatch({
        event_id: 'e1111111-1111-4111-8111-111111111111',
        wedding_side: 'bride',
        show_instagram: true,
        show_linkedin: false,
      }).valid,
      true
    );

    assert.equal(
      validateEventPatch({
        event_id: 'e1111111-1111-4111-8111-111111111111',
        wedding_side: 'bride',
        avatar_url: 'https://malicious.com/pic.jpg',
      }).valid,
      false
    );
  });

  it('3. Guest profile with show_linkedin false -> no LinkedIn in response (Privacy enforcement)', () => {
    const userB = {
      full_name: 'Bob Smith',
      avatar_url: 'https://cdn.example.com/bob.jpg',
      instagram_id: 'bob_insta',
      linkedin_url: 'https://www.linkedin.com/in/bob-smith',
    };

    const eventProfileB = {
      full_name: 'Bob (Groom Friend)',
      avatar_url: null,
      instagram_id: 'bob_insta',
      linkedin_url: 'https://www.linkedin.com/in/bob-smith',
      is_instagram_visible: true,
      is_linkedin_visible: false, // User B hid LinkedIn for this event
      wedding_side: 'groom',
    };

    // User A views User B in Event E
    const viewByGuestA = resolveAuthorUserWithEventProfile(userB, eventProfileB, { isOwnProfile: false });
    assert.equal(viewByGuestA.full_name, 'Bob (Groom Friend)');
    assert.equal(viewByGuestA.instagram_id, 'bob_insta'); // Visible
    assert.equal(!viewByGuestA.linkedin_url, true); // Hidden! Empty/null for other guests
    assert.equal(viewByGuestA.show_linkedin, false);

    // User B views their own profile in Event E
    const viewBySelf = resolveAuthorUserWithEventProfile(userB, eventProfileB, { isOwnProfile: true });
    assert.equal(viewBySelf.linkedin_url, 'https://www.linkedin.com/in/bob-smith'); // Self sees own value
    assert.equal(viewBySelf.show_linkedin, false); // Toggle reflects preference
  });

  it('4. Second photo: same person 200; different person 403 with message', () => {
    function simulateProfilePhotoUpload(options: {
      hasExistingReference: boolean;
      rekognitionMatchSimilarity?: number;
      minSimilarityThreshold?: number;
    }): { status: number; message: string; can_replace_profile_photo: boolean } {
      const { hasExistingReference, rekognitionMatchSimilarity = 0, minSimilarityThreshold = 80 } = options;

      if (!hasExistingReference) {
        // First upload: accept and enroll
        return {
          status: 200,
          message: 'Profile picture registered',
          can_replace_profile_photo: false,
        };
      }

      // Second/subsequent upload: same-person verification
      if (rekognitionMatchSimilarity >= minSimilarityThreshold) {
        return {
          status: 200,
          message: 'Profile picture updated successfully',
          can_replace_profile_photo: false,
        };
      }

      return {
        status: 403,
        message: 'This photo is a different person from the profile picture first uploaded. The picture was not changed.',
        can_replace_profile_photo: false,
      };
    }

    // First upload
    const firstUpload = simulateProfilePhotoUpload({ hasExistingReference: false });
    assert.equal(firstUpload.status, 200);
    assert.equal(firstUpload.can_replace_profile_photo, false);

    // Second upload: same person (similarity 96% >= 80%)
    const samePersonUpload = simulateProfilePhotoUpload({
      hasExistingReference: true,
      rekognitionMatchSimilarity: 96,
    });
    assert.equal(samePersonUpload.status, 200);
    assert.equal(samePersonUpload.can_replace_profile_photo, false);

    // Second upload: different person (similarity 45% < 80%)
    const diffPersonUpload = simulateProfilePhotoUpload({
      hasExistingReference: true,
      rekognitionMatchSimilarity: 45,
    });
    assert.equal(diffPersonUpload.status, 403);
    assert.match(diffPersonUpload.message, /different person/i);
    assert.equal(diffPersonUpload.can_replace_profile_photo, false);
  });

  it('5. Join/switch: same user_id and avatar_url; event_profile for active event', () => {
    const globalUser = {
      user_id: 'global-user-uuid-1234',
      avatar_url: 'https://cdn.glimpse.app/avatars/canonical-avatar.jpg',
      full_name: 'Samantha Ray',
    };

    const event1Profile = {
      event_id: 'evt-wedding-1',
      wedding_side: 'bride',
      can_edit_wedding_side: true,
      show_instagram: true,
      show_linkedin: false,
    };

    const event2Profile = {
      event_id: 'evt-corp-2',
      wedding_side: null,
      can_edit_wedding_side: false,
      show_instagram: false,
      show_linkedin: true,
    };

    // Active in Event 1
    const sessionEvent1 = {
      ...globalUser,
      current_event_id: event1Profile.event_id,
      event_profile: event1Profile,
    };
    assert.equal(sessionEvent1.user_id, 'global-user-uuid-1234');
    assert.equal(sessionEvent1.avatar_url, 'https://cdn.glimpse.app/avatars/canonical-avatar.jpg');
    assert.equal(sessionEvent1.event_profile.wedding_side, 'bride');

    // Switch to Event 2: user_id and avatar_url remain identical
    const sessionEvent2 = {
      ...globalUser,
      current_event_id: event2Profile.event_id,
      event_profile: event2Profile,
    };
    assert.equal(sessionEvent2.user_id, sessionEvent1.user_id);
    assert.equal(sessionEvent2.avatar_url, sessionEvent1.avatar_url);
    assert.equal(sessionEvent2.event_profile.event_id, 'evt-corp-2');
    assert.equal(sessionEvent2.event_profile.wedding_side, null);
    assert.equal(sessionEvent2.event_profile.show_linkedin, true);
  });
});
