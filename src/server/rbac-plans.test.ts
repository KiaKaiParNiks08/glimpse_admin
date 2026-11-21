import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ALL_FEATURES_ENABLED,
  ESSENTIAL_PLAN_FEATURES,
  SIGNATURE_PLAN_FEATURES,
  ELITE_PLAN_FEATURES,
  FEATURE_KEYS,
  PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  STANDARD_PLAN_LIMITS,
  computeEffectiveFeatures,
  computeEffectivePermissions,
  modulesFromAccess,
} from '../lib/rbac.ts';
import { evaluateModerationLabels } from '../lib/moderation-rules.ts';

describe('Multi-tenant RBAC, Purchase Plans & Feed Moderation Rules', () => {
  test('Static default Super Admin password hash matches seeded SHA-256 value', () => {
    const expectedHash = createHash('sha256').update('superadmin@123').digest('hex');
    assert.equal(
      expectedHash,
      'b6fec15f505852eedb851d5469c8e32d6a79b0ac8abea32ba7ea4596c15acaa8'
    );
  });

  test('Plan I — Essential features and permissions', () => {
    const features = computeEffectiveFeatures(ESSENTIAL_PLAN_FEATURES, null);
    // Included features
    assert.equal(features.event_basic, true);
    assert.equal(features.event_sessions, true);
    assert.equal(features.event_team, true);
    assert.equal(features.session_media_upload, true);
    assert.equal(features.ai_recognition, true);
    assert.equal(features.event_qr, true);
    assert.equal(features.venues_manage, true);
    assert.equal(features.event_guests_export, true);
    assert.equal(features.event_current_happening, true);
    assert.equal(features.event_explore, true);

    // Gated features
    assert.equal(features.event_watermark, false);
    assert.equal(features.event_highlights, false);
    assert.equal(features.event_post_report, false);
    assert.equal(features.push_notifications, false);
    assert.equal(features.mobile_favorites, false);
    assert.equal(features.mobile_feed, false);

    const perms = computeEffectivePermissions({
      roleName: 'client_admin',
      rolePermissions: ROLE_DEFAULT_PERMISSIONS.client_admin,
      features,
      applyFeatureGate: true,
    });

    assert.equal(perms.has('events.create'), true);
    assert.equal(perms.has('sessions.manage'), true);
    assert.equal(perms.has('media.upload'), true);
    assert.equal(perms.has('people_media.view'), true);
    assert.equal(perms.has('explore.manage'), true);
    assert.equal(perms.has('happening.manage'), true);
    assert.equal(perms.has('guests.export'), true);
    assert.equal(perms.has('watermark.manage'), false);
    assert.equal(perms.has('highlights.manage'), false);
    assert.equal(perms.has('notifications.send'), false);
    assert.equal(perms.has('plans.manage'), false);

    const modules = modulesFromAccess({ tier: 'client_admin', permissions: perms, features });
    assert.ok(modules.includes('dashboard'));
    assert.ok(modules.includes('events'));
    assert.ok(modules.includes('admins'));
    assert.ok(!modules.includes('plans'));
    assert.ok(!modules.includes('notifications'));
  });

  test('Plan II — Signature and Plan III — Elite features', () => {
    const sigFeatures = computeEffectiveFeatures(SIGNATURE_PLAN_FEATURES, null);
    assert.equal(sigFeatures.event_watermark, true);
    assert.equal(sigFeatures.event_highlights, true);
    assert.equal(sigFeatures.event_post_report, true);
    assert.equal(sigFeatures.push_notifications, true);
    assert.equal(sigFeatures.mobile_favorites, true);
    assert.equal(sigFeatures.mobile_feed, true);
    assert.equal(sigFeatures.ai_recognition, true);

    const eliteFeatures = computeEffectiveFeatures(ELITE_PLAN_FEATURES, null);
    for (const key of FEATURE_KEYS) {
      assert.equal(eliteFeatures[key], true);
    }
  });

  test('Standard plan quotas: Event Admins and Session Media Uploaders', () => {
    // Plan I — Essential: 2 admins (1 initial + 1 additional), 1 uploader
    assert.equal(STANDARD_PLAN_LIMITS.essential.max_event_admins, 2);
    assert.equal(STANDARD_PLAN_LIMITS.essential.max_session_media_uploaders, 1);

    // Plan II — Signature: 5 admins (1 initial + 4 additional), 3 uploaders
    assert.equal(STANDARD_PLAN_LIMITS.signature.max_event_admins, 5);
    assert.equal(STANDARD_PLAN_LIMITS.signature.max_session_media_uploaders, 3);

    // Plan III — Elite: 10 admins, 10 uploaders
    assert.equal(STANDARD_PLAN_LIMITS.elite.max_event_admins, 10);
    assert.equal(STANDARD_PLAN_LIMITS.elite.max_session_media_uploaders, 10);

    // Legacy slug mappings
    assert.equal(STANDARD_PLAN_LIMITS['media-sessions-only'].max_event_admins, 2);
    assert.equal(STANDARD_PLAN_LIMITS['media-sessions-only'].max_session_media_uploaders, 1);
    assert.equal(STANDARD_PLAN_LIMITS['pro-planner'].max_event_admins, 5);
    assert.equal(STANDARD_PLAN_LIMITS['pro-planner'].max_session_media_uploaders, 3);
    assert.equal(STANDARD_PLAN_LIMITS.enterprise.max_event_admins, 10);
    assert.equal(STANDARD_PLAN_LIMITS.enterprise.max_session_media_uploaders, 10);
  });

  test('Unique session uploader clustering correctly merges identical contacts', () => {
    function normalizeMobile(value: string | null | undefined): string {
      return (value ?? '').replace(/\D/g, '');
    }
    function normalizeEmail(value: string | null | undefined): string {
      return (value ?? '').trim().toLowerCase();
    }
    function mobilesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
      const ma = normalizeMobile(a);
      const mb = normalizeMobile(b);
      if (!ma || !mb) return false;
      if (ma === mb) return true;
      const short = ma.length <= mb.length ? ma : mb;
      const long = ma.length <= mb.length ? mb : ma;
      return short.length >= 8 && long.endsWith(short);
    }
    function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
      const ea = normalizeEmail(a);
      const eb = normalizeEmail(b);
      if (!ea || !eb) return false;
      return ea === eb;
    }
    function uploaderMatches(u: { mobile_number: string | null; email: string | null }, row: { mobile_number: string | null; email: string | null }) {
      return mobilesMatch(u.mobile_number, row.mobile_number) || emailsMatch(u.email, row.email);
    }
    function cluster(rows: Array<{ mobile_number: string | null; email: string | null }>) {
      const unique: Array<{ mobile_number: string | null; email: string | null }> = [];
      for (const r of rows) {
        if (!unique.some((u) => uploaderMatches(u, r))) unique.push(r);
      }
      return unique;
    }

    const rows = [
      { mobile_number: '+1 (555) 123-4567', email: null },
      { mobile_number: '5551234567', email: null }, // same mobile
      { mobile_number: null, email: 'user@example.com' },
      { mobile_number: null, email: 'USER@EXAMPLE.COM' }, // same email
      { mobile_number: '9876543210', email: 'other@example.com' }, // distinct
    ];
    const unique = cluster(rows);
    assert.equal(unique.length, 3);
  });

  test('Per-client feature overrides unlock a specific feature on top of base plan', () => {
    const features = computeEffectiveFeatures(ESSENTIAL_PLAN_FEATURES, {
      event_watermark: true,
      push_notifications: true,
    });
    assert.equal(features.event_watermark, true);
    assert.equal(features.push_notifications, true);
    assert.equal(features.event_highlights, false);

    const perms = computeEffectivePermissions({
      roleName: 'client_admin',
      rolePermissions: ROLE_DEFAULT_PERMISSIONS.client_admin,
      features,
      applyFeatureGate: true,
    });
    assert.equal(perms.has('watermark.manage'), true);
    assert.equal(perms.has('notifications.send'), true);
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
      features: ESSENTIAL_PLAN_FEATURES,
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

    const eventAFeatures = computeEffectiveFeatures(SIGNATURE_PLAN_FEATURES, null);
    const eventBFeatures = computeEffectiveFeatures(ESSENTIAL_PLAN_FEATURES, {
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
    assert.equal(eventBFeatures.ai_recognition, true);
    assert.equal(eventBFeatures.event_watermark, false);
    assert.equal(eventBFeatures.event_sessions, true);
  });
});
