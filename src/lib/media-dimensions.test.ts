import assert from 'node:assert/strict';
import test from 'node:test';
import { aspectRatio, readMediaDimensions } from './media-dimensions.ts';

test('aspect ratio is width divided by height', () => {
  assert.equal(aspectRatio(3000, 4000), 0.75);
  assert.equal(aspectRatio(1920, 1080), 1.7778);
  assert.equal(aspectRatio(0, 4000), null);
  assert.equal(aspectRatio(10.5, 20), null);
});

test('png stores width and height as displayed', () => {
  const bytes = Buffer.alloc(24);
  bytes.write('PNG', 1, 'ascii');
  bytes[0] = 0x89;
  bytes.writeUInt32BE(1920, 16);
  bytes.writeUInt32BE(1080, 20);
  assert.deepEqual(readMediaDimensions(bytes, 'image'), { width: 1920, height: 1080 });
});

test('jpeg portrait with exif orientation 6 swaps the sensor size', () => {
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    exifApp1(6),
    sof(4000, 3000),
    Buffer.from([0xff, 0xd9]),
  ]);
  assert.deepEqual(readMediaDimensions(jpeg, 'image'), { width: 3000, height: 4000 });
});

test('jpeg without rotation keeps sensor width and height', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), sof(3000, 4000), Buffer.from([0xff, 0xd9])]);
  assert.deepEqual(readMediaDimensions(jpeg, 'image'), { width: 3000, height: 4000 });
  assert.equal(aspectRatio(3000, 4000), 0.75);
});

test('mp4 landscape track stays landscape', () => {
  const mp4 = movieWithTrack(1920, 1080, false);
  assert.deepEqual(readMediaDimensions(mp4, 'video'), { width: 1920, height: 1080 });
});

test('mp4 rotation matrix turns a landscape track into portrait', () => {
  const mp4 = movieWithTrack(1920, 1080, true);
  assert.deepEqual(readMediaDimensions(mp4, 'video'), { width: 1080, height: 1920 });
});

test('missing or broken metadata does not throw', () => {
  assert.equal(readMediaDimensions(Buffer.from('not media'), 'image'), null);
  assert.equal(readMediaDimensions(Buffer.from('not media'), 'video'), null);
});

function sof(width: number, height: number): Buffer {
  const marker = Buffer.alloc(19);
  marker[0] = 0xff;
  marker[1] = 0xc0;
  marker.writeUInt16BE(17, 2);
  marker[4] = 8;
  marker.writeUInt16BE(height, 5);
  marker.writeUInt16BE(width, 7);
  return marker;
}

function exifApp1(orientation: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 12);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const marker = Buffer.alloc(4);
  marker[0] = 0xff;
  marker[1] = 0xe1;
  marker.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([marker, payload]);
}

function movieWithTrack(width: number, height: number, rotate90: boolean): Buffer {
  const tkhd = Buffer.alloc(84);
  tkhd[0] = 0;
  const fixed = (value: number) => Math.round(value * 65536);
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

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, payload]);
}
