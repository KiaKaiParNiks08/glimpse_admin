import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRekognitionSupportedImage, sniffImageKind } from './rekognition-image.ts';

describe('sniffImageKind', () => {
  it('detects jpeg and png as Rekognition-supported', () => {
    assert.equal(sniffImageKind(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'jpeg');
    assert.equal(isRekognitionSupportedImage('jpeg'), true);
    assert.equal(sniffImageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
    assert.equal(isRekognitionSupportedImage('png'), true);
  });

  it('rejects webp and gif for DetectFaces Image.Bytes', () => {
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0);
    webp.write('WEBP', 8);
    assert.equal(sniffImageKind(webp), 'webp');
    assert.equal(isRekognitionSupportedImage('webp'), false);
    assert.equal(sniffImageKind(Buffer.from('GIF89a')), 'gif');
    assert.equal(isRekognitionSupportedImage('gif'), false);
  });
});
