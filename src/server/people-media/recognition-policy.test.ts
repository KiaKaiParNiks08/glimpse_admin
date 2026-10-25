import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GALLERY_ALGORITHM_VERSION,
  MATCH_SOURCE,
  imageFaceEvidence,
  isGenuineRecognitionSource,
  isLikelyUploaderAttributedMatch,
  mapAssetSource,
  nextCursor,
  recognitionComplete,
  shouldSkipFaceCompare,
  videoThumbnailEvidence,
} from './recognition-policy.ts';

test('uploader similarity 1 is not a genuine face match', () => {
  assert.equal(
    isLikelyUploaderAttributedMatch({
      similarity: 1,
      userId: 'u1',
      uploadedBy: 'u1',
    }),
    true
  );
  assert.equal(
    isLikelyUploaderAttributedMatch({
      similarity: 0.94,
      userId: 'u1',
      uploadedBy: 'u1',
      matchSource: MATCH_SOURCE.rekognition,
    }),
    false
  );
  assert.equal(
    isLikelyUploaderAttributedMatch({
      similarity: 1,
      userId: 'guest',
      uploadedBy: 'photographer',
    }),
    false
  );
});

test('my-media only treats rekognition rows as recognized', () => {
  assert.equal(isGenuineRecognitionSource('rekognition'), true);
  assert.equal(isGenuineRecognitionSource('legacy'), false);
  assert.equal(isGenuineRecognitionSource('uploader_attributed'), false);
  assert.equal(isGenuineRecognitionSource('vector'), false);
});

test('photographer gallery maps to session_media and posts stay user_post', () => {
  assert.equal(mapAssetSource('photographer'), 'session_media');
  assert.equal(mapAssetSource('user_post'), 'user_post');
});

test('graphics with no detected faces are not compared', () => {
  assert.equal(shouldSkipFaceCompare(0), true);
  assert.equal(shouldSkipFaceCompare(3), false);
});

test('a video poster is evidence, not a match by itself', () => {
  assert.deepEqual(videoThumbnailEvidence(), { frame_source: 'thumbnail', media_type: 'video' });
  assert.equal(imageFaceEvidence().frame_source, 'full_image');
});

test('paginated matching advances by the last id in the page', () => {
  assert.equal(nextCursor([{ id: 'a' }, { id: 'b' }]), 'b');
  assert.equal(nextCursor([]), null);
});

test('empty my-media is incomplete until the scan and media queue finish', () => {
  assert.equal(
    recognitionComplete({ referenceStatus: 'pending', scanStatus: 'pending', pendingAssets: 12 }),
    false
  );
  assert.equal(
    recognitionComplete({ referenceStatus: 'ready', scanStatus: 'complete', pendingAssets: 0 }),
    true
  );
  assert.equal(GALLERY_ALGORITHM_VERSION, 'rekognition_v2');
});
