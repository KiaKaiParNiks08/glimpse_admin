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

/** Pre-column CompareFaces rows were defaulted to legacy. Uploader shortcuts were similarity 1. */
export const LEGACY_REKOGNITION_MIN_SIMILARITY = 0.8;

export function isDisplayableRecognitionMatch(source: string | null | undefined, similarity: number): boolean {
  if (source === MATCH_SOURCE.rekognition) return true;
  if (source === MATCH_SOURCE.uploaderAttributed || source === MATCH_SOURCE.vector) return false;
  if (source === MATCH_SOURCE.legacy || source == null || source === '' || source === 'unknown') {
    return similarity >= LEGACY_REKOGNITION_MIN_SIMILARITY && similarity < 0.999;
  }
  return false;
}

export function queueHasMore(result: {
  media_processed: number;
  media_failed: number;
  references_processed: number;
  references_failed: number;
  scans_processed: number;
  scans_failed: number;
  has_more?: boolean;
}): boolean {
  if (result.has_more) return true;
  return (
    result.media_processed +
      result.media_failed +
      result.references_processed +
      result.references_failed +
      result.scans_processed +
      result.scans_failed >
    0
  );
}

export const MAX_WORKER_CHAIN = 20;

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
  if (input.scanStatus !== 'complete') return false;
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
