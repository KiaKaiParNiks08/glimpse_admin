import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyRekognitionError, sanitizeRekognitionMessage } from './rekognition-errors.ts';

describe('classifyRekognitionError', () => {
  it('treats AccessDenied as permanent', () => {
    const classified = classifyRekognitionError({
      name: 'AccessDeniedException',
      message: 'User is not authorized to perform rekognition:DetectFaces',
      $metadata: { httpStatusCode: 400, requestId: 'req-1' },
    });
    assert.equal(classified.kind, 'access_denied');
    assert.equal(classified.permanent, true);
    assert.equal(classified.http_status, 400);
    assert.equal(classified.request_id, 'req-1');
  });

  it('treats invalid image format as permanent', () => {
    const classified = classifyRekognitionError({ name: 'InvalidImageFormatException', message: 'Request has invalid image format' });
    assert.equal(classified.kind, 'unsupported_format');
    assert.equal(classified.permanent, true);
  });

  it('treats throttling as retryable', () => {
    const classified = classifyRekognitionError({ name: 'ProvisionedThroughputExceededException', message: 'Rate exceeded' });
    assert.equal(classified.kind, 'throttled');
    assert.equal(classified.permanent, false);
  });

  it('redacts URLs and key-shaped tokens from messages', () => {
    const text = sanitizeRekognitionMessage('failed https://example.com/x?signature=abc AKIAIOSFODNN7EXAMPLE');
    assert.equal(text.includes('https://'), false);
    assert.equal(text.includes('AKIA'), false);
    assert.match(text, /\[redacted\]/);
  });
});
