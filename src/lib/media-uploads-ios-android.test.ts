import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_MEDIA_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  getExtensionFromMime,
  getMediaKind,
  mimeFromFilename,
  resolveUploadMime,
  validateDeclaredVideoDuration,
  validateMediaFile,
} from './upload-rules.ts';
import { readMediaDimensions } from './media-dimensions.ts';
import {
  isRekognitionSupportedImage,
  normalizeImageForRekognition,
  sniffImageKind,
} from '../server/people-media/rekognition-image.ts';

describe('iOS vs Android media uploads (extensions & MIME)', () => {
  describe('Extension ↔ MIME consistency & resolution', () => {
    it('resolves iOS camera & gallery image extensions (HEIC, HEIF) case-insensitively', () => {
      assert.equal(mimeFromFilename('IMG_0001.heic'), 'image/heic');
      assert.equal(mimeFromFilename('IMG_0002.HEIC'), 'image/heic');
      assert.equal(mimeFromFilename('IMG_0003.Heic'), 'image/heic');
      assert.equal(mimeFromFilename('photo.heif'), 'image/heif');
      assert.equal(mimeFromFilename('PHOTO.HEIF'), 'image/heif');
    });

    it('resolves iOS and Android video extensions (MOV, M4V, MP4, WebM, MKV, 3GP) case-insensitively', () => {
      assert.equal(mimeFromFilename('recording.mov'), 'video/quicktime');
      assert.equal(mimeFromFilename('RECORDING.MOV'), 'video/quicktime');
      assert.equal(mimeFromFilename('clip.m4v'), 'video/mp4');
      assert.equal(mimeFromFilename('video.mp4'), 'video/mp4');
      assert.equal(mimeFromFilename('video.webm'), 'video/webm');
      assert.equal(mimeFromFilename('screencast.mkv'), 'video/x-matroska');
      assert.equal(mimeFromFilename('old_phone.3gp'), 'video/3gpp');
      assert.equal(mimeFromFilename('OLD_PHONE.3GP'), 'video/3gpp');
    });

    it('resolves standard Android image extensions (JPG, JPEG, PNG, GIF, WEBP)', () => {
      assert.equal(mimeFromFilename('photo.jpg'), 'image/jpeg');
      assert.equal(mimeFromFilename('PHOTO.JPEG'), 'image/jpeg');
      assert.equal(mimeFromFilename('screenshot.png'), 'image/png');
      assert.equal(mimeFromFilename('animation.gif'), 'image/gif');
      assert.equal(mimeFromFilename('graphic.webp'), 'image/webp');
    });

    it('resolves upload MIME from content-type header or falls back to filename extension', () => {
      // 1. Explicit iOS MIME type supplied by picker
      assert.equal(resolveUploadMime('image/heic', 'image.heic'), 'image/heic');
      assert.equal(resolveUploadMime('video/quicktime', 'video.mov'), 'video/quicktime');

      // 2. iOS camera picker sending generic application/octet-stream with filename
      assert.equal(resolveUploadMime('application/octet-stream', 'IMG_4021.HEIC'), 'image/heic');
      assert.equal(resolveUploadMime('application/octet-stream', 'RPReplay_Final.MOV'), 'video/quicktime');
      assert.equal(resolveUploadMime('application/octet-stream', 'video.3gp'), 'video/3gpp');

      // 3. iOS camera picker sending no extension but valid MIME type
      assert.equal(resolveUploadMime('image/heic', 'temp_upload_file'), 'image/heic');
      assert.equal(resolveUploadMime('video/quicktime', 'temp_video_file'), 'video/quicktime');

      // 4. Android camera sending empty type with standard filename
      assert.equal(resolveUploadMime('', 'camera_123.jpg'), 'image/jpeg');
      assert.equal(resolveUploadMime('', 'recording_456.mp4'), 'video/mp4');

      // 5. Handles parameters in Content-Type (e.g. image/heic; charset=utf-8)
      assert.equal(resolveUploadMime('image/heic; charset=binary', 'file'), 'image/heic');
    });

    it('extracts correct storage file extensions for both iOS and Android types', () => {
      // iOS types
      assert.equal(getExtensionFromMime('image/heic'), '.heic');
      assert.equal(getExtensionFromMime('image/heif'), '.heif');
      assert.equal(getExtensionFromMime('video/quicktime'), '.mov');

      // Android & cross-platform types
      assert.equal(getExtensionFromMime('image/jpeg'), '.jpg');
      assert.equal(getExtensionFromMime('image/png'), '.png');
      assert.equal(getExtensionFromMime('image/webp'), '.webp');
      assert.equal(getExtensionFromMime('image/gif'), '.gif');
      assert.equal(getExtensionFromMime('video/mp4'), '.mp4');
      assert.equal(getExtensionFromMime('video/webm'), '.webm');
      assert.equal(getExtensionFromMime('video/x-matroska'), '.mkv');
      assert.equal(getExtensionFromMime('video/3gpp'), '.3gp');
      assert.equal(getExtensionFromMime('application/pdf'), '.pdf');

      // Unknown fallback
      assert.equal(getExtensionFromMime('unknown/unknown'), '.bin');
    });
  });

  describe('Validation & allow-list parity', () => {
    it('accepts all allowed iOS and Android image MIMEs in getMediaKind and ALLOWED_IMAGE_TYPES', () => {
      const expectedImageTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/heic',
        'image/heif',
      ];
      for (const mime of expectedImageTypes) {
        assert.ok(ALLOWED_IMAGE_TYPES.includes(mime as (typeof ALLOWED_IMAGE_TYPES)[number]));
        assert.equal(getMediaKind(mime), 'image');
      }
      assert.ok(ALLOWED_MEDIA_TYPES.includes('image/heic'));
      assert.ok(ALLOWED_MEDIA_TYPES.includes('image/heif'));
    });

    it('accepts all allowed iOS and Android video MIMEs in getMediaKind and ALLOWED_VIDEO_TYPES', () => {
      const expectedVideoTypes = [
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-matroska',
        'video/3gpp',
      ];
      for (const mime of expectedVideoTypes) {
        assert.ok(ALLOWED_VIDEO_TYPES.includes(mime as (typeof ALLOWED_VIDEO_TYPES)[number]));
        assert.equal(getMediaKind(mime), 'video');
      }
    });

    it('validates image uploads within size limits (10MB) for iOS and Android', () => {
      // Valid iOS HEIC up to 10MB
      assert.equal(validateMediaFile({ type: 'image/heic', size: 5 * 1024 * 1024 }, 'image'), null);
      assert.equal(validateMediaFile({ type: 'image/heic', size: MAX_IMAGE_SIZE_BYTES }, 'image'), null);

      // Oversized HEIC > 10MB
      const heicOversized = validateMediaFile(
        { type: 'image/heic', size: MAX_IMAGE_SIZE_BYTES + 1 },
        'image'
      );
      assert.match(heicOversized ?? '', /image file too large/i);

      // Empty file
      const emptyFile = validateMediaFile({ type: 'image/heic', size: 0 }, 'image');
      assert.match(emptyFile ?? '', /too small or empty/i);

      // Valid Android JPEG
      assert.equal(validateMediaFile({ type: 'image/jpeg', size: 2 * 1024 * 1024 }, 'image'), null);
    });

    it('validates video uploads within size limits (50MB) and duration limits (120s)', () => {
      // Valid iOS MOV up to 50MB
      assert.equal(validateMediaFile({ type: 'video/quicktime', size: 30 * 1024 * 1024 }, 'video'), null);
      assert.equal(validateMediaFile({ type: 'video/quicktime', size: MAX_VIDEO_SIZE_BYTES }, 'video'), null);

      // Oversized MOV > 50MB
      const movOversized = validateMediaFile(
        { type: 'video/quicktime', size: MAX_VIDEO_SIZE_BYTES + 1 },
        'video'
      );
      assert.match(movOversized ?? '', /video file too large/i);

      // Valid Android MP4 & MKV
      assert.equal(validateMediaFile({ type: 'video/mp4', size: 45 * 1024 * 1024 }, 'video'), null);
      assert.equal(validateMediaFile({ type: 'video/x-matroska', size: 10 * 1024 * 1024 }, 'video'), null);
      assert.equal(validateMediaFile({ type: 'video/3gpp', size: 5 * 1024 * 1024 }, 'video'), null);

      // Duration checks (max 120s)
      assert.equal(validateDeclaredVideoDuration(15), null);
      assert.equal(validateDeclaredVideoDuration(120), null);
      assert.match(validateDeclaredVideoDuration(121) ?? '', /at most 120 seconds/i);
      assert.match(validateDeclaredVideoDuration(0) ?? '', /must be provided/i);
      assert.match(validateDeclaredVideoDuration(-10) ?? '', /must be provided/i);
    });

    it('rejects unsupported media formats with clear messages', () => {
      const invalidPdfAsImage = validateMediaFile({ type: 'application/pdf', size: 1000 }, 'image');
      assert.match(invalidPdfAsImage ?? '', /Invalid image type/i);
      assert.match(invalidPdfAsImage ?? '', /image\/heic/);

      const invalidExeAsVideo = validateMediaFile({ type: 'application/x-msdownload', size: 1000 }, 'video');
      assert.match(invalidExeAsVideo ?? '', /Invalid video type/i);
      assert.match(invalidExeAsVideo ?? '', /video\/quicktime/);

      assert.equal(getMediaKind('application/zip'), null);
      assert.equal(getMediaKind('audio/mpeg'), null);
    });
  });

  describe('HEIC spatial extents and MOV dimension extraction', () => {
    function buildMockHeic(width: number, height: number): Buffer {
      const box = (type: string, data: Buffer): Buffer => {
        const header = Buffer.alloc(8);
        header.writeUInt32BE(8 + data.length, 0);
        header.write(type, 4, 'ascii');
        return Buffer.concat([header, data]);
      };

      // 1. ftyp box with major brand 'heic'
      const ftypPayload = Buffer.alloc(8);
      ftypPayload.write('heic', 0, 'ascii');
      ftypPayload.writeUInt32BE(0, 4); // minor version
      const ftyp = box('ftyp', ftypPayload);

      // 2. ispe box: 4 bytes version/flags, 4 bytes width, 4 bytes height
      const ispePayload = Buffer.alloc(12);
      ispePayload.writeUInt32BE(0, 0); // version/flags
      ispePayload.writeUInt32BE(width, 4);
      ispePayload.writeUInt32BE(height, 8);
      const ispe = box('ispe', ispePayload);

      // 3. Nest in ipco > iprp > meta
      const ipco = box('ipco', ispe);
      const iprp = box('iprp', ipco);
      const meta = box('meta', iprp);

      return Buffer.concat([ftyp, meta]);
    }

    function buildMockQuickTimeMov(width: number, height: number, rotate90: boolean): Buffer {
      const box = (type: string, data: Buffer): Buffer => {
        const header = Buffer.alloc(8);
        header.writeUInt32BE(8 + data.length, 0);
        header.write(type, 4, 'ascii');
        return Buffer.concat([header, data]);
      };

      const tkhd = Buffer.alloc(84);
      tkhd[0] = 0; // version 0
      const fixed = (v: number) => Math.round(v * 65536);
      if (rotate90) {
        tkhd.writeInt32BE(0, 40);
        tkhd.writeInt32BE(fixed(1), 44);
        tkhd.writeInt32BE(fixed(-1), 52);
        tkhd.writeInt32BE(0, 56);
      } else {
        tkhd.writeInt32BE(fixed(1), 40);
        tkhd.writeInt32BE(0, 44);
        tkhd.writeInt32BE(0, 52);
        tkhd.writeInt32BE(fixed(1), 56);
      }
      tkhd.writeInt32BE(fixed(1), 72);
      tkhd.writeUInt32BE(fixed(width), 76);
      tkhd.writeUInt32BE(fixed(height), 80);

      const trak = box('trak', box('tkhd', tkhd));
      return box('moov', trak);
    }

    it('reads dimensions from ISOBMFF HEIC spatial extents (ispe) box', () => {
      const mockHeic = buildMockHeic(4032, 3024);
      const dim = readMediaDimensions(mockHeic, 'image');
      assert.deepEqual(dim, { width: 4032, height: 3024 });
    });

    it('reads dimensions from QuickTime MOV track headers with orientation transform', () => {
      // Landscape MOV video
      const landscapeMov = buildMockQuickTimeMov(1920, 1080, false);
      assert.deepEqual(readMediaDimensions(landscapeMov, 'video'), { width: 1920, height: 1080 });

      // Portrait MOV video (e.g. shot vertically on iPhone with 90deg matrix)
      const portraitMov = buildMockQuickTimeMov(1920, 1080, true);
      assert.deepEqual(readMediaDimensions(portraitMov, 'video'), { width: 1080, height: 1920 });
    });

    it('handles truncated or corrupted HEIC and MOV buffers gracefully without throwing', () => {
      assert.equal(readMediaDimensions(Buffer.from('not an image'), 'image'), null);
      assert.equal(readMediaDimensions(Buffer.from([0, 0, 0, 10, 0x66, 0x74, 0x79, 0x70]), 'image'), null);
      assert.equal(readMediaDimensions(Buffer.from('corrupt video stream'), 'video'), null);
    });
  });

  describe('Rekognition image sniffing and normalization for HEIC & Android formats', () => {
    it('accurately identifies image format via sniffing', () => {
      // JPEG
      assert.equal(sniffImageKind(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'jpeg');
      // PNG
      assert.equal(sniffImageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
      // WebP
      const webp = Buffer.alloc(12);
      webp.write('RIFF', 0);
      webp.write('WEBP', 8);
      assert.equal(sniffImageKind(webp), 'webp');
      // HEIC
      const heicHeader = Buffer.alloc(12);
      heicHeader.writeUInt32BE(12, 0);
      heicHeader.write('ftyp', 4, 'ascii');
      heicHeader.write('heic', 8, 'ascii');
      assert.equal(sniffImageKind(heicHeader), 'heic');
    });

    it('distinguishes formats natively accepted by AWS Rekognition vs needing normalization', () => {
      assert.equal(isRekognitionSupportedImage('jpeg'), true);
      assert.equal(isRekognitionSupportedImage('png'), true);

      // HEIC, WebP, GIF are unsupported directly by Rekognition DetectFaces and must be transcoded
      assert.equal(isRekognitionSupportedImage('heic'), false);
      assert.equal(isRekognitionSupportedImage('webp'), false);
      assert.equal(isRekognitionSupportedImage('gif'), false);
    });

    it('keeps Rekognition-supported images untouched when small', async () => {
      const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const res = await normalizeImageForRekognition(tinyPng);
      assert.equal(res.kind, 'png');
      assert.equal(res.bytes, tinyPng);
    });
  });
});
