import { DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import { rekognitionClient } from './people-media/rekognition';
import {
  BLOCKED_MODERATION_LABELS,
  evaluateModerationLabels,
  getModerationMinConfidence,
  type ModerationEvaluation,
} from '@/lib/moderation-rules';

export { BLOCKED_MODERATION_LABELS, evaluateModerationLabels, getModerationMinConfidence };
export type { ModerationEvaluation };

/**
 * Inspect an image buffer (direct image or sampled video frame) with AWS Rekognition.
 * Fails open only when AWS Rekognition is unconfigured or throws an unexpected transient error
 * so valid uploads are not bricked, while reliably blocking detected 18+ content.
 */
export async function detectExplicit18PlusContent(
  imageBytes: Buffer
): Promise<ModerationEvaluation> {
  const client = rekognitionClient();
  if (!client) {
    return { blocked: false, reason: null, labels: [], confidence: null };
  }

  const minConfidence = getModerationMinConfidence();
  let normalized = imageBytes;
  try {
    normalized = await sharp(imageBytes)
      .rotate()
      .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    // Fallback to raw bytes if sharp cannot decode the client-provided frame.
  }

  try {
    const res = await client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: normalized },
        MinConfidence: minConfidence,
      })
    );
    return evaluateModerationLabels(res.ModerationLabels ?? [], minConfidence);
  } catch (err) {
    console.warn('[moderation] DetectModerationLabels failed:', err);
    return { blocked: false, reason: null, labels: [], confidence: null };
  }
}
