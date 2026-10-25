/** Pixel size read from an uploaded file. Orientation is already applied. */
export type PixelSize = { width: number; height: number };

const MAX_PIXELS = 20000;

export function aspectRatio(width: number, height: number): number | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width < 1 || height < 1 || width > MAX_PIXELS || height > MAX_PIXELS) return null;
  return Math.round((width / height) * 10000) / 10000;
}

/**
 * Read display width and height from image or video bytes.
 * JPEG EXIF orientation and MP4/MOV track rotation are applied.
 * Returns null when the file has no readable size. Does not throw.
 */
export function readMediaDimensions(bytes: Buffer, kind: 'image' | 'video'): PixelSize | null {
  try {
    const size = kind === 'video' ? readVideoSize(bytes) : readImageSize(bytes);
    if (!size || aspectRatio(size.width, size.height) == null) return null;
    return size;
  } catch {
    return null;
  }
}

function readImageSize(bytes: Buffer): PixelSize | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 10 && (bytes.toString('ascii', 0, 6) === 'GIF87a' || bytes.toString('ascii', 0, 6) === 'GIF89a')) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return readWebpSize(bytes);
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return readJpegSize(bytes);
  return null;
}

function readJpegSize(bytes: Buffer): PixelSize | null {
  let orientation = 1;
  let width = 0;
  let height = 0;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (marker === 0xe1) {
      const fromExif = exifOrientation(bytes.subarray(offset + 2, offset + length));
      if (fromExif) orientation = fromExif;
    }
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && length >= 7) {
      height = bytes.readUInt16BE(offset + 3);
      width = bytes.readUInt16BE(offset + 5);
    }
    offset += length;
  }
  if (width < 1 || height < 1) return null;
  if (orientation >= 5 && orientation <= 8) return { width: height, height: width };
  return { width, height };
}

function exifOrientation(app1: Buffer): number | null {
  if (app1.length < 14 || app1.toString('ascii', 0, 4) !== 'Exif') return null;
  const tiff = app1.subarray(6);
  const little = tiff.toString('ascii', 0, 2) === 'II';
  const big = tiff.toString('ascii', 0, 2) === 'MM';
  if (!little && !big) return null;
  const u16 = (index: number) => (little ? tiff.readUInt16LE(index) : tiff.readUInt16BE(index));
  const u32 = (index: number) => (little ? tiff.readUInt32LE(index) : tiff.readUInt32BE(index));
  if (tiff.length < 8 || u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd < 0 || ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let entry = 0; entry < count; entry += 1) {
    const at = ifd + 2 + entry * 12;
    if (at + 12 > tiff.length) break;
    if (u16(at) !== 0x0112) continue;
    const value = u16(at + 8);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

function readWebpSize(bytes: Buffer): PixelSize | null {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.length) break;
    if (type === 'VP8X' && size >= 10) {
      const width = 1 + (bytes[start + 4] | (bytes[start + 5] << 8) | (bytes[start + 6] << 16));
      const height = 1 + (bytes[start + 7] | (bytes[start + 8] << 8) | (bytes[start + 9] << 16));
      return { width, height };
    }
    if (type === 'VP8 ' && size >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a) {
      return {
        width: bytes.readUInt16LE(start + 6) & 0x3fff,
        height: bytes.readUInt16LE(start + 8) & 0x3fff,
      };
    }
    if (type === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
      const bits = bytes.readUInt32LE(start + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset = end + (size % 2);
  }
  return null;
}

function readVideoSize(bytes: Buffer): PixelSize | null {
  const found: PixelSize[] = [];
  walkBoxes(bytes, 0, bytes.length, found);
  if (found.length === 0) return null;
  return found.reduce((best, size) => (size.width * size.height > best.width * best.height ? size : best));
}

function walkBoxes(bytes: Buffer, start: number, end: number, found: PixelSize[]): void {
  let offset = start;
  while (offset + 8 <= end) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1 && offset + 16 <= end) {
      const wide = bytes.readUInt32BE(offset + 8) * 2 ** 32 + bytes.readUInt32BE(offset + 12);
      size = wide;
      header = 16;
    }
    if (size === 0) size = end - offset;
    if (size < header || offset + size > end) break;
    const contentStart = offset + header;
    const contentEnd = offset + size;
    if (type === 'moov' || type === 'trak') walkBoxes(bytes, contentStart, contentEnd, found);
    if (type === 'tkhd') {
      const sizeFromTrack = readTrackHeader(bytes.subarray(contentStart, contentEnd));
      if (sizeFromTrack) found.push(sizeFromTrack);
    }
    offset += size;
  }
}

function readTrackHeader(content: Buffer): PixelSize | null {
  if (content.length < 4) return null;
  const version = content[0];
  const matrixAt = version === 1 ? 52 : 40;
  const widthAt = matrixAt + 36;
  if (content.length < widthAt + 8) return null;
  let width = Math.round(content.readUInt32BE(widthAt) / 65536);
  let height = Math.round(content.readUInt32BE(widthAt + 4) / 65536);
  const a = content.readInt32BE(matrixAt) / 65536;
  const b = content.readInt32BE(matrixAt + 4) / 65536;
  const c = content.readInt32BE(matrixAt + 12) / 65536;
  const d = content.readInt32BE(matrixAt + 16) / 65536;
  if (Math.abs(a) < 0.5 && Math.abs(d) < 0.5 && (Math.abs(b) > 0.5 || Math.abs(c) > 0.5)) {
    const swapped = width;
    width = height;
    height = swapped;
  }
  if (width < 1 || height < 1) return null;
  return { width, height };
}
