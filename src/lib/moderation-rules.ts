export type ModerationLabelInput = {
  Name?: string;
  ParentName?: string;
  Confidence?: number;
};

/**
 * AWS Rekognition taxonomy labels treated as strict 18+ explicit / adult / graphic content.
 * Deliberately excludes wedding-safe categories such as "Suggestive" or "Swimwear or Underwear"
 * to prevent false positives on celebratory attire while strictly blocking 18+ explicit media.
 */
export const BLOCKED_MODERATION_LABELS = new Set<string>([
  'Explicit',
  'Explicit Nudity',
  'Explicit Sexual Activity',
  'Sexual Activity',
  'Nudity',
  'Illustrated Explicit Nudity',
  'Adult Toys',
  'Non-Explicit Nudity',
  'Non-Explicit Nudity of Intimate parts and Kissing',
  'Exposed Male Genitalia',
  'Exposed Female Genitalia',
  'Exposed Buttocks or Anus',
  'Exposed Female Nipple',
  'Graphic Male Nudity',
  'Graphic Female Nudity',
  'Pornography',
  'Graphic Violence',
  'Visually Disturbing',
  'Emaciated Bodies',
  'Corpses',
  'Hanging',
]);

export function getModerationMinConfidence(): number {
  const raw = Number(process.env.MODERATION_MIN_CONFIDENCE ?? '68');
  if (!Number.isFinite(raw) || raw < 40 || raw > 99) return 68;
  return raw;
}

export type ModerationEvaluation = {
  blocked: boolean;
  reason: string | null;
  labels: string[];
  confidence: number | null;
};

/**
 * Pure evaluator over AWS Rekognition moderation labels (unit-testable without AWS calls).
 */
export function evaluateModerationLabels(
  labels: ReadonlyArray<ModerationLabelInput>,
  minConfidence = getModerationMinConfidence()
): ModerationEvaluation {
  const matched: string[] = [];
  let maxConfidence: number | null = null;

  for (const label of labels) {
    const conf = typeof label.Confidence === 'number' ? label.Confidence : 0;
    if (conf < minConfidence) continue;
    const name = label.Name?.trim() ?? '';
    const parent = label.ParentName?.trim() ?? '';
    if (BLOCKED_MODERATION_LABELS.has(name) || BLOCKED_MODERATION_LABELS.has(parent)) {
      if (name) matched.push(name);
      else if (parent) matched.push(parent);
      if (maxConfidence === null || conf > maxConfidence) {
        maxConfidence = conf;
      }
    }
  }

  if (matched.length === 0) {
    return { blocked: false, reason: null, labels: [], confidence: null };
  }

  const uniqueLabels = Array.from(new Set(matched));
  return {
    blocked: true,
    reason: `Restricted 18+ content detected (${uniqueLabels[0]})`,
    labels: uniqueLabels,
    confidence: maxConfidence,
  };
}
