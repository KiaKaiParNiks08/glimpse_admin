import sharp from 'sharp';

export type RekognitionImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'heic' | 'unknown';

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
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii').toLowerCase();
    if (
      brand === 'heic' ||
      brand === 'heix' ||
      brand === 'hevc' ||
      brand === 'hevx' ||
      brand === 'mif1' ||
      brand === 'msf1'
    ) {
      return 'heic';
    }
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
  try {
    const instance = sharp(bytes);
    const meta = await instance.metadata();
    const hasExifOrientation = Boolean(meta.orientation && meta.orientation > 1);
    const isLarge = bytes.length > 4.5 * 1024 * 1024;
    const isUnsupported = !isRekognitionSupportedImage(currentKind);

    if (!hasExifOrientation && !isLarge && !isUnsupported) {
      return { bytes, kind: currentKind };
    }

    const pipeline = sharp(bytes).rotate();
    if (isLarge || (meta.width && meta.width > 2048) || (meta.height && meta.height > 2048)) {
      pipeline.resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const converted = await pipeline.jpeg({ quality: 90 }).toBuffer();
    return { bytes: converted, kind: 'jpeg' };
  } catch (error) {
    console.warn('[people-media] sharp image normalization failed, using raw bytes', error);
    return { bytes, kind: currentKind };
  }
}

/**
 * Extracts a detected face region from an image with padding around the bounding box.
 * Normalizes coordinates ([0, 1]) and handles boundary clamping and auto-rotation.
 */
export async function extractFaceCrop(
  imageBytes: Buffer,
  box: { left: number; top: number; width: number; height: number },
  paddingPct = 0.20
): Promise<Buffer | null> {
  try {
    const image = sharp(imageBytes).rotate();
    const meta = await image.metadata();
    const imgWidth = meta.width;
    const imgHeight = meta.height;
    if (!imgWidth || !imgHeight) return null;

    // Convert normalized [0, 1] coordinates to pixels
    const faceW = box.width * imgWidth;
    const faceH = box.height * imgHeight;
    const faceX = box.left * imgWidth;
    const faceY = box.top * imgHeight;

    const padX = faceW * paddingPct;
    const padY = faceH * paddingPct;

    const left = Math.max(0, Math.floor(faceX - padX));
    const top = Math.max(0, Math.floor(faceY - padY));
    const width = Math.min(imgWidth - left, Math.ceil(faceW + 2 * padX));
    const height = Math.min(imgHeight - top, Math.ceil(faceH + 2 * padY));

    if (width <= 10 || height <= 10) return null;

    return await sharp(imageBytes)
      .rotate()
      .extract({ left, top, width, height })
      .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: false })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (err) {
    console.error('[people-media] extractFaceCrop failed:', err);
    return null;
  }
}
