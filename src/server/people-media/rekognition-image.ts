import sharp from 'sharp';

export type RekognitionImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'unknown';

/** Rekognition DetectFaces/CompareFaces Image.Bytes accepts JPEG and PNG only. */
export function sniffImageKind(bytes: Buffer): RekognitionImageKind {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF87a') return 'gif';
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF89a') return 'gif';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return 'unknown';
}

export function isRekognitionSupportedImage(kind: RekognitionImageKind): boolean {
  return kind === 'jpeg' || kind === 'png';
}

/**
 * Normalizes an image for Rekognition:
 * 1. Converts WebP/HEIC/GIF to JPEG so Rekognition accepts it.
 * 2. Auto-rotates image orientation based on EXIF tags.
 * 3. Resizes downscale (max 2048px) and compresses if bytes > 4.5MB, avoiding AWS Rekognition's 5MB limit.
 */
export async function normalizeImageForRekognition(
  bytes: Buffer
): Promise<{ bytes: Buffer; kind: RekognitionImageKind }> {
  const currentKind = sniffImageKind(bytes);
  const isLarge = bytes.length > 4.5 * 1024 * 1024;
  const isUnsupported = !isRekognitionSupportedImage(currentKind);

  if (!isLarge && !isUnsupported) {
    return { bytes, kind: currentKind };
  }

  try {
    const pipeline = sharp(bytes).rotate();
    if (isLarge) {
      pipeline.resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const converted = await pipeline.jpeg({ quality: 88 }).toBuffer();
    return { bytes: converted, kind: 'jpeg' };
  } catch (error) {
    console.warn('[people-media] sharp image normalization failed, using raw bytes', error);
    return { bytes, kind: currentKind };
  }
}
