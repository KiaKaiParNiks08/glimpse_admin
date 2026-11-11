import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ALL_FEATURES_ENABLED,
  FEATURE_KEYS,
  PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  STARTER_MEDIA_FEATURES,
  computeEffectiveFeatures,
  computeEffectivePermissions,
  modulesFromAccess,
} from '../lib/rbac.ts';
import { evaluateModerationLabels } from '../lib/moderation-rules.ts';

describe('Multi-tenant RBAC, Purchase Plans & 18+ Moderation Rules', () => {
  test('Static default Super Admin password hash matches seeded SHA-256 value', () => {
    const expectedHash = createHash('sha256').update('superadmin@123').digest('hex');
    assert.equal(
      expectedHash,
      'b6fec15f505852eedb851d5469c8e32d6a79b0ac8abea32ba7ea4596c15acaa8'
    );
  });

  test('Starter Media Only plan gates watermark, AI recognition, highlights, and push notifications', () => {
    const features = computeEffectiveFeatures(STARTER_MEDIA_FEATURES, null);
    assert.equal(features.event_basic, true);
    assert.equal(features.event_sessions, true);
    assert.equal(features.event_team, true);
    assert.equal(features.session_media_upload, true);
    assert.equal(features.event_watermark, false);
    assert.equal(features.ai_recognition, false);
    assert.equal(features.mobile_favorites, false);
    assert.equal(features.mobile_feed, false);
    assert.equal(features.push_notifications, false);

    const perms = computeEffectivePermissions({
      roleName: 'client_admin',
      rolePermissions: ROLE_DEFAULT_PERMISSIONS.client_admin,
      features,
      applyFeatureGate: true,
    });

    assert.equal(perms.has('events.create'), true);
    assert.equal(perms.has('sessions.manage'), true);
    assert.equal(perms.has('media.upload'), true);
    assert.equal(perms.has('watermark.manage'), false);
    assert.equal(perms.has('people_media.view'), false);
    assert.equal(perms.has('highlights.manage'), false);
    assert.equal(perms.has('explore.manage'), false);
    assert.equal(perms.has('notifications.send'), false);
    assert.equal(perms.has('plans.manage'), false);

    const modules = modulesFromAccess({ tier: 'client_admin', permissions: perms, features });
    assert.ok(modules.includes('dashboard'));
    assert.ok(modules.includes('events'));
    assert.ok(modules.includes('admins'));
    assert.ok(!modules.includes('plans'));
    assert.ok(!modules.includes('app-config'));
    assert.ok(!modules.includes('notifications'));
  });

  test('Per-client feature overrides unlock a specific feature on top of base plan', () => {
    const features = computeEffectiveFeatures(STARTER_MEDIA_FEATURES, {
      event_watermark: true,
      ai_recognition: true,
    });
    assert.equal(features.event_watermark, true);
    assert.equal(features.ai_recognition, true);
    assert.equal(features.event_highlights, false);

    const perms = computeEffectivePermissions({
      roleName: 'client_admin',
      rolePermissions: ROLE_DEFAULT_PERMISSIONS.client_admin,
      features,
      applyFeatureGate: true,
    });
    assert.equal(perms.has('watermark.manage'), true);
    assert.equal(perms.has('people_media.view'), true);
    assert.equal(perms.has('highlights.manage'), false);
  });

  test('Photographer role allows viewing sessions/media and uploading only', () => {
    const features = computeEffectiveFeatures(ALL_FEATURES_ENABLED, null);
    const perms = computeEffectivePermissions({
      roleName: 'photographer',
      rolePermissions: ROLE_DEFAULT_PERMISSIONS.photographer,
      features,
      applyFeatureGate: true,
    });

    assert.equal(perms.has('events.view'), true);
    assert.equal(perms.has('sessions.view'), true);
    assert.equal(perms.has('media.view'), true);
    assert.equal(perms.has('media.upload'), true);
    assert.equal(perms.has('media.delete'), false);
    assert.equal(perms.has('sessions.manage'), false);
    assert.equal(perms.has('events.edit'), false);
    assert.equal(perms.has('users.manage'), false);

    const modules = modulesFromAccess({ tier: 'client_subuser', permissions: perms, features });
    assert.deepEqual(modules, ['dashboard', 'events']);
  });

  test('Super admin retains every permission unconditionally', () => {
    const perms = computeEffectivePermissions({
      roleName: 'super_admin',
      features: STARTER_MEDIA_FEATURES,
      applyFeatureGate: true,
    });
    assert.equal(perms.size, PERMISSION_KEYS.length);
  });

  test('18+ moderation evaluator blocks explicit content while allowing benign wedding photos', () => {
    const benign = evaluateModerationLabels([
      { Name: 'Formal Wear', Confidence: 96.2 },
      { Name: 'Suggestive', Confidence: 82.0 },
      { Name: 'Swimwear or Underwear', Confidence: 76.5 },
    ]);
    assert.equal(benign.blocked, false);

    const lowConfidenceNoise = evaluateModerationLabels([
      { Name: 'Explicit Nudity', Confidence: 45.0 },
    ]);
    assert.equal(lowConfidenceNoise.blocked, false);

    const explicitHit = evaluateModerationLabels([
      { Name: 'Explicit Nudity', ParentName: 'Explicit', Confidence: 91.4 },
    ]);
    assert.equal(explicitHit.blocked, true);
    assert.ok(explicitHit.reason?.includes('Explicit Nudity'));

    const childLabelHit = evaluateModerationLabels([
      { Name: 'Exposed Female Genitalia', ParentName: 'Explicit Nudity', Confidence: 84.1 },
    ]);
    assert.equal(childLabelHit.blocked, true);
  });

  test('Mobile enabled_features contract includes all expected flags and isolates per-event plans', () => {
    const mobileContractFlags = [
      'event_basic',
      'event_sessions',
      'event_current_happening',
      'event_explore',
      'event_highlights',
      'event_post_report',
      'event_team',
      'push_notifications',
      'mobile_feed',
      'mobile_favorites',
      'ai_recognition',
      'session_media_upload',
      'event_watermark',
    ] as const;

    for (const key of mobileContractFlags) {
      assert.ok(FEATURE_KEYS.includes(key), `Missing mobile contract flag: ${key}`);
      assert.equal(ALL_FEATURES_ENABLED[key], true);
    }

    const eventAFeatures = computeEffectiveFeatures(ALL_FEATURES_ENABLED, null);
    const eventBFeatures = computeEffectiveFeatures(STARTER_MEDIA_FEATURES, {
      event_team: false,
      session_media_upload: false,
    });

    assert.equal(eventAFeatures.event_team, true);
    assert.equal(eventAFeatures.session_media_upload, true);
    assert.equal(eventAFeatures.mobile_feed, true);
    assert.equal(eventAFeatures.mobile_favorites, true);
    assert.equal(eventAFeatures.ai_recognition, true);
    assert.equal(eventAFeatures.event_watermark, true);

    assert.equal(eventBFeatures.event_team, false);
    assert.equal(eventBFeatures.session_media_upload, false);
    assert.equal(eventBFeatures.mobile_feed, false);
    assert.equal(eventBFeatures.mobile_favorites, false);
    assert.equal(eventBFeatures.ai_recognition, false);
    assert.equal(eventBFeatures.event_watermark, false);
    assert.equal(eventBFeatures.event_sessions, true);
  });
});
