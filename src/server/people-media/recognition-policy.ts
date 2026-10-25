export const GALLERY_ALGORITHM_VERSION = 'rekognition_v2';

export const MATCH_SOURCE = {
  rekognition: 'rekognition',
  vector: 'vector',
  legacy: 'legacy',
  uploaderAttributed: 'uploader_attributed',
} as const;

export type MatchSource = (typeof MATCH_SOURCE)[keyof typeof MATCH_SOURCE];

export type RecognitionStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'revoked';

export function isGenuineRecognitionSource(source: string | null | undefined): boolean {
  return source === MATCH_SOURCE.rekognition;
}

export function isLikelyUploaderAttributedMatch(input: {
  similarity: number;
  userId: string;
  uploadedBy: string | null | undefined;
  matchSource?: string | null;
}): boolean {
  if (input.matchSource === MATCH_SOURCE.uploaderAttributed) return true;
  if (input.matchSource === MATCH_SOURCE.rekognition) return false;
  if (!input.uploadedBy || input.uploadedBy !== input.userId) return false;
  return input.similarity >= 0.999;
}

export function mapAssetSource(source: string): 'session_media' | 'user_post' {
  return source === 'user_post' ? 'user_post' : 'session_media';
}

export function shouldSkipFaceCompare(faceCount: number): boolean {
  return faceCount <= 0;
}

export function nextCursor<T extends { id: string }>(page: T[]): string | null {
  if (page.length === 0) return null;
  return page[page.length - 1]?.id ?? null;
}

export function recognitionComplete(input: {
  referenceStatus: string | null;
  scanStatus: string | null;
  pendingAssets: number;
}): boolean {
  if (input.referenceStatus !== 'ready') return false;
  if (input.scanStatus && input.scanStatus !== 'complete') return false;
  return input.pendingAssets === 0;
}

export type VideoFrameEvidence = {
  frame_source: 'thumbnail';
  media_type: 'video';
};

export type ImageFaceEvidence = {
  frame_source: 'full_image';
  media_type: 'image';
  bounding_box?: { width?: number; height?: number; left?: number; top?: number };
};

export function videoThumbnailEvidence(): VideoFrameEvidence {
  return { frame_source: 'thumbnail', media_type: 'video' };
}

export function imageFaceEvidence(box?: ImageFaceEvidence['bounding_box']): ImageFaceEvidence {
  return { frame_source: 'full_image', media_type: 'image', bounding_box: box };
}
