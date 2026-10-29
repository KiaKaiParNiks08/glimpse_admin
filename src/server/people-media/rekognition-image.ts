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
