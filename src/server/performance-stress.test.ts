import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { decryptToken, encryptKey } from '../lib/upload-token.ts';
import {
  ALL_FEATURES_ENABLED,
  ROLE_DEFAULT_PERMISSIONS,
  STARTER_MEDIA_FEATURES,
  computeEffectiveFeatures,
  computeEffectivePermissions,
} from '../lib/rbac.ts';
import {
  normalizeInstagramInput,
  normalizeLinkedInInput,
  resolveSocialLinks,
} from '../lib/user-event-profile.ts';
import { evaluateModerationLabels } from '../lib/moderation-rules.ts';

describe('Performance & stress tests across critical backend utilities', () => {
  test('1,000 encrypted/decrypted media tokens complete well under 500ms (cached scrypt key)', () => {
    const prevSecret = process.env.UPLOAD_TOKEN_SECRET;
    process.env.UPLOAD_TOKEN_SECRET = 'stress-test-upload-token-secret-123456';
    try {
      // Warm initial scrypt derivation once
      const warmupToken = encryptKey('events/warmup/photo.jpg');
      assert.ok(warmupToken);
      assert.equal(decryptToken(warmupToken), 'events/warmup/photo.jpg');

      const started = performance.now();
      for (let i = 0; i < 1000; i++) {
        const key = `events/evt-${i % 10}/sessions/ses-${i % 5}/2026/11/img-${i}.jpg`;
        const tok = encryptKey(key);
        assert.ok(tok, 'Expected token for valid secret');
        const roundTrip = decryptToken(tok);
        assert.equal(roundTrip, key);
      }
      const elapsedMs = performance.now() - started;
      assert.ok(elapsedMs < 500, `Token stress took too long: ${elapsedMs.toFixed(1)}ms`);
    } finally {
      if (prevSecret === undefined) delete process.env.UPLOAD_TOKEN_SECRET;
      else process.env.UPLOAD_TOKEN_SECRET = prevSecret;
    }
  });

  test('2,000 multi-tenant RBAC plan + permission evaluations stay fast and isolated', () => {
    const started = performance.now();
    for (let i = 0; i < 2000; i++) {
      const useStarter = i % 2 === 0;
      const features = computeEffectiveFeatures(
        useStarter ? STARTER_MEDIA_FEATURES : ALL_FEATURES_ENABLED,
        i % 4 === 0 ? { event_watermark: true } : null
      );
      const perms = computeEffectivePermissions({
        roleName: i % 3 === 0 ? 'photographer' : 'client_admin',
        rolePermissions:
          i % 3 === 0 ? ROLE_DEFAULT_PERMISSIONS.photographer : ROLE_DEFAULT_PERMISSIONS.client_admin,
        features,
        applyFeatureGate: true,
      });
      if (useStarter && i % 3 !== 0) {
        assert.equal(perms.has('highlights.manage'), false);
        assert.equal(perms.has('events.create'), true);
      }
    }
    const elapsedMs = performance.now() - started;
    assert.ok(elapsedMs < 250, `RBAC stress took too long: ${elapsedMs.toFixed(1)}ms`);
  });

  test('500 out-of-order duplicated upload chunks track contiguous next_chunk_index accurately', () => {
    const totalChunks = 500;
    const received = new Map<number, Buffer>();

    // Simulate out-of-order bursts + duplicates + retries
    for (let i = totalChunks - 1; i >= 0; i -= 2) {
      received.set(i, Buffer.from([i & 0xff]));
    }
    for (let i = 0; i < totalChunks; i += 2) {
      received.set(i, Buffer.from([i & 0xff]));
      received.set(i, Buffer.from([i & 0xff])); // idempotent retry
    }

    let nextChunkIndex = 0;
    while (received.has(nextChunkIndex)) nextChunkIndex++;
    assert.equal(nextChunkIndex, totalChunks);

    const assembled = Buffer.concat(
      Array.from({ length: totalChunks }, (_, idx) => received.get(idx)!)
    );
    assert.equal(assembled.length, totalChunks);
    assert.equal(assembled[499], 499 & 0xff);
  });

  test('1,000 social link normalizations and 18+ moderation label checks run under 150ms', () => {
    const started = performance.now();
    for (let i = 0; i < 1000; i++) {
      const ig = normalizeInstagramInput(`@guest_${i}`);
      const li = normalizeLinkedInInput(`guest-${i}`);
      assert.equal(ig.valid, true);
      assert.equal(li.valid, true);
      const resolved = resolveSocialLinks({ instagram_id: ig.value, linkedin_url: li.value });
      assert.equal(resolved.instagram_id, `guest_${i}`);
      assert.equal(resolved.linkedin_url, `https://www.linkedin.com/in/guest-${i}`);

      const mod = evaluateModerationLabels([
        { Name: i % 10 === 0 ? 'Explicit Nudity' : 'Formal Wear', Confidence: 92 },
      ]);
      assert.equal(mod.blocked, i % 10 === 0);
    }
    const elapsedMs = performance.now() - started;
    assert.ok(elapsedMs < 150, `Social + moderation stress took too long: ${elapsedMs.toFixed(1)}ms`);
  });
});
