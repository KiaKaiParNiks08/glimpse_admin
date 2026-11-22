import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import {
  extractFaceCrop,
  normalizeImageForRekognition,
  sniffImageKind,
} from './rekognition-image.ts';
import {
  overlayEventProfile,
  resolveAuthorUserWithEventProfile,
  resolveSocialLinks,
} from '../../lib/user-event-profile.ts';

describe('Global User Identity & Canonical Profile Photo Rules', () => {
  const globalUser = {
    id: 'user-global-1234',
    full_name: 'Priya Sharma',
    avatar_url: 'https://cdn.glimpse.app/avatars/priya-canonical.jpg',
    instagram_id: 'priya_sharma',
    linkedin_url: 'https://www.linkedin.com/in/priya-sharma',
    is_identifier_locked: true,
    is_avatar_locked: true,
    primary_login_type: 'mobile',
  };

  it('preserves canonical avatar across all event views and denies event photo overrides', () => {
    const eventAProfile = {
      full_name: 'Priya S.',
      avatar_url: 'https://attacker.com/malicious-avatar.jpg', // Should be ignored
      instagram_id: 'priya_events',
      linkedin_url: null,
      wedding_side: 'bride',
    };

    const resolved = overlayEventProfile(globalUser, eventAProfile);
    assert.equal(resolved.avatar_url, 'https://cdn.glimpse.app/avatars/priya-canonical.jpg');
    assert.equal(resolved.full_name, 'Priya S.');
    assert.equal(resolved.wedding_side, 'bride');
    assert.equal(resolved.instagram_id, 'priya_events');
  });

  it('hides Instagram handle from public participants when is_instagram_visible is false', () => {
    const eventProfile = {
      full_name: 'Priya Sharma',
      avatar_url: null,
      instagram_id: 'priya_private',
      linkedin_url: 'https://www.linkedin.com/in/priya-sharma',
      is_instagram_visible: false,
      is_linkedin_visible: true,
      wedding_side: 'bride',
    };

    // Public view (viewer != profile owner)
    const publicView = resolveAuthorUserWithEventProfile(
      {
        full_name: globalUser.full_name,
        avatar_url: globalUser.avatar_url,
        instagram_id: globalUser.instagram_id,
        linkedin_url: globalUser.linkedin_url,
      },
      eventProfile,
      { isOwnProfile: false }
    );

    assert.equal(publicView.instagram_id, '', 'Instagram handle must be stripped in public context');
    assert.equal(publicView.linkedin_url, 'https://www.linkedin.com/in/priya-sharma');
    assert.equal(publicView.wedding_side, 'bride');
  });

  it('hides LinkedIn URL from public participants when is_linkedin_visible is false', () => {
    const eventProfile = {
      full_name: 'Priya Sharma',
      avatar_url: null,
      instagram_id: 'priya_public',
      linkedin_url: 'https://www.linkedin.com/in/priya-secret',
      is_instagram_visible: true,
      is_linkedin_visible: false,
      wedding_side: 'groom',
    };

    const publicView = resolveAuthorUserWithEventProfile(
      {
        full_name: globalUser.full_name,
        avatar_url: globalUser.avatar_url,
        instagram_id: globalUser.instagram_id,
        linkedin_url: globalUser.linkedin_url,
      },
      eventProfile,
      { isOwnProfile: false }
    );

    assert.equal(publicView.instagram_id, 'priya_public');
    assert.equal(publicView.linkedin_url, '', 'LinkedIn URL must be stripped when hidden');
    assert.equal(publicView.wedding_side, 'groom');
  });

  it('exposes full social info to the profile owner themselves', () => {
    const eventProfile = {
      full_name: 'Priya Sharma',
      avatar_url: null,
      instagram_id: 'priya_hidden_handle',
      linkedin_url: 'https://www.linkedin.com/in/priya-hidden',
      is_instagram_visible: false,
      is_linkedin_visible: false,
      wedding_side: 'bride',
    };

    const ownerView = resolveAuthorUserWithEventProfile(
      {
        full_name: globalUser.full_name,
        avatar_url: globalUser.avatar_url,
        instagram_id: globalUser.instagram_id,
        linkedin_url: globalUser.linkedin_url,
      },
      eventProfile,
      { isOwnProfile: true }
    );

    assert.equal(ownerView.instagram_id, 'priya_hidden_handle');
    assert.equal(ownerView.linkedin_url, 'https://www.linkedin.com/in/priya-hidden');
    assert.equal(ownerView.is_instagram_visible, false);
    assert.equal(ownerView.is_linkedin_visible, false);
  });
});

describe('AI Face Recognition Image Normalization & Sharp EXIF Processing', () => {
  it('normalizes image orientation using Sharp .rotate()', async () => {
    // Create a 100x200 image with orientation flag
    const rawImage = await sharp({
      create: {
        width: 100,
        height: 200,
        channels: 3,
        background: { r: 120, g: 150, b: 180 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const normalized = await normalizeImageForRekognition(rawImage);
    assert.equal(normalized.kind, 'jpeg');
    assert.ok(normalized.bytes.length > 0);

    const meta = await sharp(normalized.bytes).metadata();
    assert.ok(meta.width && meta.width > 0);
    assert.ok(meta.height && meta.height > 0);
  });

  it('extracts padded face crop for small or distant faces in group photos', async () => {
    // Create an 800x600 image representing a group event photograph
    const groupShot = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 40, g: 60, b: 90 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Small face in upper-right quadrant
    const faceBox = {
      left: 0.70,
      top: 0.20,
      width: 0.10, // 80px wide
      height: 0.12, // 72px high
    };

    const cropBytes = await extractFaceCrop(groupShot, faceBox, 0.20);
    assert.ok(cropBytes !== null, 'Face crop should succeed');
    assert.ok(cropBytes.length > 0);

    const cropMeta = await sharp(cropBytes!).metadata();
    assert.equal(cropMeta.format, 'jpeg');
    // Crop should be scaled into the standardized 320x320 box for Rekognition
    assert.ok(cropMeta.width && cropMeta.width <= 320);
    assert.ok(cropMeta.height && cropMeta.height <= 320);
  });

  it('handles edge cases gracefully: boundary clamping near photo borders', async () => {
    const fullPhoto = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    // Face right on the edge (left = 0, top = 0)
    const edgeBox = {
      left: 0.0,
      top: 0.0,
      width: 0.15,
      height: 0.15,
    };

    const cropBytes = await extractFaceCrop(fullPhoto, edgeBox, 0.25);
    assert.ok(cropBytes !== null);
    const meta = await sharp(cropBytes!).metadata();
    assert.ok(meta.width && meta.width > 0);
    assert.ok(meta.height && meta.height > 0);
  });
});
